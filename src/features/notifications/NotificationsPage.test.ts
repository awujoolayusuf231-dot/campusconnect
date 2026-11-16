import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { describeNotification, NotificationsPage, type Notif } from "./NotificationsPage";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getPushNotificationStatus: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: {}, error: null }),
        }),
      }),
    }),
  },
}));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));
vi.mock("@/features/push/pushNotifications", () => ({
  disablePushNotifications: vi.fn(),
  enablePushNotifications: vi.fn(),
  getPushNotificationStatus: mocks.getPushNotificationStatus,
  requestPushPermission: vi.fn(),
}));
vi.mock("@/features/push/pushConfig", () => ({
  getFirebaseBrowserConfigStatus: () => "invalid",
  PUSH_CONFIG_MISCONFIGURED_MESSAGE: "Push notifications are misconfigured.",
}));

function notification(type: string, entityId: string | null, data: Record<string, unknown> = {}): Notif {
  return {
    id: 1,
    type,
    actor_username: "amina",
    actor_display_name: "Amina Bello",
    entity_type: null,
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
  });

  it("links published celebrations to their card and safely falls back to a generic title", () => {
    expect(describeNotification(notification("celebration_published", "card-1", { title: "Graduation day" }))).toEqual({
      text: "Amina Bello shared a celebration: Graduation day",
      to: "/app/celebrations/card-1",
    });
    expect(describeNotification(notification("celebration_published", null))).toEqual({
      text: "Amina Bello shared a celebration: new celebration",
      to: "/app/celebrations",
    });
  });
});
