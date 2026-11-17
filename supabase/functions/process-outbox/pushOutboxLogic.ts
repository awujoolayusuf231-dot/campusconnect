import { notificationRoute } from "../_shared/notificationRoute.ts";

export type NotificationPreference =
  | "notify_follows"
  | "notify_likes"
  | "notify_comments"
  | "notify_community"
  | "notify_messages"
  | "notify_discussions";

export type DeviceResult = {
  ok: boolean;
  invalidToken: boolean;
  retryable: boolean;
  failureCode: string | null;
};

export type DeliveryDecision = {
  result: "delivered" | "retry" | "failed";
  error: string | null;
};

export type PushCopy = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function pushData(copy: PushCopy, notificationId: string): Record<string, string> {
  return {
    title: copy.title,
    body: copy.body,
    url: copy.url,
    tag: copy.tag,
    notification_id: notificationId,
  };
}

export function webpushHeaders(notificationType: string): { TTL: string; Urgency: "high" | "normal" } {
  return {
    TTL: "259200",
    Urgency: notificationType === "message" ? "high" : "normal",
  };
}

export function preferenceForNotification(type: string): NotificationPreference | null {
  switch (type) {
    case "follow":
      return "notify_follows";
    case "like":
    case "repost":
      return "notify_likes";
    case "comment":
      return "notify_comments";
    case "community_join":
      return "notify_community";
    case "message":
      return "notify_messages";
    case "discussion_reply":
      return "notify_discussions";
    default:
      return null;
  }
}

export function effectiveAccountStatus(
  status: string | null,
  restrictedUntil: string | null,
  now = Date.now(),
): string | null {
  if (
    (status === "restricted" || status === "suspended")
    && restrictedUntil !== null
    && Date.parse(restrictedUntil) < now
  ) {
    return "active";
  }
  return status;
}

export function shouldSendPush(input: {
  pushEnabled: boolean;
  categoryEnabled: boolean;
  accountStatus: string | null;
  blocked: boolean;
}): boolean {
  return input.pushEnabled
    && input.categoryEnabled
    && (input.accountStatus === "active" || input.accountStatus === "restricted")
    && !input.blocked;
}

export function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol !== "https:"
      || host === "localhost"
      || host.endsWith(".localhost")
      || host === "127.0.0.1"
      || host === "[::1]"
      || host === "kong"
      || host.endsWith(".local");
  } catch {
    return true;
  }
}

export function decideDelivery(results: DeviceResult[]): DeliveryDecision {
  if (results.length === 0) {
    return { result: "failed", error: "no_registered_devices" };
  }
  if (results.some((result) => result.ok)) {
    return { result: "delivered", error: null };
  }
  if (results.some((result) => result.retryable)) {
    const failureCodes = [...new Set(
      results
        .filter((result) => result.retryable && result.failureCode)
        .map((result) => result.failureCode)
        .filter((code): code is string => code !== null),
    )].slice(0, 3);
    return {
      result: "retry",
      error: failureCodes.length ? `fcm_delivery_failed:${failureCodes.join(",")}` : "fcm_delivery_failed",
    };
  }
  return { result: "failed", error: "all_devices_unregistered" };
}

export function pushCopy(
  type: string,
  actorName: string | null = null,
  entityType: string | null = null,
  entityId: string | null = null,
  actorUsername: string | null = null,
  data: Record<string, unknown> | null = null,
): { title: string; body: string; url: string; tag: string } {
  const name = (actorName?.trim() || "Someone").slice(0, 40);
  const url = notificationRoute({ type, entityType, entityId, actorUsername, data });

  switch (type) {
    case "message":
      return { title: "New message", body: `${name} sent you a message`, url, tag: entityId ? `message:${entityId}` : "" };
    case "like":
      return { title: "New like", body: `${name} liked your post`, url, tag: "" };
    case "repost":
      return { title: "New repost", body: `${name} reposted your post`, url, tag: "" };
    case "comment":
      return { title: "New comment", body: `${name} commented on your post`, url, tag: "" };
    case "follow":
      return { title: "New follower", body: `${name} started following you`, url, tag: "" };
    case "community_join":
      return { title: "Community update", body: `${name} joined your community`, url, tag: "" };
    case "project_application":
      return { title: "New project application", body: `${name} applied to your project`, url, tag: "" };
    case "discussion_reply":
      return { title: "Discussion reply", body: `${name} replied to your discussion`, url, tag: "" };
    case "celebration_reminder":
      return { title: "CampusConnect", body: "You have a celebration reminder.", url, tag: "" };
    default:
      return { title: "CampusConnect", body: "You have a new update.", url, tag: "" };
  }
}
