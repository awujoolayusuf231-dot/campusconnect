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
  });
});
