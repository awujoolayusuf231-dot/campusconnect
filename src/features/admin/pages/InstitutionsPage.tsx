import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LoadingState } from "@/app/LoadingState";

interface Inst { id: string; name: string; short_name: string | null; type: string; state: string | null; aliases: string[]; is_active: boolean }
const TYPES: [string, string][] = [["university", "University"], ["polytechnic", "Polytechnic"], ["college_of_education", "College of education"], ["other", "Other"]];
const EMPTY = { id: "", name: "", short_name: "", type: "university", state: "", aliases: "" };
const friendly = (m: string) => m.includes("institutions_name_key") || m.includes("duplicate key") ? "An institution with that name already exists." : m.includes("row-level security") || m.includes("permission denied") ? "You do not have permission to manage institutions." : "Please check the fields (name 3+ characters, up to 10 aliases).";

// Writes go straight to the table: RLS requires the institutions.manage permission and a trigger writes the audit log.
export function InstitutionsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [f, setF] = useState(EMPTY);
  const list = useQuery({ queryKey: ["admin", "institutions"], queryFn: async () => {
    const { data, error } = await supabase.from("institutions").select("id,name,short_name,type,state,aliases,is_active").order("name").limit(500); if (error) throw error; return (data ?? []) as Inst[]; } });
  const counts = useQuery<Map<string, number>>({ queryKey: ["admin", "institution-counts"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_institution_user_counts"); if (error) throw error; return new Map<string, number>((data ?? []).map((r: { institution_id: string; users: number }) => [r.institution_id, Number(r.users)])); } });
  const shown = (list.data ?? []).filter((i) => !q.trim() || (i.name + " " + (i.short_name ?? "") + " " + i.aliases.join(" ")).toLowerCase().includes(q.trim().toLowerCase()));
  const save = useMutation({ mutationFn: async () => {
    const row = { name: f.name.trim(), short_name: f.short_name.trim() || null, type: f.type, state: f.state.trim() || null, aliases: f.aliases.split(",").map((a) => a.trim()).filter(Boolean) };
    const { error } = f.id ? await supabase.from("institutions").update(row).eq("id", f.id) : await supabase.from("institutions").insert(row); if (error) throw new Error(error.message); },
    onSuccess: () => { setF(EMPTY); void qc.invalidateQueries({ queryKey: ["admin", "institutions"] }); void qc.invalidateQueries({ queryKey: ["institutions"] }); } });
  const toggle = useMutation({ mutationFn: async (i: Inst) => { const { error } = await supabase.from("institutions").update({ is_active: !i.is_active }).eq("id", i.id); if (error) throw new Error(error.message); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "institutions"] }); void qc.invalidateQueries({ queryKey: ["institutions"] }); } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Institutions</h1>
      <p className="text-sm text-muted">Students choose an institution themselves; it is <strong>not verified</strong>. Deactivating hides it from new selections but keeps existing profiles.</p>
      <form className="card grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-medium md:col-span-2">{f.id ? "Edit institution" : "Add institution"}</h2>
        <div><label className="label" htmlFor="in">Name</label><input id="in" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="is">Short name</label><input id="is" className="input" value={f.short_name} onChange={(e) => setF({ ...f, short_name: e.target.value })} /></div>
        <div><label className="label" htmlFor="it">Type</label><select id="it" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="ist">State</label><input id="ist" className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="ia">Aliases (comma separated)</label><input id="ia" className="input" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></div>
        {save.isError && <p role="alert" className="err md:col-span-2">{friendly((save.error as Error).message)}</p>}
        <div className="flex gap-2 md:col-span-2"><button className="btn-primary" disabled={save.isPending || f.name.trim().length < 3}>{f.id ? "Save" : "Add"}</button>{f.id && <button type="button" className="btn" onClick={() => setF(EMPTY)}>Cancel</button>}</div>
      </form>
      <input className="input md:w-72" aria-label="Search institutions" placeholder="Search institutions" value={q} onChange={(e) => setQ(e.target.value)} />
      {toggle.isError && <p role="alert" className="err">{friendly((toggle.error as Error).message)}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted"><tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">State</th><th className="p-3">Students</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
        <tbody>{list.isLoading && <tr><td className="p-3" colSpan={6}><LoadingState label="Finding institutions" /></td></tr>}{shown.length === 0 && !list.isLoading && <tr><td className="p-3 text-muted" colSpan={6}>No institutions yet.</td></tr>}
          {shown.map((i) => <tr key={i.id} className="border-b border-line last:border-0"><td className="p-3"><div className="font-medium">{i.name}</div><div className="text-muted">{[i.short_name, ...i.aliases].filter(Boolean).join(", ")}</div></td>
            <td className="p-3">{TYPES.find(([v]) => v === i.type)?.[1]}</td><td className="p-3">{i.state ?? "—"}</td><td className="p-3">{counts.data?.get(i.id) ?? 0}</td><td className="p-3">{i.is_active ? "Active" : "Inactive"}</td>
            <td className="p-3 text-right space-x-1"><button className="btn" onClick={() => setF({ id: i.id, name: i.name, short_name: i.short_name ?? "", type: i.type, state: i.state ?? "", aliases: i.aliases.join(", ") })}>Edit</button><button className="btn" disabled={toggle.isPending} onClick={() => toggle.mutate(i)}>{i.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
    </div>
  );
}
