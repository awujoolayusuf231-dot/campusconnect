import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPermission: vi.fn(),
}));

vi.mock("@firebase/app", () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(),
}));
vi.mock("@firebase/messaging", () => ({
  deleteToken: vi.fn(),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  isSupported: vi.fn(),
  onMessage: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("./pushConfig", () => ({
  getFirebaseBrowserConfig: vi.fn(() => null),
  getPushServiceWorkerUrl: vi.fn(() => "/sw.js"),
  isBrowserPushConfigured: vi.fn(() => false),
}));

import { requestPushPermission } from "./pushNotifications";

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");

describe("requestPushPermission", () => {
  beforeEach(() => {
    mocks.requestPermission.mockClear();
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: mocks.requestPermission,
    });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    mocks.requestPermission.mockResolvedValue("granted");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (serviceWorkerDescriptor) Object.defineProperty(navigator, "serviceWorker", serviceWorkerDescriptor);
    else Reflect.deleteProperty(navigator, "serviceWorker");
    if (secureContextDescriptor) Object.defineProperty(window, "isSecureContext", secureContextDescriptor);
    else Reflect.deleteProperty(window, "isSecureContext");
  });

  it("requests permission immediately from the invoking user action", async () => {
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
