import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { LoadingState } from "@/app/LoadingState";
import { describeNotification, type NotificationCopyInput } from "./notificationCopy";

export interface Notif extends NotificationCopyInput {
  id: number;
  created_at: string;
  read_at: string | null;
}
export { describeNotification } from "./notificationCopy";
const PAGE = 30;

export function NotificationsPage() {
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("notifications_list", { p_before: pageParam, p_limit: PAGE });
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
    getNextPageParam: (last): number | undefined => last.length === PAGE ? last[last.length - 1]?.id : undefined,
  });
  const items = list.data?.pages.flat() ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    void qc.invalidateQueries({ queryKey: ["unread"] });
  };
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_notifications_read");
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const markOne = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("mark_notifications_read", { p_ids: [id] });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Notifications</h1><p className="text-sm text-muted">Updates from your CampusConnect community.</p></div>
      <button className="btn shrink-0" disabled={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</button>
    </div>
    {markAll.isError && <p role="alert" className="err">Could not mark notifications as read.</p>}
    {markOne.isError && <p role="alert" className="err">Could not mark this notification as read.</p>}
    {list.isLoading && <LoadingState label="Gathering your notifications" variant="panel" />}
    {list.isError && <p role="alert" className="err">Could not load notifications.</p>}
    {!list.isLoading && items.length === 0 && <p className="card text-center text-muted">You are all caught up.</p>}
    <ul className="space-y-2">{items.map((item) => {
      const copy = describeNotification(item);
      const announcementBody = item.type === "announcement" && typeof item.data.body === "string" ? item.data.body : "";
      const body = <><span className={item.read_at ? "" : "font-semibold"}>{copy.text}</span><span className="ml-2 text-xs text-muted">{timeAgo(item.created_at)}</span>{announcementBody && <span className="mt-2 block whitespace-pre-wrap break-words text-sm leading-6 text-muted">{announcementBody}</span>}</>;
      return <li key={item.id} className={`card flex items-center justify-between gap-2 ${item.read_at ? "" : "border-primary"}`}>
        <Link to={copy.to} onClick={() => { if (!item.read_at) markOne.mutate(item.id); }} className="min-w-0 flex-1 break-words hover:underline">{body}</Link>
        {!item.read_at && <button className="shrink-0 text-xs text-muted underline" onClick={() => markOne.mutate(item.id)}>Mark read</button>}
      </li>;
    })}</ul>
    {list.hasNextPage && <button className="btn w-full" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Load more"}</button>}
    <p className="text-sm text-muted">Manage notification delivery in <Link to="/app/settings" className="font-semibold text-primary underline">Account settings</Link>.</p>
  </div>;
}
