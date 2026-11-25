import { describe, expect, it } from "vitest";
import { notificationRoute, safeAppPath } from "../../../supabase/functions/_shared/notificationRoute";

describe("notificationRoute", () => {
  it.each([
    ["message", "conversation", "/app/messages/conversation%2F1"],
    ["like", "post", "/app/p/post%2F1"],
    ["repost", "post", "/app/p/post%2F1"],
    ["comment", "post", "/app/p/post%2F1"],
    ["project_application", "project", "/app/projects/project%2F1"],
    ["celebration_reminder", "celebration", "/app/celebrations/card%2F1"],
  ])("maps %s/%s to its app route", (type, entityType, route) => {
    expect(notificationRoute({
      type,
      entityType,
      entityId: type === "message" ? "conversation/1" : type === "like" || type === "repost" || type === "comment" ? "post/1" : type === "project_application" ? "project/1" : "card/1",
    })).toBe(route);
  });

  it("uses the username for follow links and course metadata for discussion links", () => {
    expect(notificationRoute({
      type: "follow",
      entityType: "user",
      entityId: "user-id",
      actorUsername: "amina bello",
    })).toBe("/app/u/amina%20bello");
    expect(notificationRoute({
      type: "discussion_reply",
      entityType: "assignment_discussion",
      entityId: "discussion/1",
      data: { course_id: "course/1" },
    })).toBe("/app/assignment-discussions/courses/course%2F1?discussion=discussion%2F1");
    expect(notificationRoute({
      type: "community_join",
      entityType: "community",
      entityId: "community-id",
    })).toBe("/app/communities");
  });

  it("falls back to the notifications screen for missing IDs, unknown types, and unmatched entity types", () => {
    expect(notificationRoute({ type: "message", entityType: "conversation", entityId: null })).toBe("/app/notifications");
    expect(notificationRoute({ type: "unknown", entityType: "unknown", entityId: "1" })).toBe("/app/notifications");
    expect(notificationRoute({ type: "message", entityType: "project", entityId: "1" })).toBe("/app/notifications");
    expect(notificationRoute({ type: "follow", entityType: "user", entityId: "1" })).toBe("/app/notifications");
  });

  it("rejects paths that normalize outside the app", () => {
    expect(safeAppPath("/app/../login")).toBe("/app/notifications");
    expect(safeAppPath("/app/messages/1?view=latest")).toBe("/app/messages/1?view=latest");
    expect(safeAppPath("https://example.com/app/messages/1")).toBe("/app/notifications");
  });
});
