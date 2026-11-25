import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { fetchPostAnalytics } from "./api";
import { formatCount } from "@/lib/format";

export function PostInsights({ postId }: { postId: string }) {
  const insights = useQuery({
    queryKey: ["post-insights", postId],
    queryFn: () => fetchPostAnalytics(postId),
    refetchOnWindowFocus: false,
  });

  return (
    <section aria-labelledby="post-insights-title" className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><BarChart3 size={18} aria-hidden="true" /></span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Private to you</p>
          <h2 id="post-insights-title" className="mt-1 text-lg font-black tracking-tight text-fg">Post insights</h2>
          <p className="mt-1 text-xs leading-5 text-muted">Daily figures are shown only after at least three distinct viewers. Viewer identities are never shown.</p>
        </div>
      </div>

      {insights.isLoading && <p role="status" className="text-sm text-muted">Loading post insights…</p>}
      {insights.isError && <p role="alert" className="text-sm text-danger">Could not load post insights. Confirm that the reviewed impression SQL is installed.</p>}
      {insights.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-bg p-3">
              <p className="text-xs font-semibold text-muted">Distinct viewers · last 28 days</p>
              <p className="mt-1 text-xl font-black text-fg">{insights.data.reach === null ? "Not enough data yet" : formatCount(insights.data.reach)}</p>
            </div>
            <div className="rounded-xl bg-bg p-3">
              <p className="text-xs font-semibold text-muted">Impressions on qualifying days</p>
              <p className="mt-1 text-xl font-black text-fg">{insights.data.totals ? formatCount(insights.data.totals.impressions) : "Not enough data yet"}</p>
              {insights.data.totals && <p className="mt-1 text-xs text-muted">{insights.data.totals.days_counted} qualifying days</p>}
            </div>
          </div>
          {insights.data.days.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-left text-sm">
                <caption className="sr-only">Daily post impressions, with days below the privacy threshold omitted</caption>
                <thead><tr className="border-b border-line text-xs text-muted"><th scope="col" className="py-2 pr-3 font-semibold">Day</th><th scope="col" className="py-2 pr-3 font-semibold">Impressions</th><th scope="col" className="py-2 font-semibold">Distinct viewers</th></tr></thead>
                <tbody>{insights.data.days.map((day) => (
                  <tr key={day.day} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="py-2 pr-3 font-medium text-fg">{new Date(`${day.day}T00:00:00`).toLocaleDateString()}</th>
                    <td className="py-2 pr-3 text-muted">{formatCount(day.impressions)}</td>
                    <td className="py-2 text-muted">{formatCount(day.unique_viewers)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
