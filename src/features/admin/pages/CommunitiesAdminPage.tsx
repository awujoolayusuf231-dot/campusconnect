import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { adminErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";

interface Row { id: string; name: string; slug: string; category: string; status: string; member_count: number; created_by: string | null; created_at: string }
const PAGE = 25;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function CommunitiesAdminPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(0);
  const [target, setTarget] = useState<{ row: Row; next: string } | null>(null); const [reason, setReason] = useState("");
  const list = useQuery({ queryKey: ["admin", "communities", term, status, page], queryFn: async () => {
    let query = supabase.from("communities").select("id,name,slug,category,status,member_count,created_by,created_at", { count: "exact" });
    if (term) query = query.ilike("name", `%${escapeLike(term)}%`);
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const ids = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (ids.length) { const { data: p } = await supabase.from("profiles").select("id,username").in("id", ids); (p ?? []).forEach((x) => names.set((x as { id: string }).id, "@" + (x as { username: string }).username)); }
    return { rows, count: count ?? 0, names }; } });
  const change = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("admin_set_community_state", { p_id: target!.row.id, p_status: target!.next, p_reason: reason }); if (error) throw new Error(error.message); },
    onSuccess: () => { setTarget(null); setReason(""); void qc.invalidateQueries({ queryKey: ["admin", "communities"] }); } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Communities</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setTerm(q.trim()); }}>
        <input className="input w-full md:w-64" aria-label="Search communities" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}><option value="">All statuses</option><option>active</option><option>archived</option><option>disabled</option></select>
        <button className="btn-primary">Search</button>
      </form>
      {list.isError && <p role="alert" className="err">Could not load communities.</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted"><tr><th className="p-3">Community</th><th className="p-3">Owner</th><th className="p-3">Members</th><th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3" /></tr></thead>
        <tbody>
          {list.isLoading && <tr><td className="p-3" colSpan={6}>Loading…</td></tr>}
          {list.data?.rows.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>No communities match.</td></tr>}
          {list.data?.rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="p-3"><div className="font-medium">{r.name}</div><div className="text-muted">/{r.slug} · {r.category}</div></td>
              <td className="p-3">{list.data?.names.get(r.created_by ?? "") ?? "—"}</td><td className="p-3">{r.member_count}</td><td className="p-3">{r.status}</td><td className="p-3">{timeAgo(r.created_at)}</td>
              <td className="p-3 text-right space-x-1">{r.status !== "disabled" && <button className="btn-danger" onClick={() => setTarget({ row: r, next: "disabled" })}>Disable</button>}
                {r.status !== "active" && <button className="btn" onClick={() => setTarget({ row: r, next: "active" })}>Restore</button>}</td>
            </tr>))}
        </tbody></table></div>
      <div className="flex items-center justify-between text-sm"><span>{list.data?.count ?? 0} communities</span><div className="flex gap-2"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={(page + 1) * PAGE >= (list.data?.count ?? 0)} onClick={() => setPage(page + 1)}>Next</button></div></div>
      {target && (
        <div role="dialog" aria-modal="true" aria-label="Change community status" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card w-full max-w-md space-y-3"><h2 className="font-semibold">{target.next === "disabled" ? "Disable" : "Restore"} “{target.row.name}”</h2>
            <p className="text-sm text-muted">{target.next === "disabled" ? "Members will no longer see this community or its posts. The owner cannot undo this." : "The community becomes visible again."}</p>
            <label className="label" htmlFor="why">Reason (recorded in the audit log)</label><textarea id="why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {change.isError && <p role="alert" className="err">{adminErrorMessage((change.error as Error).message)}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setTarget(null)}>Cancel</button><button className={target.next === "disabled" ? "btn-danger" : "btn-primary"} disabled={reason.trim().length < 5 || change.isPending} onClick={() => change.mutate()}>Confirm</button></div></div></div>)}
    </div>
  );
}
