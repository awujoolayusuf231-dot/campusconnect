import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { adminErrorMessage } from "@/lib/errors";
import { useAuth } from "@/features/auth/AuthProvider";
import { timeAgo } from "@/lib/time";

interface StaffRow { user_id: string; role: string; granted_at: string; username: string | null; display_name: string | null; perms: string[] }
interface Found { user_id: string; username: string; display_name: string; role: string; status: string }
const ALL_PERMS = ["users.view", "users.view_email", "users.moderate", "content.moderate", "reports.manage", "institutions.manage", "communities.manage", "opportunities.manage", "announcements.manage", "analytics.view", "audit.view", "settings.manage", "flags.manage", "staff.view"];

// Only the owner holds staff.manage by default. The database re-checks every call; an admin can never grant admin/owner.
export function StaffPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [reason, setReason] = useState("");
  const [pending, setPending] = useState<{ type: "role"; user: string; role: string; label: string } | { type: "perm"; user: string; perm: string; grant: boolean; label: string } | null>(null);
  const staff = useQuery({ queryKey: ["admin", "staff"], queryFn: async () => {
    const { data: roles, error } = await supabase.from("user_roles").select("user_id,role,granted_at").order("granted_at"); if (error) throw error;
    const rows = (roles ?? []) as { user_id: string; role: string; granted_at: string }[]; const ids = rows.map((r) => r.user_id);
    const { data: p } = await supabase.from("profiles").select("id,username,display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const { data: sp } = await supabase.from("staff_permissions").select("user_id,permission").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    return rows.map((r): StaffRow => { const pr = (p ?? []).find((x) => (x as { id: string }).id === r.user_id) as { username: string; display_name: string } | undefined; return { ...r, username: pr?.username ?? null, display_name: pr?.display_name ?? null, perms: (sp ?? []).filter((x) => (x as { user_id: string }).user_id === r.user_id).map((x) => (x as { permission: string }).permission) }; }); } });
  const found = useQuery({ queryKey: ["admin", "staff-search", term], enabled: term.length >= 2, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_search_users", { p_query: term, p_limit: 10 }); if (error) throw error; return (data ?? []) as Found[]; } });
  const run = useMutation({ mutationFn: async () => {
    if (!pending) return;
    const { error } = pending.type === "role" ? await supabase.rpc("admin_set_role", { p_target: pending.user, p_role: pending.role, p_reason: reason })
      : await supabase.rpc("admin_set_staff_permission", { p_target: pending.user, p_permission: pending.perm, p_granted: pending.grant, p_reason: reason });
    if (error) throw new Error(error.message); },
    onSuccess: () => { setPending(null); setReason(""); void qc.invalidateQueries({ queryKey: ["admin", "staff"] }); void qc.invalidateQueries({ queryKey: ["admin", "staff-search"] }); void qc.invalidateQueries({ queryKey: ["my-permissions"] }); } });
  const me = session?.user.id;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Administrators and moderators</h1>
      <p className="text-sm text-muted">Roles are stored in the database, not in the browser. Students cannot obtain a role by editing their profile or sending crafted requests. The owner role cannot be assigned here.</p>
      <section className="space-y-2"><h2 className="font-medium">Current staff</h2>
        {staff.isError && <p role="alert" className="err">You do not have permission to view staff.</p>}
        {staff.data?.map((s) => (
          <div key={s.user_id} className="card space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{s.display_name ?? "Unknown"} <span className="text-muted">@{s.username}</span></p><p className="text-xs text-muted">{s.role} · since {timeAgo(s.granted_at)}</p></div>
            {s.role !== "owner" && s.user_id !== me && <button className="btn-danger" onClick={() => setPending({ type: "role", user: s.user_id, role: "student", label: `Revoke staff access for @${s.username}` })}>Revoke access</button>}</div>
            {s.role !== "owner" && <details><summary className="cursor-pointer text-sm underline">Extra permissions ({s.perms.length})</summary>
              <div className="mt-2 grid gap-1 md:grid-cols-2">{ALL_PERMS.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.perms.includes(p)} onChange={(e) => setPending({ type: "perm", user: s.user_id, perm: p, grant: e.target.checked, label: `${e.target.checked ? "Grant" : "Remove"} ${p} for @${s.username}` })} />{p}</label>)}</div>
              <p className="mt-1 text-xs text-muted">Role defaults still apply; ticks here are additional grants.</p></details>}
          </div>))}
      </section>
      <section className="card space-y-3"><h2 className="font-medium">Add or change a staff member</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}><input className="input md:w-72" aria-label="Find user by username" placeholder="Find user by username or name" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn-primary">Find</button></form>
        {found.data?.length === 0 && <p className="text-sm text-muted">No users found.</p>}
        <ul className="space-y-2">{found.data?.map((u) => (<li key={u.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0"><span>{u.display_name} <span className="text-muted">@{u.username} · {u.role}</span></span>
          {u.role !== "owner" && u.user_id !== me && <span className="flex gap-1"><button className="btn" onClick={() => setPending({ type: "role", user: u.user_id, role: "moderator", label: `Make @${u.username} a moderator` })}>Moderator</button><button className="btn" onClick={() => setPending({ type: "role", user: u.user_id, role: "admin", label: `Make @${u.username} an administrator` })}>Administrator</button></span>}</li>))}</ul>
      </section>
      {pending && <div role="dialog" aria-modal="true" aria-label="Confirm staff change" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center"><div className="card w-full max-w-md space-y-3">
        <h2 className="font-semibold">{pending.label}</h2><label className="label" htmlFor="sr">Reason (recorded in the audit log)</label><textarea id="sr" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {run.isError && <p role="alert" className="err">{(run.error as Error).message.includes("only_owner") ? "Only the owner can manage administrators." : adminErrorMessage((run.error as Error).message)}</p>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={() => { setPending(null); run.reset(); }}>Cancel</button><button className="btn-danger" disabled={reason.trim().length < 5 || run.isPending} onClick={() => run.mutate()}>Confirm</button></div></div></div>}
    </div>
  );
}
