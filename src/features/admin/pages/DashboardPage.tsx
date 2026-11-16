import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useMyPermissions } from "../useMyPermissions";
import { formatSubscriptionPrice } from "@/features/payments/api";

interface Stats { period_days: number; total_users: number; new_users: number; active_users: number; suspended_accounts: number; restricted_accounts: number; pending_deletions: number; staff_count: number; active_institutions: number }
interface Content { total_posts: number; new_posts: number; total_comments: number; total_communities: number; total_conversations: number; total_messages: number; new_messages: number; open_reports: number; escalated_reports: number }
interface Day { day: string; registrations: number }
interface SubscriptionMetric { currency: string; current_subscribers: number; successful_payments: number; failed_payments: number; gross_revenue_minor: number | string }
interface DiscoveryMetric { location_opt_ins: number; followed_post_notifications: number; celebration_notifications: number }

function formatGrossRevenue(value: number | string, currency: string): string {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) return "Amount is too large to display exactly";
  try {
    return formatSubscriptionPrice(amount, currency);
  } catch (error) {
    if (error instanceof RangeError) return "Unsupported currency";
    throw error;
  }
}

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const perms = useMyPermissions();
  const allowed = perms.data?.includes("analytics.view") ?? false;
  const canViewUsers = perms.data?.includes("users.view") ?? false;

  const stats = useQuery({ queryKey: ["admin", "stats", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_overview_stats", { p_days: days }); if (error) throw error; return data as Stats; } });
  const series = useQuery({ queryKey: ["admin", "regs", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_registrations_by_day", { p_days: days }); if (error) throw error; return (data ?? []) as Day[]; } });

  const content = useQuery({ queryKey: ["admin", "content", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_content_stats", { p_days: days }); if (error) throw error; return data as Content; } });

  const subscriptions = useQuery({ queryKey: ["admin", "subscriptions", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_subscription_overview", { p_days: days });
    if (error) throw error;
    return (data ?? []) as SubscriptionMetric[];
  } });
  const discovery = useQuery({ queryKey: ["admin", "discovery", days], enabled: allowed, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_discovery_overview", { p_days: days });
    if (error) throw error;
    return ((data ?? []) as DiscoveryMetric[])[0] ?? null;
  } });

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
        {cards.map(([label, value]) => (
          label === "Deletion requests" && canViewUsers
            ? <Link key={label} to="/admin/deletions" className="card transition hover:border-primary/40 hover:bg-bg">
                <p className="text-sm text-muted">{label}</p><p className="text-2xl font-semibold">{value ?? "–"}</p>
              </Link>
            : <div key={label} className="card"><p className="text-sm text-muted">{label}</p><p className="text-2xl font-semibold">{value ?? "–"}</p></div>
        ))}
      </div>
      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">Subscriptions and Paystack payments</h2>
          <p className="text-xs text-muted">Payment totals for the last {days} days; subscriber counts include paid access through the current period.</p>
        </div>
        {subscriptions.isLoading && <p className="text-sm text-muted">Loading payment metrics…</p>}
        {subscriptions.isError && <p role="alert" className="err">Could not load subscription metrics.</p>}
        {subscriptions.data?.length === 0 && <p className="text-sm text-muted">No subscription plans are configured.</p>}
        {subscriptions.data?.map((row) => {
          const gross = formatGrossRevenue(row.gross_revenue_minor, row.currency);
          return <div key={row.currency} className="grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4">
            <div><p className="text-xs text-muted">Currency</p><p className="font-semibold">{row.currency}</p></div>
            <div><p className="text-xs text-muted">Current subscribers</p><p className="font-semibold">{row.current_subscribers}</p></div>
            <div><p className="text-xs text-muted">Payments · successful / failed</p><p className="font-semibold">{row.successful_payments} / {row.failed_payments}</p></div>
            <div><p className="text-xs text-muted">Gross paid</p><p className="font-semibold">{gross}</p></div>
          </div>;
        })}
      </section>
      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">Discovery and celebration activity</h2>
          <p className="text-xs text-muted">Aggregate counts only. Private city/state entries, messages, and individual recommendation history are not shown.</p>
        </div>
        {discovery.isLoading && <p className="text-sm text-muted">Loading discovery metrics…</p>}
        {discovery.isError && <p role="alert" className="err">Could not load discovery metrics.</p>}
        {discovery.data && (
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted">Location opt-ins</p><p className="font-semibold">{discovery.data.location_opt_ins}</p></div>
            <div><p className="text-xs text-muted">Followed-post alerts · {days} days</p><p className="font-semibold">{discovery.data.followed_post_notifications}</p></div>
            <div><p className="text-xs text-muted">Celebration alerts · {days} days</p><p className="font-semibold">{discovery.data.celebration_notifications}</p></div>
          </div>
        )}
      </section>
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
