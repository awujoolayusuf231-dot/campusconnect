import { describe, expect, it } from "vitest";
import {
  decideDelivery,
  effectiveAccountStatus,
  isLocalSupabaseUrl,
  preferenceForNotification,
  pushCopy,
  pushData,
  shouldSendPush,
  webpushHeaders,
} from "./pushOutboxLogic";

describe("push outbox decisions", () => {
  it("includes the notification ID as a string and applies message-specific FCM lifetime headers", () => {
    const copy = pushCopy("message", "Amina", "conversation", "conversation-1");
    const data = pushData(copy, "123456");

    expect(data).toEqual({
      title: "New message",
      body: "Amina sent you a message",
      url: "/app/messages/conversation-1",
      tag: "message:conversation-1",
      notification_id: "123456",
    });
    expect(Object.values(data).every((value) => typeof value === "string")).toBe(true);
    expect(webpushHeaders("message")).toEqual({ TTL: "259200", Urgency: "high" });
    expect(webpushHeaders("like")).toEqual({ TTL: "259200", Urgency: "normal" });
  });

  it("builds specific private-safe push copy, routes, and message tags", () => {
    expect(pushCopy("message", "Amina", "conversation", "conv/1")).toEqual({
      title: "New message",
      body: "Amina sent you a message",
      url: "/app/messages/conv%2F1",
      tag: "message:conv/1",
    });
    expect(pushCopy("like", "Amina", "post", "post-1").body).toBe("Amina liked your post");
    expect(pushCopy("repost", "Amina", "post", "post-1").body).toBe("Amina reposted your post");
    expect(pushCopy("comment", "Amina", "post", "post-1").body).toBe("Amina commented on your post");
    expect(pushCopy("follow", "Amina", "user", "user-1", "amina").body).toBe("Amina started following you");
    expect(pushCopy("community_join", "Amina", "community", "community-1").body).toBe("Amina joined your community");
    expect(pushCopy("project_application", "Amina", "project", "project-1").body).toBe("Amina applied to your project");
    expect(pushCopy("discussion_reply", "Amina", "assignment_discussion", "discussion-1", null, {
      course_id: "course-1",
    })).toMatchObject({
      body: "Amina replied to your discussion",
      url: "/app/assignment-discussions/courses/course-1?discussion=discussion-1",
    });
    expect(pushCopy("celebration_reminder", null, "celebration", "card-1")).toEqual({
      title: "CampusConnect",
      body: "You have a celebration reminder.",
      url: "/app/celebrations/card-1",
      tag: "",
    });
    expect(pushCopy("voice_invitation", "Amina", "voice_room", "room-1", null, { title: "Study session" })).toEqual({
      title: "Voice Space invitation",
      body: "Amina invited you to join Study session",
      url: "/app/voice-spaces/room-1",
      tag: "",
    });
  });

  it("falls back to a safe generic copy and truncates actor names", () => {
    const copy = pushCopy("message", "a".repeat(45), "conversation", "conversation-1");
    expect(copy).toEqual({
      title: "New message",
      body: `${"a".repeat(40)} sent you a message`,
      url: "/app/messages/conversation-1",
      tag: "message:conversation-1",
    });
    expect(pushCopy("message", null, "conversation", "conv-1").body).toBe("Someone sent you a message");
    expect(pushCopy("unknown", "Amina", "unknown", "item-1")).toMatchObject({
      title: "CampusConnect",
      body: "You have a new update.",
      url: "/app/notifications",
      tag: "",
    });
    expect(Object.values(copy).every((value) => typeof value === "string")).toBe(true);
  });

  it("rechecks category preferences for all user-controlled notification groups", () => {
    expect(preferenceForNotification("follow")).toBe("notify_follows");
    expect(preferenceForNotification("repost")).toBe("notify_likes");
    expect(preferenceForNotification("discussion_reply")).toBe("notify_discussions");
    expect(preferenceForNotification("celebration_reminder")).toBe("notify_celebrations");
    expect(preferenceForNotification("voice_invitation")).toBe("notify_voice");
    expect(preferenceForNotification("project_application")).toBe("notify_collaboration");
  });

  it("allows only eligible accounts with push enabled and no block", () => {
    const eligible = {
      pushEnabled: true,
      categoryEnabled: true,
      accountStatus: "active",
      blocked: false,
    };
    expect(shouldSendPush(eligible)).toBe(true);
    expect(shouldSendPush({ ...eligible, accountStatus: "restricted" })).toBe(true);
    expect(shouldSendPush({ ...eligible, pushEnabled: false })).toBe(false);
    expect(shouldSendPush({ ...eligible, categoryEnabled: false })).toBe(false);
    expect(shouldSendPush({ ...eligible, accountStatus: "suspended" })).toBe(false);
    expect(shouldSendPush({ ...eligible, blocked: true })).toBe(false);
  });

  it("treats expired restrictions as active, matching account_effective_status", () => {
    const now = Date.parse("2026-01-02T00:00:00Z");
    expect(effectiveAccountStatus("restricted", "2026-01-01T00:00:00Z", now)).toBe("active");
    expect(effectiveAccountStatus("suspended", null, now)).toBe("suspended");
  });

  it("blocks local and non-HTTPS Supabase URLs from real push delivery", () => {
    expect(isLocalSupabaseUrl("http://kong:8000")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("https://example.supabase.co")).toBe(false);
  });

  it("retries total transient failures but avoids retrying successful partial delivery", () => {
    expect(decideDelivery([])).toEqual({ result: "failed", error: "no_registered_devices" });
    expect(decideDelivery([{
      ok: false,
      invalidToken: false,
      retryable: true,
      failureCode: "UNAVAILABLE",
    }])).toEqual({ result: "retry", error: "fcm_delivery_failed:UNAVAILABLE" });
    expect(decideDelivery([
      { ok: true, invalidToken: false, retryable: false, failureCode: null },
      { ok: false, invalidToken: false, retryable: true, failureCode: "UNAVAILABLE" },
    ])).toEqual({ result: "delivered", error: null });
    expect(decideDelivery([{
      ok: false,
      invalidToken: true,
      retryable: false,
      failureCode: "UNREGISTERED",
    }]).result).toBe("failed");
  });
});
