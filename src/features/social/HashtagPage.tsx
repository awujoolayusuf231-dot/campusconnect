import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowDown, Hash } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { useAuth } from "@/features/auth/AuthProvider";
import { fetchMediaPaths, fetchPostPublicMetrics, fetchPostsByHashtag, FEED_PAGE, type Cursor } from "./api";
import { PostCard } from "./components/PostCard";

export function HashtagPage() {
  const { tag: routeTag = "" } = useParams();
  const tag = routeTag.normalize("NFC").toLowerCase();
  const { session } = useAuth();
  const feed = useInfiniteQuery({
    queryKey: ["hashtag-posts", tag],
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPostsByHashtag(tag, pageParam),
    getNextPageParam: (last): Cursor | undefined => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE && tail ? { created_at: tail.created_at, id: tail.id } : undefined;
    },
  });
  const posts = feed.data?.pages.flat() ?? [];
  const media = useQuery({
    queryKey: ["hashtag-media", posts.map((post) => post.id).join(",")],
    enabled: posts.length > 0,
    queryFn: () => fetchMediaPaths(posts.map((post) => post.id)),
  });
  const metrics = useQuery({
    queryKey: ["post-public-metrics", posts.map((post) => post.id).join(",")],
    enabled: posts.length > 0,
    queryFn: () => fetchPostPublicMetrics(posts.map((post) => post.id)),
    refetchOnWindowFocus: false,
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <Link to="/app/discover" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted transition hover:bg-white hover:text-primary">
        <ArrowDown size={15} className="rotate-90" aria-hidden="true" /> Discover
      </Link>
      <header className="rounded-2xl border border-primary-border bg-gradient-to-br from-primary-soft via-white to-primary-soft p-5 sm:p-7">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-primary"><Hash size={15} aria-hidden="true" /> Campus topic</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-fg">#{tag}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Public posts currently visible to you with this hashtag.</p>
      </header>

      {feed.isLoading && <LoadingState label={`Loading posts tagged ${tag}`} variant="panel" />}
      {feed.isError && <p role="alert" className="card text-sm text-danger">Could not load this hashtag. Apply the reviewed hashtag SQL if it is not installed.</p>}
      {!feed.isLoading && !feed.isError && posts.length === 0 && (
        <p role="status" className="card text-sm text-muted">No posts tagged #{tag} are currently visible to you.</p>
      )}
      {media.isError && <p role="alert" className="text-sm text-danger">Some post images could not be loaded.</p>}
      {posts.map((post) => <PostCard key={post.id} post={post} images={media.data?.[post.id]} metrics={metrics.data?.[post.id]} me={session?.user.id ?? ""} trackImpression />)}
      {feed.hasNextPage && <button className="btn group min-h-11 w-full gap-2 bg-white font-semibold text-muted hover:border-primary/25 hover:text-primary" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
        {feed.isFetchingNextPage ? <LoadingState label="Loading more posts" /> : <>Load more posts <ArrowDown size={16} aria-hidden="true" /></>}
      </button>}
    </main>
  );
}
