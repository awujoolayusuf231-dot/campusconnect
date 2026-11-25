import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Bookmark, LoaderCircle } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { useAuth } from "@/features/auth/AuthProvider";
import { fetchMediaPaths, fetchPostPublicMetrics, fetchSavedPosts, FEED_PAGE } from "./api";
import { PostCard } from "./components/PostCard";

export function SavedPostsPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const saved = useInfiniteQuery({
    queryKey: ["saved-posts", me],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchSavedPosts(pageParam),
    getNextPageParam: (lastPage, pages) => lastPage.length === FEED_PAGE ? pages.length : undefined,
  });
  const posts = saved.data?.pages.flat() ?? [];
  const ids = posts.map((post) => post.id);
  const media = useQuery({
    queryKey: ["media", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () => fetchMediaPaths(ids),
  });
  const metrics = useQuery({
    queryKey: ["post-public-metrics", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () => fetchPostPublicMetrics(ids),
    refetchOnWindowFocus: false,
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <header className="rounded-2xl border border-primary-border bg-gradient-to-br from-primary-soft via-white to-primary-soft p-5 sm:p-7">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-primary"><Bookmark size={15} aria-hidden="true" /> Your library</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">Saved posts</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Posts you bookmarked are kept here for easy access.</p>
      </header>
      {saved.isLoading && <LoadingState label="Loading saved posts" variant="panel" />}
      {saved.isError && <p role="alert" className="card text-sm text-danger">Could not load your saved posts.</p>}
      {saved.isSuccess && posts.length === 0 && <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
        <Bookmark size={24} className="mx-auto text-primary" aria-hidden="true" />
        <h2 className="mt-3 font-extrabold text-fg">No saved posts yet</h2>
        <p className="mt-1 text-sm text-muted">Use the Save button on a post to keep it here.</p>
      </div>}
      {media.isError && <p role="alert" className="text-sm text-danger">Some post images could not be loaded.</p>}
      {metrics.isError && <p role="alert" className="text-sm text-danger">Public post counts could not be loaded.</p>}
      {posts.map((post) => <PostCard key={post.id} post={post} images={media.data?.[post.id]} metrics={metrics.data?.[post.id]} me={me} trackImpression />)}
      {saved.hasNextPage && <button type="button" className="btn min-h-11 w-full gap-2 bg-white font-semibold text-muted" disabled={saved.isFetchingNextPage} onClick={() => void saved.fetchNextPage()}>
        {saved.isFetchingNextPage ? <><LoaderCircle size={15} className="animate-spin" />Loading…</> : "Load more saved posts"}
      </button>}
      {saved.isFetchNextPageError && <p role="alert" className="text-sm text-danger">Could not load more saved posts.</p>}
    </main>
  );
}
