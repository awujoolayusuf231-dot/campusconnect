import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FEED_PAGE, fetchFeed, fetchMediaUrls, type Cursor, type FeedScope } from "./api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Composer } from "./components/Composer";
import { PostCard } from "./components/PostCard";

const TABS: [FeedScope, string][] = [["all", "Everyone"], ["following", "Following"], ["institution", "My institution"]];

export function FeedPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const [scope, setScope] = useState<FeedScope>("all");
  const feed = useInfiniteQuery({
    queryKey: ["feed", scope],
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchFeed(scope, pageParam),
    getNextPageParam: (last): Cursor | undefined => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE && tail ? { created_at: tail.activity_at, id: tail.id } : undefined;
    },
  });
  const posts = feed.data?.pages.flat() ?? [];
  const ids = posts.map((p) => p.id);
  const media = useQuery({ queryKey: ["media", ids.join(",")], enabled: ids.length > 0, queryFn: () => fetchMediaUrls(ids) });

  return (
    <div className="space-y-4">
      <Composer />
      <div role="tablist" aria-label="Feed" className="flex gap-2">
        {TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={scope === v} className={scope === v ? "btn-primary" : "btn"} onClick={() => setScope(v)}>{l}</button>))}
      </div>
      {feed.isLoading && <div role="status" className="space-y-3" aria-label="Loading feed">{[0, 1, 2].map((i) => <div key={i} className="card h-28 animate-pulse" />)}</div>}
      {feed.isError && <p role="alert" className="err">Could not load the feed. <button className="underline" onClick={() => void feed.refetch()}>Retry</button></p>}
      {!feed.isLoading && posts.length === 0 && !feed.isError && (
        <div className="card text-center text-muted">
          {scope === "following" ? "Follow students in Discover to see their posts here." : scope === "institution" ? "No posts from your institution yet. Set your institution in your profile." : "No posts yet. Be the first to post!"}
        </div>)}
      {posts.map((p) => <PostCard key={p.id} post={p} images={media.data?.[p.id]} me={me} />)}
      {feed.hasNextPage && <button className="btn w-full" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? "Loading…" : "Load more"}</button>}
    </div>
  );
}
