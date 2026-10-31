import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { adminErrorMessage } from "@/lib/errors";
import { listActiveInstitutions } from "@/features/institutions/api";
import { useMyPermissions } from "../useMyPermissions";
import { LoadingState } from "@/app/LoadingState";

interface Row { user_id: string; username: string; display_name: string; institution_id: string | null; status: string; role: string; email: string | null; joined_at: string; total_count: number }
const PAGE = 25;
const STATUSES = ["active", "restricted", "suspended", "disabled", "pending_deletion"];

export function UsersPage() {
  const qc = useQueryClient();
  const perms = useMyPermissions();
  const canModerate = perms.data?.includes("users.moderate") ?? false;
  const [q, setQ] = useState(""); const [term, setTerm] = useState("");
  const [status, setStatus] = useState(""); const [inst, setInst] = useState(""); const [page, setPage] = useState(0);
  const [target, setTarget] = useState<Row | null>(null);

  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const users = useQuery({ queryKey: ["admin", "users", term, status, inst, page], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_search_users", { p_query: term || null, p_status: status || null, p_institution: inst || null, p_limit: PAGE, p_offset: page * PAGE });
    if (error) throw error; return (data ?? []) as Row[]; } });
  const total = users.data?.[0]?.total_count ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setTerm(q.trim()); }}>
        <input className="input w-full md:w-64" placeholder="Search username or name" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input w-auto" aria-label="Institution" value={inst} onChange={(e) => { setPage(0); setInst(e.target.value); }}><option value="">All institutions</option>{(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <button className="btn-primary">Search</button>
      </form>
      {users.isError && <p role="alert" className="err">Could not load users.</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="p-3">User</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3" /></tr></thead>
          <tbody>
            {users.isLoading && <tr><td className="p-3" colSpan={6}><LoadingState label="Finding students" /></td></tr>}
            {users.data?.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>No users match.</td></tr>}
            {users.data?.map((u) => (
              <tr key={u.user_id} className="border-b border-line last:border-0">
                <td className="p-3"><div className="font-medium">{u.display_name}</div><div className="text-muted">@{u.username}</div></td>
                <td className="p-3">{u.email ?? <span className="text-muted">hidden</span>}</td>
                <td className="p-3">{u.role}</td><td className="p-3">{u.status}</td>
                <td className="p-3">{new Date(u.joined_at).toLocaleDateString()}</td>
                <td className="p-3 text-right">{canModerate && u.role === "student" && <button className="btn" onClick={() => setTarget(u)}>Moderate</button>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>{total} users</span>
        <div className="flex gap-2"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button></div>
      </div>
      {target && <ModerateDialog user={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); void qc.invalidateQueries({ queryKey: ["admin", "users"] }); }} />}
    </div>
  );
}

function ModerateDialog({ user, onClose, onDone }: { user: Row; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState(user.status === "active" ? "suspended" : "active");
  const [reason, setReason] = useState(""); const [noPost, setNoPost] = useState(false); const [noMsg, setNoMsg] = useState(false);
  const m = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc("admin_set_account_status", { p_target: user.user_id, p_status: status, p_reason: reason, p_posting_restricted: noPost, p_messaging_restricted: noMsg });
    if (error) throw error; }, onSuccess: onDone });
  return (
    <div role="dialog" aria-modal="true" aria-label={`Moderate ${user.username}`} className="fixed inset-0 z-10 flex items-end justify-center bg-black/40 p-4 md:items-center">
      <div className="card w-full max-w-md space-y-3">
        <h2 className="font-semibold">Moderate @{user.username}</h2>
        <div><label className="label" htmlFor="st">New status</label><select id="st" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{["active", "restricted", "suspended"].map((s) => <option key={s}>{s}</option>)}</select></div>
        {status === "restricted" && <div className="space-y-1 text-sm"><label className="flex gap-2"><input type="checkbox" checked={noPost} onChange={(e) => setNoPost(e.target.checked)} />Restrict posting</label><label className="flex gap-2"><input type="checkbox" checked={noMsg} onChange={(e) => setNoMsg(e.target.checked)} />Restrict messaging</label></div>}
        <div><label className="label" htmlFor="rs">Reason (recorded in the audit log)</label><textarea id="rs" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {m.isError && <p role="alert" className="err">{adminErrorMessage(String((m.error as Error).message))}</p>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn-danger" disabled={m.isPending || reason.trim().length < 5} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Confirm"}</button></div>
      </div>
    </div>
  );
}
