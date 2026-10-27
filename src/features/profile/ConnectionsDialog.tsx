import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { followUser, listConnections, unfollowUser, type Connection } from "@/features/social/api";
import { Avatar } from "@/features/social/components/Avatar";
import { socialErrorMessage } from "@/lib/errors";

const PAGE = 30;

export function ConnectionsDialog({ userId, initial, me, onClose }: { userId: string; initial: "followers" | "following"; me: string; onClose: () => void }) {
  const [kind, setKind] = useState<"followers" | "following">(initial);
  const nav = useNavigate(); const qc = useQueryClient();
  const list = useInfiniteQuery({ queryKey: ["connections", userId, kind], initialPageParam: 0,
    queryFn: ({ pageParam }) => listConnections(userId, kind, pageParam, PAGE),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length : undefined) });
  const toggle = useMutation({ mutationFn: (c: Connection) => (c.is_following ? unfollowUser(c.user_id) : followUser(c.user_id)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["connections"] }); void qc.invalidateQueries({ queryKey: ["profile-stats"] }); void qc.invalidateQueries({ queryKey: ["feed"] }); } });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const rows = list.data?.pages.flat() ?? [];
  return (
    <div role="dialog" aria-modal="true" aria-label="Connections" className="fixed inset-0 z-30 flex items-stretch justify-center bg-black/40 md:items-center md:p-6">
      <div className="flex h-full w-full flex-col bg-surface md:h-[75dvh] md:max-w-md md:overflow-hidden md:rounded-2xl md:border md:border-line">
        <header className="flex items-center justify-between border-b border-line p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
          <div role="tablist" aria-label="Connections" className="flex gap-1">
            {(["followers", "following"] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-full px-4 py-1.5 text-sm ${kind === k ? "bg-primary text-primary-fg" : "text-muted hover:bg-bg"}`}>{k === "followers" ? "Followers" : "Following"}</button>)}
          </div>
          <button aria-label="Close" autoFocus onClick={onClose} className="rounded p-1 hover:bg-bg"><X size={20} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {list.isLoading && <p role="status" className="text-sm text-muted">Loading…</p>}
          {list.isError && <p role="alert" className="err">Could not load this list.</p>}
          {!list.isLoading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted">{kind === "followers" ? "No followers to show yet." : "Not following anyone yet."}</p>}
          <ul className="space-y-2">{rows.map((c) => (
            <li key={c.user_id} className="flex items-center gap-3">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { onClose(); nav(`/app/u/${c.username}`); }}>
                <Avatar name={c.display_name} path={c.avatar_path} size={44} />
                <span className="min-w-0"><span className="block truncate font-medium">{c.display_name}</span><span className="block truncate text-xs text-muted">@{c.username}</span></span></button>
              {c.user_id !== me && <button className={c.is_following ? "btn" : "btn-primary"} disabled={toggle.isPending} onClick={() => toggle.mutate(c)}>{c.is_following ? "Following" : "Follow"}</button>}
            </li>))}</ul>
          {toggle.isError && <p role="alert" className="err mt-2">{socialErrorMessage((toggle.error as Error).message)}</p>}
          {list.hasNextPage && <button className="btn mt-3 w-full" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Load more"}</button>}
          <p className="mt-4 text-xs text-muted">People with private profiles, and people you have blocked, are not shown.</p>
        </div>
      </div>
    </div>
  );
}
