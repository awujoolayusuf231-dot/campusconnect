import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { followUser, listConnections, unfollowUser, type Connection } from "@/features/social/api";
import { Avatar } from "@/features/social/components/Avatar";
import { socialErrorMessage } from "@/lib/errors";
import { LoadingState } from "@/app/LoadingState";

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
    createPortal(
    <div role="dialog" aria-modal="true" aria-label="Connections" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[#211719]/55 backdrop-blur-[3px] md:items-center md:p-6">
      <div className="flex h-full w-full flex-col bg-[#fbfaf9] shadow-[0_24px_80px_rgba(20,10,10,0.28)] md:h-[75dvh] md:max-w-md md:overflow-hidden md:rounded-[24px] md:border md:border-line">
        <header className="relative z-10 flex items-center justify-between border-b border-line bg-white p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
          <div>
            <p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Your campus circle</p>
            <div role="tablist" aria-label="Connections" className="mt-2 flex gap-1">
            {(["followers", "following"] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`min-h-9 rounded-xl px-3 text-sm font-bold transition-colors ${kind === k ? "bg-[#f8e9ea] text-primary" : "text-muted hover:bg-bg"}`}>{k === "followers" ? "Followers" : "Following"}</button>)}
            </div>
          </div>
          <button aria-label="Close" autoFocus onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-[#fff1f2] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={20} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {list.isLoading && <div className="space-y-3 py-2"><LoadingState label={`Finding ${kind}`} className="mb-4" />{[0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="flex animate-pulse items-center gap-3"><span className="h-11 w-11 rounded-full bg-[#f2ebeb]" /><span className="flex-1 space-y-2"><span className="block h-3 w-2/5 rounded bg-[#f2ebeb]" /><span className="block h-2.5 w-1/4 rounded bg-[#f2ebeb]" /></span></div>)}</div>}
          {list.isError && <p role="alert" className="err">Could not load this list.</p>}
          {!list.isLoading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted">{kind === "followers" ? "No followers to show yet." : "Not following anyone yet."}</p>}
          <ul className="space-y-2">{rows.map((c) => (
            <li key={c.user_id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-[0_3px_12px_rgba(35,24,20,0.025)]">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { onClose(); nav(`/app/u/${c.username}`); }}>
                <Avatar name={c.display_name} path={c.avatar_path} size={44} />
                <span className="min-w-0"><span className="block truncate text-sm font-extrabold text-fg">{c.display_name}</span><span className="mt-0.5 block truncate text-xs text-muted">@{c.username}</span></span></button>
              {c.user_id !== me && <button className={`${c.is_following ? "btn border-[#e5d7d4] bg-white" : "btn-primary"} min-h-9 rounded-xl px-3 text-xs font-bold`} disabled={toggle.isPending} onClick={() => toggle.mutate(c)}>{c.is_following ? "Following" : "Follow"}</button>}
            </li>))}</ul>
          {toggle.isError && <p role="alert" className="err mt-2">{socialErrorMessage((toggle.error as Error).message)}</p>}
          {list.hasNextPage && <button className="btn mt-3 w-full gap-2" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage && <LoadingState label="Finding more" />}{!list.isFetchingNextPage && "Load more"}</button>}
          <p className="mt-4 rounded-xl border border-[#f0dadd] bg-[#fff7f6] p-3 text-xs leading-5 text-[#755a5c]">People with private profiles, and people you have blocked, are not shown.</p>
        </div>
      </div>
    </div>,
    document.body,
    )
  );
}
