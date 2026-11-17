import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPermission: vi.fn(),
  getFirebaseBrowserConfig: vi.fn((): {
    apiKey: string;
    appId: string;
    messagingSenderId: string;
    projectId: string;
    vapidKey: string;
  } | null => null),
  getFirebaseBrowserConfigStatus: vi.fn((): "configured" | "missing" | "invalid" => "configured"),
  getPushServiceWorkerUrl: vi.fn(() => "/firebase-messaging-sw.js"),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "test-app" })),
  getMessaging: vi.fn(() => ({ name: "test-messaging" })),
  getToken: vi.fn(),
  isSupported: vi.fn(),
  onMessage: vi.fn(),
  showNotification: vi.fn(),
  deleteToken: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@firebase/app", () => ({
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}));
vi.mock("@firebase/messaging", () => ({
  deleteToken: mocks.deleteToken,
  getMessaging: mocks.getMessaging,
  getToken: mocks.getToken,
  isSupported: mocks.isSupported,
  onMessage: mocks.onMessage,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./pushConfig", () => ({
  getFirebaseBrowserConfig: mocks.getFirebaseBrowserConfig,
  getFirebaseBrowserConfigStatus: mocks.getFirebaseBrowserConfigStatus,
  getPushServiceWorkerUrl: mocks.getPushServiceWorkerUrl,
  PUSH_CONFIG_MISCONFIGURED_MESSAGE: "Push notifications are misconfigured.",
  isBrowserPushConfigured: vi.fn(() => false),
}));

import {
  disablePushNotifications,
  enablePushNotifications,
  requestPushPermission,
  listenForForegroundPushNotifications,
  showPushTestNotification,
  syncPushSubscription,
} from "./pushNotifications";

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");
const registration = { installing: null, waiting: null, showNotification: mocks.showNotification };
const messaging = { name: "test-messaging" };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.getPushServiceWorkerUrl.mockReturnValue("/firebase-messaging-sw.js");
  mocks.getFirebaseBrowserConfigStatus.mockReturnValue("configured");
  mocks.getFirebaseBrowserConfig.mockReturnValue({
    apiKey: "web-api-key",
    appId: "web-app-id",
    messagingSenderId: "web-sender-id",
    projectId: "campusconnect-project",
    vapidKey: "public-vapid-key",
  });
  mocks.getApps.mockReturnValue([]);
  mocks.initializeApp.mockReturnValue({ name: "test-app" });
  mocks.getMessaging.mockReturnValue(messaging);
  mocks.isSupported.mockResolvedValue(true);
  mocks.getToken.mockResolvedValue("fcm-token");
  mocks.showNotification.mockResolvedValue(undefined);
  mocks.deleteToken.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve({ showNotification: mocks.showNotification }),
    },
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: mocks.requestPermission,
  });
  mocks.requestPermission.mockResolvedValue("granted");
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (serviceWorkerDescriptor) Object.defineProperty(navigator, "serviceWorker", serviceWorkerDescriptor);
  else Reflect.deleteProperty(navigator, "serviceWorker");
  if (secureContextDescriptor) Object.defineProperty(window, "isSecureContext", secureContextDescriptor);
  else Reflect.deleteProperty(window, "isSecureContext");
});

describe("requestPushPermission", () => {
  it("requests permission immediately from the invoking user action", async () => {
    mocks.requestPermission.mockClear();
    const permission = requestPushPermission();

    expect(mocks.requestPermission).toHaveBeenCalledOnce();
    await expect(permission).resolves.toBe("granted");
  });

  it("does not prompt again when permission was already denied", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: mocks.requestPermission,
    });

    await expect(requestPushPermission()).resolves.toBe("denied");
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });
});

