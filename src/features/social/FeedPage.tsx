import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FEED_PAGE, fetchFeed, fetchMediaPaths, type Cursor, type FeedScope } from "./api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Composer } from "./components/Composer";
import { OnboardingCard } from "@/features/onboarding/OnboardingCard";
import { PostCard } from "./components/PostCard";
import { LoadingState } from "@/app/LoadingState";
import { ArrowDown, Globe2, UsersRound, GraduationCap, Search, Sparkles } from "lucide-react";

const TABS: [FeedScope, string][] = [["all", "Everyone"], ["following", "Following"], ["institution", "My institution"]];
const TAB_ICONS = { all: Globe2, following: UsersRound, institution: GraduationCap };

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
  const media = useQuery({ queryKey: ["media", ids.join(",")], enabled: ids.length > 0, queryFn: () => fetchMediaPaths(ids) });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <OnboardingCard />
      <Composer />
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary"><Sparkles size={13} aria-hidden="true" /> Your campus, in the loop</p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">Campus feed</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-muted sm:block">See what’s happening around you</span>
            <Link
              to="/app/discover"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-bold text-fg transition hover:border-primary/30 hover:bg-[#fff7f6] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Search size={15} aria-hidden="true" />
              <span>Find students</span>
            </Link>
          </div>
        </div>
        <div role="tablist" aria-label="Feed" className="mt-3 flex gap-1 overflow-x-auto border-b border-line px-2 sm:px-3">
          {TABS.map(([v, l]) => {
            const Icon = TAB_ICONS[v];
            return (
              <button
                key={v}
                id={`feed-tab-${v}`}
                type="button"
                role="tab"
                aria-selected={scope === v}
                aria-controls="feed-panel"
                className={`relative flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:px-4 ${scope === v ? "border-primary font-bold text-primary" : "border-transparent font-semibold text-muted hover:bg-[#fff8f7] hover:text-fg"}`}
                onClick={() => setScope(v)}
              >
                <Icon size={16} aria-hidden="true" />{l}
              </button>
            );
          })}
        </div>
      </section>
      <div id="feed-panel" role="tabpanel" aria-labelledby={`feed-tab-${scope}`} className="space-y-4" aria-label={`${TABS.find(([value]) => value === scope)?.[1] ?? "Campus"} posts`}>
      {feed.isLoading && <div role="status" className="space-y-3" aria-label="Loading feed">{[0, 1, 2].map((i) => <div key={i} className="card h-36 animate-pulse border-transparent bg-white shadow-[0_8px_24px_rgba(35,24,20,0.035)]" />)}</div>}
      {feed.isError && <p role="alert" className="card border-danger/20 bg-white text-sm text-danger">Could not load the feed. <button className="font-bold underline underline-offset-2" onClick={() => void feed.refetch()}>Retry</button></p>}
      {!feed.isLoading && posts.length === 0 && !feed.isError && (
        <div className="rounded-2xl border border-dashed border-[#e7d4d5] bg-white px-5 py-10 text-center shadow-[0_8px_24px_rgba(35,24,20,0.025)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff1f2] text-primary"><UsersRound size={22} aria-hidden="true" /></span>
          <h2 className="mt-4 font-extrabold text-fg">{scope === "following" ? "Your circle is getting started" : scope === "institution" ? "Your campus feed is quiet" : "Your campus story starts here"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            {scope === "following" ? "Follow students in Discover to see their posts here." : scope === "institution" ? "No posts from your institution yet. Set your institution in your profile." : "No posts yet. Be the first to share something with your community."}
          </p>
        </div>)}
      {posts.map((p) => <PostCard key={p.id} post={p} images={media.data?.[p.id]} me={me} trackImpression />)}
      {feed.hasNextPage && <button className="btn group min-h-11 w-full gap-2 bg-white font-semibold text-muted hover:border-primary/25 hover:text-primary" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? <LoadingState label="Finding more posts" /> : <>Load more posts <ArrowDown size={16} aria-hidden="true" className="transition-transform group-hover:translate-y-0.5" /></>}</button>}
      </div>
    </div>
  );
}
