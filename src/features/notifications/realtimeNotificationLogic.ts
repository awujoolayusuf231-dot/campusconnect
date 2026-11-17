type NotificationPreference =
  | "notify_follows"
  | "notify_likes"
  | "notify_comments"
  | "notify_community"
  | "notify_messages"
  | "notify_discussions";

const shownNotificationKeys = new Set<string>();
const MAX_SHOWN_NOTIFICATION_KEYS = 200;

const preferenceByType: Record<string, NotificationPreference | "notify_followed_posts" | "notify_celebrations"> = {
  follow: "notify_follows",
  like: "notify_likes",
  repost: "notify_likes",
  comment: "notify_comments",
  community_join: "notify_community",
  message: "notify_messages",
  discussion_reply: "notify_discussions",
  followed_post: "notify_followed_posts",
  celebration_reminder: "notify_celebrations",
  celebration_published: "notify_celebrations",
};

export type NotificationPreferences = Partial<Record<
  NotificationPreference | "notify_push" | "notify_followed_posts" | "notify_celebrations",
  boolean
>>;

export function notificationAllowedByPreferences(
  type: string,
  preferences: NotificationPreferences,
): boolean {
  if (preferences.notify_push === false) return false;
  const category = preferenceByType[type];
  return !category || preferences[category] !== false;
}

export function claimNotificationForDisplay(id?: string | number | null, fallbackTag?: string): boolean {
  const key = id !== undefined && id !== null && String(id)
    ? `notification:${String(id)}`
    : fallbackTag
    ? `tag:${fallbackTag}`
    : null;
  if (!key || shownNotificationKeys.has(key)) return false;
  shownNotificationKeys.add(key);
  if (shownNotificationKeys.size > MAX_SHOWN_NOTIFICATION_KEYS) {
    const oldestKey = shownNotificationKeys.values().next().value as string | undefined;
    if (oldestKey) shownNotificationKeys.delete(oldestKey);
  }
  return true;
}

export function catchUpPresentation(count: number): "none" | "individual" | "summary" {
  if (count < 1) return "none";
  return count <= 3 ? "individual" : "summary";
}

export function clearShownNotificationsForTests(): void {
  shownNotificationKeys.clear();
}
