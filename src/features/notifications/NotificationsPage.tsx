import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { timeAgo } from "@/lib/time";
import { LoadingState } from "@/app/LoadingState";
import { disablePushNotifications, enablePushNotifications, getPushNotificationStatus, isBrowserPushConfigured, requestPushPermission } from "@/features/push/pushNotifications";

export interface Notif { id: number; type: string; actor_username: string | null; actor_display_name: string | null; entity_type: string | null; entity_id: string | null; data: Record<string, unknown>; created_at: string; read_at: string | null }
const PAGE = 30;
const PREFS: [string, string, boolean?][] = [
  ["notify_follows", "New followers"],
  ["notify_likes", "Likes"],
  ["notify_comments", "Comments"],
  ["notify_community", "Community activity"],
  ["notify_messages", "Messages"],
  ["notify_discussions", "Assignment discussion replies"],
  ["notify_followed_posts", "New posts from people I follow", false],
  ["notify_celebrations", "Celebration cards"],
  ["notify_push", "Browser push notifications"],
];

export function describeNotification(n: Notif): { text: string; to?: string } {
  const who = n.actor_display_name ?? "Someone";
  switch (n.type) {
    case "follow": return { text: `${who} started following you`, to: n.actor_username ? `/app/u/${n.actor_username}` : undefined };
    case "followed_post": return { text: `${who} shared a new post`, to: n.entity_id ? `/app/p/${n.entity_id}` : undefined };
    case "like": return { text: `${who} liked your post` };
    case "repost": return { text: `${who} reposted your post` };
    case "comment": return { text: `${who} commented on your post` };
    case "discussion_reply": return {
      text: `${who} replied to your course discussion`,
      to: typeof n.data.course_id === "string" && n.entity_id
        ? `/app/assignment-discussions/courses/${n.data.course_id}?discussion=${n.entity_id}`
        : "/app/assignment-discussions",
    };
    case "celebration_reminder": return {
      text: `Reminder: ${String(n.data.title ?? "an upcoming celebration")}`,
      to: n.entity_id ? `/app/celebrations/${n.entity_id}` : "/app/celebrations",
    };
    case "celebration_published": return {
      text: `${who} shared a celebration: ${String(n.data.title ?? "new celebration")}`,
      to: n.entity_id ? `/app/celebrations/${n.entity_id}` : "/app/celebrations",
    };
    case "community_join": return { text: `${who} joined your community`, to: "/app/communities" };
    case "message": return { text: `${who} sent you a message`, to: n.entity_id ? `/app/messages/${n.entity_id}` : "/app/messages" };
    case "announcement": return { text: `Announcement: ${String(n.data.title ?? "")}` };
    case "moderation_warning": return { text: `A moderator sent you a warning: ${String(n.data.reason ?? "")}` };
    default: return { text: "New notification" };
  }
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const list = useInfiniteQuery({ queryKey: ["notifications"], initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => { const { data, error } = await supabase.rpc("notifications_list", { p_before: pageParam, p_limit: PAGE }); if (error) throw error; return (data ?? []) as Notif[]; },
    getNextPageParam: (last): number | undefined => (last.length === PAGE ? last[last.length - 1]?.id : undefined) });
  const items = list.data?.pages.flat() ?? [];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); void qc.invalidateQueries({ queryKey: ["unread"] }); };
  const markAll = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("mark_notifications_read"); if (error) throw error; }, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: async (id: number) => { const { error } = await supabase.rpc("mark_notifications_read", { p_ids: [id] }); if (error) throw error; }, onSuccess: refresh });
  const prefs = useQuery({ queryKey: ["prefs", uid], enabled: !!uid, queryFn: async () => { const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", uid).maybeSingle(); if (error) throw error; return (data ?? {}) as Record<string, boolean>; } });
  const savePref = useMutation({ mutationFn: async (v: { key: string; on: boolean }) => {
    const { error } = await supabase.from("user_preferences").upsert({ user_id: uid, [v.key]: v.on }, { onConflict: "user_id" });
    if (error) {
      console.error("Could not save notification preference.", error);
      throw error;
    }
  }, onSuccess: () => void qc.invalidateQueries({ queryKey: ["prefs"] }) });
  const pushStatus = useQuery({ queryKey: ["push-subscription", uid], enabled: !!uid && isBrowserPushConfigured(), queryFn: getPushNotificationStatus });
  const enablePush = useMutation({ mutationFn: (permissionRequest: Promise<NotificationPermission>) => enablePushNotifications(permissionRequest, uid), onSuccess: () => void qc.invalidateQueries({ queryKey: ["push-subscription", uid] }) });
  const disablePush = useMutation({ mutationFn: () => disablePushNotifications(uid), onSuccess: () => void qc.invalidateQueries({ queryKey: ["push-subscription", uid] }) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Notifications</h1><button className="btn" disabled={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</button></div>
      {list.isLoading && <LoadingState label="Gathering your notifications" variant="panel" />}
      {list.isError && <p role="alert" className="err">Could not load notifications.</p>}
      {!list.isLoading && items.length === 0 && <p className="card text-center text-muted">You are all caught up.</p>}
      <ul className="space-y-2">{items.map((n) => { const d = describeNotification(n); const body = <><span className={n.read_at ? "" : "font-semibold"}>{d.text}</span><span className="ml-2 text-xs text-muted">{timeAgo(n.created_at)}</span></>;
        return <li key={n.id} className={`card flex items-center justify-between gap-2 ${n.read_at ? "" : "border-primary"}`}>
          {d.to ? <Link to={d.to} onClick={() => markOne.mutate(n.id)} className="flex-1 hover:underline">{body}</Link> : <span className="flex-1">{body}</span>}
          {!n.read_at && <button className="text-xs underline text-muted" onClick={() => markOne.mutate(n.id)}>Mark read</button>}</li>; })}</ul>
      {list.hasNextPage && <button className="btn w-full" onClick={() => void list.fetchNextPage()}>Load more</button>}
      <section className="card space-y-2"><h2 className="font-medium">Notify me about</h2>
        {PREFS.map(([key, label, defaultValue]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.data?.[key] ?? defaultValue ?? true} disabled={savePref.isPending} onChange={(e) => savePref.mutate({ key, on: e.target.checked })} />{label}</label>)}
        <p className="text-xs text-muted">Platform announcements and moderator warnings are always delivered.</p>
        {savePref.isError && <p role="alert" className="err">Could not save your preference: {(savePref.error as Error).message}</p>}</section>
      <section className="card space-y-2"><h2 className="font-medium">This device</h2>
        {!isBrowserPushConfigured() ? <p className="text-sm text-muted">Browser push is not configured for this app yet.</p>
          : pushStatus.isLoading ? <LoadingState label="Checking this device" />
            : pushStatus.isError ? <p role="alert" className="err">Could not check this device's push status: {(pushStatus.error as Error).message}</p>
              : <><p className="text-sm text-muted">{pushStatus.data ? "This device is registered for browser push." : "This device is not registered for browser push."}</p>
                {typeof Notification !== "undefined" && Notification.permission === "denied" && <p className="text-xs text-muted">Notifications are blocked in your browser settings. Allow them for CampusConnect to enable push.</p>}
                {typeof Notification !== "undefined" && Notification.permission === "default" && <p className="text-xs text-muted">Select “Enable on this device”; your browser will then ask you to allow notifications.</p>}
                <button className="btn min-h-10 rounded-xl px-4 font-bold" disabled={enablePush.isPending || disablePush.isPending}
                  onClick={() => {
                    if (pushStatus.data) {
                      disablePush.mutate();
                      return;
                    }
                    enablePush.mutate(requestPushPermission());
                  }}>
                  {enablePush.isPending || disablePush.isPending ? "Updating…" : pushStatus.data ? "Disable on this device" : "Enable on this device"}
                </button>
                {enablePush.isError && <p role="alert" className="err">Could not enable notifications: {(enablePush.error as Error).message}</p>}
                {disablePush.isError && <p role="alert" className="err">Could not disable notifications: {(disablePush.error as Error).message}</p>}</>}
      </section>
    </div>
  );
}
