import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeNotification, NotificationsPage, type Notif } from "./NotificationsPage";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  insert: vi.fn(),
  getPushNotificationStatus: vi.fn(),
  requestPushPermission: vi.fn(),
  enablePushNotifications: vi.fn(),
  disablePushNotifications: vi.fn(),
  showPushTestNotification: vi.fn(),
  configStatus: "invalid" as "invalid" | "configured" | "missing",
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { user_id: "user-1" }, error: null }),
        }),
      }),
      update: mocks.update,
      insert: mocks.insert,
    }),
  },
}));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));
vi.mock("@/features/push/pushNotifications", () => ({
  disablePushNotifications: mocks.disablePushNotifications,
  enablePushNotifications: mocks.enablePushNotifications,
  getPushNotificationStatus: mocks.getPushNotificationStatus,
  requestPushPermission: mocks.requestPushPermission,
  showPushTestNotification: mocks.showPushTestNotification,
}));
vi.mock("@/features/push/pushConfig", () => ({
  getFirebaseBrowserConfigStatus: () => mocks.configStatus,
  PUSH_CONFIG_MISCONFIGURED_MESSAGE: "Push notifications are misconfigured.",
}));

const descriptors = {
  notification: Object.getOwnPropertyDescriptor(window, "Notification"),
  serviceWorker: Object.getOwnPropertyDescriptor(navigator, "serviceWorker"),
  pushManager: Object.getOwnPropertyDescriptor(window, "PushManager"),
  secureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configStatus = "invalid";
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.update.mockImplementation((values: Record<string, boolean>) => ({
    eq: (column: string, value: string) => {
      mocks.updateEq(column, value);
      return Promise.resolve({ error: null, values });
    },
  }));
  mocks.insert.mockResolvedValue({ error: null });
  mocks.getPushNotificationStatus.mockResolvedValue(false);
  mocks.requestPushPermission.mockResolvedValue("granted");
  mocks.enablePushNotifications.mockResolvedValue(undefined);
  mocks.disablePushNotifications.mockResolvedValue(undefined);
  mocks.showPushTestNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(descriptors)) {
    const target = key === "serviceWorker" ? navigator : window;
    const property = key === "notification" ? "Notification"
      : key === "serviceWorker" ? "serviceWorker"
      : key === "pushManager" ? "PushManager"
      : "isSecureContext";
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  }
});

function notification(
  type: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
  entityType: string | null = ({
    followed_post: "post",
    like: "post",
    repost: "post",
    comment: "post",
    follow: "user",
    message: "conversation",
    community_join: "community",
    project_application: "project",
    discussion_reply: "assignment_discussion",
    celebration_reminder: "celebration",
    celebration_published: "celebration",
  } as Record<string, string>)[type] ?? null,
): Notif {
  return {
    id: 1,
    type,
    actor_username: "amina",
    actor_display_name: "Amina Bello",
    entity_type: entityType,
    entity_id: entityId,
    data,
    created_at: "2026-11-16T12:00:00.000Z",
    read_at: null,
  };
}

describe("describeNotification", () => {
  it("links followed-post notifications to the post", () => {
    expect(describeNotification(notification("followed_post", "post-1"))).toEqual({
      text: "Amina Bello shared a new post",
      to: "/app/p/post-1",
    });
  });

  it("uses the push route mapping for in-app notification links", () => {
    expect(describeNotification(notification("like", "post-1")).to).toBe("/app/p/post-1");
    expect(describeNotification(notification("repost", "post-1")).to).toBe("/app/p/post-1");
    expect(describeNotification(notification("comment", "post-1")).to).toBe("/app/p/post-1");
    expect(describeNotification(notification("message", "conversation-1")).to).toBe("/app/messages/conversation-1");
    expect(describeNotification(notification("follow", "user-1")).to).toBe("/app/u/amina");
    expect(describeNotification(notification("project_application", "project-1")).to).toBe("/app/projects/project-1");
    expect(describeNotification(notification("discussion_reply", "discussion-1", { course_id: "course-1" })).to)
      .toBe("/app/assignment-discussions/courses/course-1?discussion=discussion-1");
    expect(describeNotification(notification("unknown", "item-1")).to).toBe("/app/notifications");
    expect(describeNotification(notification("message", null)).to).toBe("/app/notifications");
  });

  it("links published celebrations to their card and safely falls back to a generic title", () => {
    expect(describeNotification(notification("celebration_published", "card-1", { title: "Graduation day" }))).toEqual({
      text: "Amina Bello shared a celebration: Graduation day",
      to: "/app/celebrations/card-1",
    });
    expect(describeNotification(notification("celebration_published", null))).toEqual({
      text: "Amina Bello shared a celebration: new celebration",
      to: "/app/notifications",
    });
  });

  describe("NotificationsPage push configuration", () => {
    it("shows a misconfiguration error without querying push status", async () => {
      mocks.rpc.mockResolvedValue({ data: [], error: null });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(createElement(MemoryRouter, null,
        createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
      ));

      expect(await screen.findByText("Push notifications are misconfigured.")).toBeInTheDocument();
      expect(mocks.getPushNotificationStatus).not.toHaveBeenCalled();
    });

    it("shows a test button only for a registered device and sends the local test notification", async () => {
      mocks.configStatus = "configured";
      mocks.getPushNotificationStatus.mockResolvedValue(true);
      Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted" } });
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
      Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(createElement(MemoryRouter, null,
        createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
      ));

      const testButton = await screen.findByRole("button", { name: "Send test notification" });
      fireEvent.click(testButton);

      expect(await screen.findByText("Notifications enabled. A test notification was sent.")).toBeInTheDocument();
      expect(mocks.showPushTestNotification).toHaveBeenCalledOnce();
    });

    it("sends a test notification after enabling succeeds", async () => {
      mocks.configStatus = "configured";
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: { permission: "default" },
      });
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
      Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(createElement(MemoryRouter, null,
        createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
      ));

      fireEvent.click(await screen.findByRole("button", { name: "Enable on this device" }));

      expect(mocks.requestPushPermission).toHaveBeenCalledOnce();
      expect(await screen.findByText("Notifications enabled. A test notification was sent.")).toBeInTheDocument();
      expect(mocks.enablePushNotifications).toHaveBeenCalledWith(expect.any(Promise), "user-1");
    });

    it("updates only the selected preference column without updating the owner id", async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(createElement(MemoryRouter, null,
        createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
      ));

      fireEvent.click(await screen.findByRole("checkbox", { name: "New followers" }));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ notify_follows: false }));
      expect(mocks.updateEq).toHaveBeenCalledWith("user_id", "user-1");
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("lets a user explicitly opt in to email activity notifications", async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(createElement(MemoryRouter, null,
        createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
      ));

      fireEvent.click(await screen.findByRole("checkbox", { name: "Email activity notifications" }));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ notify_email: true }));
      expect(mocks.updateEq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("keeps marketing consent separate and only saves it after explicit opt-in", async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(createElement(MemoryRouter, null,
        createElement(QueryClientProvider, { client }, createElement(NotificationsPage)),
      ));

      const marketingConsent = await screen.findByRole("checkbox", {
        name: "Campus news and product updates (marketing)",
      });
      expect(marketingConsent).not.toBeChecked();
      fireEvent.click(marketingConsent);

      await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ marketing_email_consent: true }));
      expect(mocks.updateEq).toHaveBeenCalledWith("user_id", "user-1");
    });
  });
});
