import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useMyPermissions } from "../useMyPermissions";

interface Stats { period_days: number; total_users: number; new_users: number; active_users: number; suspended_accounts: number; restricted_accounts: number; pending_deletions: number; staff_count: number; active_institutions: number }
interface Content { total_posts: number; new_posts: number; total_comments: number; total_communities: number; total_conversations: number; total_messages: number; new_messages: number; open_reports: number; escalated_reports: number }
interface Day { day: string; registrations: number }

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const perms = useMyPermissions();
  const allowed = perms.data?.includes("analytics.view") ?? false;

  const stats = useQuery({ queryKey: ["admin", "stats", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_overview_stats", { p_days: days }); if (error) throw error; return data as Stats; } });
  const series = useQuery({ queryKey: ["admin", "regs", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_registrations_by_day", { p_days: days }); if (error) throw error; return (data ?? []) as Day[]; } });

  const content = useQuery({ queryKey: ["admin", "content", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_content_stats", { p_days: days }); if (error) throw error; return data as Content; } });

  if (!allowed) return <p className="card">Your role does not include analytics. Use the menu to open a section you can access.</p>;
  const max = Math.max(1, ...(series.data ?? []).map((d) => d.registrations));
  const cards: [string, number | undefined][] = [
    ["Total users", stats.data?.total_users], ["New users", stats.data?.new_users], ["Active users", stats.data?.active_users],
    ["Suspended", stats.data?.suspended_accounts], ["Restricted", stats.data?.restricted_accounts],
    ["Deletion requests", stats.data?.pending_deletions], ["Staff", stats.data?.staff_count], ["Active institutions", stats.data?.active_institutions],
    ["Posts", content.data?.total_posts], ["New posts", content.data?.new_posts], ["Comments", content.data?.total_comments], ["Communities", content.data?.total_communities],
    ["Conversations", content.data?.total_conversations], ["Messages (count only)", content.data?.total_messages], ["Open reports", content.data?.open_reports], ["Escalated reports", content.data?.escalated_reports],
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <label className="text-sm">Period <select className="input ml-2 w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></label>
      </div>
      {stats.isError && <p role="alert" className="err">Could not load statistics.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (<div key={label} className="card"><p className="text-sm text-muted">{label}</p><p className="text-2xl font-semibold">{value ?? "–"}</p></div>))}
      </div>
      <section className="card">
        <h2 className="mb-3 font-medium">Registrations per day</h2>
        <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Bar chart of registrations per day">
          {(series.data ?? []).map((d) => (<div key={d.day} title={`${d.day}: ${d.registrations}`} className="min-w-[2px] flex-1 rounded-t bg-primary" style={{ height: `${(d.registrations / max) * 100}%`, minHeight: d.registrations ? 2 : 0 }} />))}
        </div>
        {series.data?.length === 0 && <p className="text-sm text-muted">No data.</p>}
      </section>
      <p className="text-sm text-muted">Message counts are aggregates only; message contents are never read by the dashboard.</p>
    </div>
  );
}
