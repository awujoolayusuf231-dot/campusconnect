import { describe, expect, it } from "vitest";
import { describeNotification, type Notif } from "./NotificationsPage";

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
