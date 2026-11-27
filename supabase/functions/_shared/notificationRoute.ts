export type NotificationRouteInput = {
  type: string;
  entityType: string | null;
  entityId: string | null;
  actorUsername?: string | null;
  data?: Record<string, unknown> | null;
};

const NOTIFICATIONS_URL = "/app/notifications";
const APP_ORIGIN = "https://campusconnect.invalid";

export function safeAppPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/app/")) return NOTIFICATIONS_URL;
  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN || !url.pathname.startsWith("/app/")) return NOTIFICATIONS_URL;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return NOTIFICATIONS_URL;
  }
}

export function notificationRoute({
  type,
  entityType,
  entityId,
  actorUsername,
  data,
}: NotificationRouteInput): string {
  if (!entityId) return NOTIFICATIONS_URL;

  const encodedId = encodeURIComponent(entityId);
  let route: string | undefined;
  switch (type) {
    case "message":
      if (entityType === "conversation") route = `/app/messages/${encodedId}`;
      break;
    case "like":
    case "repost":
    case "comment":
    case "followed_post":
      if (entityType === "post") route = `/app/p/${encodedId}`;
      break;
    case "follow":
      if (entityType === "user" && actorUsername) route = `/app/u/${encodeURIComponent(actorUsername)}`;
      break;
    case "community_join":
      if (entityType === "community") route = "/app/communities";
      break;
    case "project_application":
      if (entityType === "project") route = `/app/projects/${encodedId}`;
      break;
    case "voice_invitation":
      if (entityType === "voice_room") route = `/app/voice-spaces/${encodedId}`;
      break;
    case "discussion_reply": {
      const courseId = data?.course_id;
      if (entityType === "assignment_discussion" && typeof courseId === "string" && courseId) {
        route = `/app/assignment-discussions/courses/${encodeURIComponent(courseId)}?discussion=${encodedId}`;
      }
      break;
    }
    case "celebration_reminder":
    case "celebration_published":
      if (entityType === "celebration") route = `/app/celebrations/${encodedId}`;
      break;
  }

  return safeAppPath(route);
}
