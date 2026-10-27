import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { timeAgo } from "@/lib/time";

interface Notif { id: number; type: string; actor_username: string | null; actor_display_name: string | null; entity_type: string | null; entity_id: string | null; data: Record<string, unknown>; created_at: string; read_at: string | null }
const PAGE = 30;
const PREFS: [string, string][] = [["notify_follows", "New followers"], ["notify_likes", "Likes"], ["notify_comments", "Comments"], ["notify_community", "Community activity"], ["notify_messages", "Messages"]];

function describe(n: Notif): { text: string; to?: string } {
  const who = n.actor_display_name ?? "Someone";
  switch (n.type) {
    case "follow": return { text: `${who} started following you`, to: n.actor_username ? `/app/u/${n.actor_username}` : undefined };
    case "like": return { text: `${who} liked your post` };
    case "repost": return { text: `${who} reposted your post` };
    case "comment": return { text: `${who} commented on your post` };
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
  const savePref = useMutation({ mutationFn: async (v: { key: string; on: boolean }) => { const { error } = await supabase.from("user_preferences").upsert({ user_id: uid, ...(prefs.data ?? {}), [v.key]: v.on, updated_at: undefined }, { onConflict: "user_id" }); if (error) throw error; }, onSuccess: () => void qc.invalidateQueries({ queryKey: ["prefs"] }) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Notifications</h1><button className="btn" disabled={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</button></div>
      {list.isLoading && <p role="status">Loading…</p>}
      {list.isError && <p role="alert" className="err">Could not load notifications.</p>}
      {!list.isLoading && items.length === 0 && <p className="card text-center text-muted">You are all caught up.</p>}
      <ul className="space-y-2">{items.map((n) => { const d = describe(n); const body = <><span className={n.read_at ? "" : "font-semibold"}>{d.text}</span><span className="ml-2 text-xs text-muted">{timeAgo(n.created_at)}</span></>;
        return <li key={n.id} className={`card flex items-center justify-between gap-2 ${n.read_at ? "" : "border-primary"}`}>
          {d.to ? <Link to={d.to} onClick={() => markOne.mutate(n.id)} className="flex-1 hover:underline">{body}</Link> : <span className="flex-1">{body}</span>}
          {!n.read_at && <button className="text-xs underline text-muted" onClick={() => markOne.mutate(n.id)}>Mark read</button>}</li>; })}</ul>
      {list.hasNextPage && <button className="btn w-full" onClick={() => void list.fetchNextPage()}>Load more</button>}
      <section className="card space-y-2"><h2 className="font-medium">Notify me about</h2>
        {PREFS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.data?.[key] ?? true} disabled={savePref.isPending} onChange={(e) => savePref.mutate({ key, on: e.target.checked })} />{label}</label>)}
        <p className="text-xs text-muted">Platform announcements and moderator warnings are always delivered.</p>
        {savePref.isError && <p role="alert" className="err">Could not save your preference.</p>}</section>
    </div>
  );
}