describe("push subscription registration", () => {
  it("sends a local test notification through the service worker", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mocks.requestPermission,
    });

    await showPushTestNotification();

    expect(mocks.showNotification).toHaveBeenCalledWith("Notifications are on", {
      body: "You'll get alerts from CampusConnect here.",
      tag: "push-test",
      icon: "/icons/campusconnect-192.png",
      data: { url: "/app/notifications" },
    });
  });

  it("does not attempt a test notification without granted permission", async () => {
    await expect(showPushTestNotification()).rejects.toThrow("Allow notifications");
    expect(mocks.getMessaging).not.toHaveBeenCalled();
    expect(mocks.showNotification).not.toHaveBeenCalled();
  });

  it("shows foreground data-only messages with their tag and safe route", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mocks.requestPermission,
    });
    mocks.onMessage.mockImplementation((_messaging, handler) => {
      handler({
        data: {
          title: "New message",
          body: "Amina sent you a message",
          url: "/app/messages/conversation-1",
          tag: "message:conversation-1",
        },
      });
      return () => {};
    });

    await listenForForegroundPushNotifications();
    await vi.waitFor(() => expect(mocks.showNotification).toHaveBeenCalledWith(
      "New message",
      expect.objectContaining({
        body: "Amina sent you a message",
        tag: "message:conversation-1",
        renotify: true,
        data: { url: "/app/messages/conversation-1" },
      }),
    ));
  });

  it("uses a toast for visible messages and suppresses duplicate FCM deliveries", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const showToast = vi.fn();
    let receiveMessage: ((payload: { data?: Record<string, string> }) => void) | undefined;
    mocks.onMessage.mockImplementation((_messaging, handler) => {
      receiveMessage = handler;
      return () => {};
    });

    await listenForForegroundPushNotifications(showToast);
    const payload = {
      data: {
        title: "New message",
        body: "Amina sent you a message",
        url: "/app/messages/conversation-1",
        tag: "message:conversation-1",
        notification_id: "foreground-notification-1",
      },
    };
    receiveMessage?.(payload);
    receiveMessage?.(payload);

    expect(showToast).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledWith({
      id: "foreground-notification-1",
      title: "New message",
      text: "Amina sent you a message",
      to: "/app/messages/conversation-1",
    });
    expect(mocks.showNotification).not.toHaveBeenCalled();
    visibility.mockRestore();
  });

  it("rejects malformed configuration before initializing Firebase", async () => {
    mocks.getFirebaseBrowserConfigStatus.mockReturnValue("invalid");
    mocks.getFirebaseBrowserConfig.mockReturnValue(null);

    await expect(enablePushNotifications(Promise.resolve("granted"), "user-1"))
      .rejects.toThrow("Push notifications are misconfigured.");

    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.getMessaging).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("registers the FCM token through the RPC read by the outbox worker", async () => {
    await enablePushNotifications(Promise.resolve("granted"), "user-1");

    expect(mocks.rpc).toHaveBeenCalledWith("register_push_subscription", { p_token: "fcm-token" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("register_push_token", expect.anything());
    expect(mocks.getToken).toHaveBeenCalledWith(messaging, {
      vapidKey: "public-vapid-key",
      serviceWorkerRegistration: registration,
    });
    expect(localStorage.getItem("campusconnect-push-token")).toBe("fcm-token");
    expect(localStorage.getItem("campusconnect-push-enabled-user")).toBe("user-1");
  });

  it("logs and surfaces RPC failures without deleting the FCM token", async () => {
    const rpcError = new Error("registration denied");
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(enablePushNotifications(Promise.resolve("granted"), "user-1")).rejects.toBe(rpcError);

    expect(logError).toHaveBeenCalledWith("CampusConnect push subscription registration failed.", rpcError);
    expect(mocks.deleteToken).not.toHaveBeenCalled();
    expect(localStorage.getItem("campusconnect-push-token")).toBeNull();
  });

  it("unregisters the token and preserves the user's opt-out", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mocks.requestPermission,
    });
    await enablePushNotifications(Promise.resolve("granted"), "user-1");
    mocks.rpc.mockClear();

    await disablePushNotifications("user-1");
    await syncPushSubscription("user-1");

    expect(mocks.rpc).toHaveBeenCalledWith("unregister_push_subscription", { p_token: "fcm-token" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("register_push_subscription", expect.anything());
    expect(mocks.deleteToken).toHaveBeenCalledWith(messaging);
    expect(localStorage.getItem("campusconnect-push-token")).toBeNull();
    expect(localStorage.getItem("campusconnect-push-enabled-user")).toBeNull();
  });

  it("refreshes an opted-in user's token on authenticated app startup", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mocks.requestPermission,
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await syncPushSubscription("user-1");

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "has_push_subscription");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "register_push_subscription", { p_token: "fcm-token" });
  });

  it("does not re-enable a device that has been explicitly opted out", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mocks.requestPermission,
    });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await syncPushSubscription("user-1");

    expect(mocks.rpc).toHaveBeenCalledWith("has_push_subscription");
    expect(mocks.rpc).not.toHaveBeenCalledWith("register_push_subscription", expect.anything());
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
