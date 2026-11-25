import { useQuery } from "@tanstack/react-query";
import { BarChart3, Eye, Heart, MessageCircle, Repeat2, RefreshCw, UsersRound } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { formatCount } from "@/lib/format";
import { fetchMySocialAnalytics } from "./api";

export function AccountAnalyticsPage() {
  const analytics = useQuery({
    queryKey: ["my-social-analytics"],
    queryFn: fetchMySocialAnalytics,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const data = analytics.data;
  const cards = data ? [
    { label: "Total engagement", value: data.total_engagement, detail: "Likes, comments, replies and reshares", icon: BarChart3, accent: "bg-primary-tint text-primary" },
    { label: "Impressions", value: data.total_impressions, detail: `${formatCount(data.post_impressions)} posts · ${formatCount(data.comment_impressions)} comments`, icon: Eye, accent: "bg-[#eaf4ff] text-[#2168a5]" },
    { label: "Views", value: data.total_views, detail: `${formatCount(data.post_views)} posts · ${formatCount(data.comment_views)} comments`, icon: Eye, accent: "bg-[#eaf7ef] text-[#267146]" },
    { label: "Likes", value: data.total_likes, detail: `${formatCount(data.post_likes)} posts · ${formatCount(data.comment_likes)} comments`, icon: Heart, accent: "bg-[#fff0f2] text-[#bd3444]" },
    { label: "Comments received", value: data.comments_received, detail: "Comments on your posts", icon: MessageCircle, accent: "bg-[#fff6df] text-[#8b6500]" },
    { label: "Replies received", value: data.replies_received, detail: "Replies to your comments on others’ posts", icon: MessageCircle, accent: "bg-[#f3efff] text-[#6847a8]" },
    { label: "Post reposts", value: data.post_reposts, detail: "People who reposted your posts", icon: Repeat2, accent: "bg-[#e8f7f5] text-[#207a70]" },
    { label: "Comment reshares", value: data.comment_reshares, detail: "Reshares of your comments and comments on your posts", icon: Repeat2, accent: "bg-[#f0f3ff] text-[#425aab]" },
  ] : [];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-primary-border bg-gradient-to-r from-primary-soft via-white to-[#fff3f1] px-5 py-5 sm:px-7">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Your account performance</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Private to you. Counts update automatically about every 30 seconds while this page is open.</p>
        </div>
        <button type="button" className="btn min-h-10 gap-2 rounded-xl bg-white px-3 text-sm font-semibold" onClick={() => void analytics.refetch()} disabled={analytics.isFetching}>
          <RefreshCw size={15} className={analytics.isFetching ? "animate-spin" : ""} aria-hidden="true" />
          {analytics.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {analytics.isLoading && <LoadingState label="Loading your private analytics" variant="panel" />}
      {analytics.isError && <div role="alert" className="rounded-2xl border border-danger-border bg-danger-soft p-4 text-sm text-danger">
        <p className="font-bold">Your analytics could not be loaded.</p>
        <button type="button" className="mt-2 font-semibold underline" onClick={() => void analytics.refetch()}>Try again</button>
      </div>}

      {data && <>
        <section aria-label="Profile views" className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-fg"><UsersRound size={17} className="text-primary" aria-hidden="true" />Profile views</div>
            <p className="mt-3 text-3xl font-black tabular-nums text-fg">{formatCount(data.profile_views)}</p>
            <p className="mt-1 text-xs text-muted">Recorded lifetime views of your profile</p>
          </article>
          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-fg"><Eye size={17} className="text-primary" aria-hidden="true" />Profile views · last 28 days</div>
            <p className="mt-3 text-3xl font-black tabular-nums text-fg">{formatCount(data.profile_views_28d)}</p>
            <p className="mt-1 text-xs text-muted">
              {data.profile_unique_viewers_28d === null
                ? "Unique viewer count is hidden until there are at least 3 viewers."
                : `${formatCount(data.profile_unique_viewers_28d)} unique viewers`}
            </p>
          </article>
        </section>

        <section aria-label="Social engagement metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, detail, icon: Icon, accent }) => <article key={label} className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-muted">{label}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}><Icon size={17} aria-hidden="true" /></span>
            </div>
            <p className="mt-3 text-2xl font-black tabular-nums text-fg">{formatCount(value)}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">{detail}</p>
          </article>)}
        </section>
        <p className="px-1 text-xs leading-5 text-muted">Engagement is the sum of likes, comments, replies and reshares. Comment likes, views and reshares are credited to both the comment author and the owner of the post. Views and impressions are shown separately. Viewer identities and your account totals are never shown to other users.</p>
      </>}
    </main>
  );
}
