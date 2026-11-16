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

export function pushCopy(type: string): { title: string; body: string; url: string } {
  return {
    title: "CampusConnect",
    body: type === "message"
      ? "You have a new message."
      : type === "celebration_reminder"
      ? "You have a celebration reminder."
      : "You have a new update.",
    url: "/app/notifications",
  };
}
