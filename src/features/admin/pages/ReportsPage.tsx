import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { adminErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoadingState } from "@/app/LoadingState";

interface Report { id: string; reporter_id: string | null; reported_user_id: string | null; target_type: string; target_id: string; category: string; explanation: string | null; content_snapshot: string | null; status: string; assigned_to: string | null; resolved_at: string | null; created_at: string }
interface Note { id: number; author_id: string | null; note: string; created_at: string }
interface Action { id: number; action: string; reason: string; actor_id: string; created_at: string }
const STATUSES = ["open", "under_review", "escalated", "action_taken", "dismissed"];

async function names(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id,username").in("id", unique);
  return new Map((data ?? []).map((p) => [(p as { id: string }).id, "@" + (p as { username: string }).username] as [string, string]));
}

export function ReportsPage() {
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "reports", status], queryFn: async () => {
    const { data, error } = await supabase.from("reports").select("*").eq("status", status).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    const rows = (data ?? []) as Report[];
    return { rows, who: await names(rows.flatMap((r) => [r.reporter_id, r.reported_user_id])) }; } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div role="tablist" aria-label="Report status" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => <button key={s} role="tab" aria-selected={status === s} className={status === s ? "btn-primary" : "btn"} onClick={() => { setStatus(s); setSelected(null); }}>{s.replace("_", " ")}</button>)}
      </div>
      {list.isLoading && <LoadingState label="Gathering reports" variant="panel" />}
      {list.isError && <p role="alert" className="err">Could not load reports.</p>}
      {list.data?.rows.length === 0 && <p className="card text-center text-muted">No {status.replace("_", " ")} reports.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {list.data?.rows.map((r) => (
            <li key={r.id}><button className={`card w-full text-left ${selected === r.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelected(r.id)}>
              <p className="text-sm font-medium">{r.target_type} · {r.category.replace("_", " ")}</p>
              <p className="line-clamp-2 text-sm text-muted">{r.content_snapshot ?? "(no snapshot)"}</p>
              <p className="text-xs text-muted">Reported {list.data?.who.get(r.reported_user_id ?? "") ?? "user"} · {timeAgo(r.created_at)}</p></button></li>))}
        </ul>
        {selected && list.data && <ReportDetail key={selected} report={list.data.rows.find((r) => r.id === selected)!} who={list.data.who} />}
      </div>
    </div>
  );
}

function ReportDetail({ report, who }: { report: Report; who: Map<string, string> }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [reason, setReason] = useState(""); const [note, setNote] = useState(""); const [newStatus, setNewStatus] = useState("under_review");
  const notes = useQuery({ queryKey: ["admin", "notes", report.id], queryFn: async () => {
    const { data, error } = await supabase.from("report_notes").select("id,author_id,note,created_at").eq("report_id", report.id).order("created_at"); if (error) throw error; return (data ?? []) as Note[]; } });
  const history = useQuery({ queryKey: ["admin", "history", report.reported_user_id], enabled: !!report.reported_user_id, queryFn: async () => {
    const { data, error } = await supabase.from("moderation_actions").select("id,action,reason,actor_id,created_at").eq("target_user_id", report.reported_user_id!).order("created_at", { ascending: false }).limit(20); if (error) throw error; return (data ?? []) as Action[]; } });
  const done = () => { void qc.invalidateQueries({ queryKey: ["admin"] }); setReason(""); setNote(""); };
  const run = useMutation({ mutationFn: async (fn: () => PromiseLike<{ error: { message: string } | null }>) => { const { error } = await fn(); if (error) throw new Error(error.message); }, onSuccess: done });
  const rpc = (name: string, args: Record<string, unknown>) => () => supabase.rpc(name, args);
  const reasonOk = reason.trim().length >= 5;
  const canHide = report.target_type === "post" || report.target_type === "comment";
  const isCommunity = report.target_type === "community";

  return (
    <section className="card space-y-3" aria-label="Report detail">
      <h2 className="font-semibold">Report detail</h2>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Reporter</dt><dd>{who.get(report.reporter_id ?? "") ?? "unknown"}</dd>
        <dt className="text-muted">Reported</dt><dd>{who.get(report.reported_user_id ?? "") ?? "unknown"}</dd>
        <dt className="text-muted">Status</dt><dd>{report.status}{report.assigned_to ? ` · assigned to ${report.assigned_to === session?.user.id ? "you" : "a moderator"}` : ""}</dd>
        <dt className="text-muted">Explanation</dt><dd>{report.explanation ?? "—"}</dd>
      </dl>
      <blockquote className="rounded-lg border border-line bg-bg p-3 text-sm whitespace-pre-wrap">{report.content_snapshot ?? "(no snapshot)"}</blockquote>
      <p className="text-xs text-muted">Snapshot taken when the report was filed; the live content may have changed.{report.target_type === "message" ? " For private messages you can only see the reported message, never the conversation." : ""}</p>

      <div><label className="label" htmlFor="reason">Reason / resolution (required, min 5 characters; recorded in the audit log)</label>
        <textarea id="reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="New status" className="input w-auto" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <button className="btn-primary" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_update_report", { p_report: report.id, p_status: newStatus, p_resolution: reason }))}>Update status</button>
        <button className="btn" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_update_report", { p_report: report.id, p_status: report.status === "open" ? "under_review" : report.status, p_resolution: reason, p_assign_to: session?.user.id }))}>Assign to me</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {canHide && <button className="btn-danger" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_set_content_state", { p_type: report.target_type, p_id: report.target_id, p_hide: true, p_reason: reason }))}>Hide content</button>}
        {canHide && <button className="btn" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_set_content_state", { p_type: report.target_type, p_id: report.target_id, p_hide: false, p_reason: reason }))}>Restore content</button>}
        {isCommunity && <button className="btn-danger" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_set_community_state", { p_id: report.target_id, p_status: "disabled", p_reason: reason }))}>Disable community</button>}
        {isCommunity && <button className="btn" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_set_community_state", { p_id: report.target_id, p_status: "active", p_reason: reason }))}>Restore community</button>}
        {report.target_type === "opportunity" && <button className="btn-danger" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_set_opportunity_state", { p_id: report.target_id, p_status: "draft", p_featured: false, p_reason: reason }))}>Unpublish opportunity</button>}
        {report.reported_user_id && <button className="btn" disabled={!reasonOk || run.isPending} onClick={() => run.mutate(rpc("admin_warn_user", { p_user: report.reported_user_id, p_reason: reason, p_report: report.id }))}>Warn user</button>}
      </div>
      {run.isError && <p role="alert" className="err">{adminErrorMessage((run.error as Error).message)}</p>}
      {run.isSuccess && <p role="status" className="text-sm">Done.</p>}

      <div><h3 className="mb-1 text-sm font-medium">Internal notes (staff only)</h3>
        <ul className="space-y-1 text-sm">{notes.data?.map((n) => <li key={n.id} className="rounded bg-bg p-2">{n.note}<span className="ml-2 text-xs text-muted">{timeAgo(n.created_at)}</span></li>)}</ul>
        {notes.data?.length === 0 && <p className="text-sm text-muted">No notes.</p>}
        <div className="mt-2 flex gap-2"><input className="input" aria-label="Add note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <button className="btn" disabled={!note.trim() || run.isPending} onClick={() => run.mutate(rpc("admin_add_report_note", { p_report: report.id, p_note: note }))}>Add</button></div></div>

      <div><h3 className="mb-1 text-sm font-medium">Previous moderation of this user</h3>
        {history.data?.length === 0 && <p className="text-sm text-muted">None.</p>}
        <ul className="space-y-1 text-sm">{history.data?.map((a) => <li key={a.id}><span className="font-medium">{a.action.replace("_", " ")}</span> — {a.reason} <span className="text-xs text-muted">{timeAgo(a.created_at)}</span></li>)}</ul></div>
    </section>
  );
}
