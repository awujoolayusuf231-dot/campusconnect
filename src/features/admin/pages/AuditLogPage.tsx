import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { LoadingState } from "@/app/LoadingState";

interface Row { id: number; actor_id: string | null; action: string; target_type: string; target_id: string | null; reason: string | null; metadata: Record<string, unknown>; created_at: string }
const PAGE = 50;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function AuditLogPage() {
  const [action, setAction] = useState(""); const [applied, setApplied] = useState(""); const [page, setPage] = useState(0); const [open, setOpen] = useState<number | null>(null);
  const list = useQuery({ queryKey: ["admin", "audit", applied, page], queryFn: async () => {
    let q = supabase.from("admin_audit_logs").select("*", { count: "exact" }); if (applied) q = q.ilike("action", `${escapeLike(applied)}%`);
    const { data, error, count } = await q.order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1); if (error) throw error;
    const rows = (data ?? []) as Row[]; const ids = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))]; const names = new Map<string, string>();
    if (ids.length) { const { data: p } = await supabase.from("profiles").select("id,username").in("id", ids); (p ?? []).forEach((x) => names.set((x as { id: string }).id, "@" + (x as { username: string }).username)); }
    return { rows, count: count ?? 0, names }; } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-muted">Append-only. Entries cannot be edited or deleted by anyone through the application.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(action.trim()); }}><input className="input md:w-72" aria-label="Action starts with" placeholder="Action prefix, e.g. role. or content." value={action} onChange={(e) => setAction(e.target.value)} /><button className="btn-primary">Filter</button></form>
      {list.isError && <p role="alert" className="err">You do not have permission to view the audit log.</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted"><tr><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Reason</th></tr></thead>
        <tbody>{list.isLoading && <tr><td className="p-3" colSpan={5}><LoadingState label="Gathering audit entries" /></td></tr>}{list.data?.rows.length === 0 && <tr><td className="p-3 text-muted" colSpan={5}>No entries.</td></tr>}
          {list.data?.rows.map((r) => (<tr key={r.id} className="cursor-pointer border-b border-line align-top last:border-0" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <td className="p-3 whitespace-nowrap" title={r.created_at}>{timeAgo(r.created_at)}</td><td className="p-3">{r.actor_id ? list.data?.names.get(r.actor_id) ?? r.actor_id.slice(0, 8) : "system"}</td>
            <td className="p-3 font-medium">{r.action}</td><td className="p-3">{r.target_type}{r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ""}</td>
            <td className="p-3">{r.reason ?? "—"}{open === r.id && <pre className="mt-2 max-w-md overflow-x-auto rounded bg-bg p-2 text-xs">{JSON.stringify(r.metadata, null, 2)}</pre>}</td></tr>))}</tbody></table></div>
      <div className="flex items-center justify-between text-sm"><span>{list.data?.count ?? 0} entries</span><div className="flex gap-2"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button><button className="btn" disabled={(page + 1) * PAGE >= (list.data?.count ?? 0)} onClick={() => setPage(page + 1)}>Older</button></div></div>
    </div>
  );
}
