import { notificationRoute } from "../../../supabase/functions/_shared/notificationRoute";

export type NotificationCopyInput = {
  type: string;
  actor_username: string | null;
  actor_display_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
};

export function describeNotification(n: NotificationCopyInput): { text: string; to: string } {
  const who = n.actor_display_name ?? "Someone";
  const to = notificationRoute({
    type: n.type,
    entityType: n.entity_type,
    entityId: n.entity_id,
    actorUsername: n.actor_username,
    data: n.data,
  });
  switch (n.type) {
    case "follow": return { text: `${who} started following you`, to };
    case "followed_post": return { text: `${who} shared a new post`, to };
    case "like": return { text: `${who} liked your post`, to };
    case "repost": return { text: `${who} reposted your post`, to };
    case "comment": return { text: `${who} commented on your post`, to };
    case "discussion_reply": return { text: `${who} replied to your course discussion`, to };
    case "celebration_reminder": return {
      text: `Reminder: ${String(n.data.title ?? "an upcoming celebration")}`,
      to,
    };
    case "celebration_published": return {
      text: `${who} shared a celebration: ${String(n.data.title ?? "new celebration")}`,
      to,
    };
    case "voice_invitation": return {
      text: `${who} invited you to join ${String(n.data.title ?? "a Voice Space")}`,
      to,
    };
    case "community_join": return { text: `${who} joined your community`, to };
    case "message": return { text: `${who} sent you a message`, to };
    case "project_application": return { text: `${who} applied to your project`, to };
    case "announcement": return { text: `Announcement: ${String(n.data.title ?? "CampusConnect update")}`, to };
    case "moderation_warning": return { text: `A moderator sent you a warning: ${String(n.data.reason ?? "")}`, to };
    default: return { text: "New notification", to };
  }
}
