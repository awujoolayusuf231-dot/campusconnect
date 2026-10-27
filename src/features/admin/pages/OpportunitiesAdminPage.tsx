import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { adminErrorMessage } from "@/lib/errors";
import { OPP_CATEGORIES } from "@/features/opportunities/OpportunitiesPage";

interface Opp { id: string; title: string; organization: string | null; summary: string; description: string | null; category: string; external_url: string | null; deadline: string | null; status: string; featured: boolean; save_count: number; click_count: number }
const EMPTY = { id: "", title: "", organization: "", summary: "", description: "", category: "internship", external_url: "", deadline: "" };
const msg = (m: string) => m.includes("too_many_featured") ? "At most 5 opportunities can be featured." : m.includes("deadline_passed") ? "The deadline has already passed." : m.includes("only_published") ? "Only published opportunities can be featured." : m.includes("external_url_check") ? "The link must be a plain https:// address (no spaces, no login details)." : m.includes("check constraint") ? "Please check the fields: title 5+ chars, summary 10+ chars." : adminErrorMessage(m);

export function OpportunitiesAdminPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [f, setF] = useState(EMPTY);
  const [act, setAct] = useState<{ o: Opp; status: string; featured: boolean } | null>(null); const [reason, setReason] = useState("");
  const stats = useQuery({ queryKey: ["admin", "opp-stats"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_opportunity_stats"); if (error) throw error; return data as Record<string, number>; } });
  const list = useQuery({ queryKey: ["admin", "opps", status], queryFn: async () => {
    let q = supabase.from("opportunities").select("id,title,organization,summary,description,category,external_url,deadline,status,featured,save_count,click_count"); if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(100); if (error) throw error; return (data ?? []) as Opp[]; } });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "opps"] }); void qc.invalidateQueries({ queryKey: ["admin", "opp-stats"] }); void qc.invalidateQueries({ queryKey: ["opportunities"] }); };
  const save = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("admin_save_opportunity", { p_id: f.id || null, p_title: f.title, p_org: f.organization, p_summary: f.summary, p_desc: f.description, p_category: f.category, p_url: f.external_url, p_deadline: f.deadline || null }); if (error) throw new Error(error.message); }, onSuccess: () => { setF(EMPTY); refresh(); } });
  const state = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("admin_set_opportunity_state", { p_id: act!.o.id, p_status: act!.status, p_featured: act!.featured, p_reason: reason }); if (error) throw new Error(error.message); }, onSuccess: () => { setAct(null); setReason(""); refresh(); } });
  const archive = useMutation({ mutationFn: async () => { const { data, error } = await supabase.rpc("admin_archive_expired_opportunities"); if (error) throw new Error(error.message); return Number(data); }, onSuccess: refresh });
  const s = stats.data;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Opportunities</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{([["Published", s?.published], ["Drafts", s?.drafts], ["Featured", s?.featured], ["Expired, not archived", s?.expired_not_archived], ["Expiring in 7 days", s?.expiring_7d], ["Unique saves", s?.total_saves], ["Unique apply clicks", s?.total_clicks], ["Archived", s?.archived]] as [string, number | undefined][]).map(([l, v]) => <div key={l} className="card"><p className="text-sm text-muted">{l}</p><p className="text-2xl font-semibold">{v ?? "–"}</p></div>)}</div>
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-medium">{f.id ? "Edit opportunity" : "New opportunity (saved as draft)"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label" htmlFor="ot">Title</label><input id="ot" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label className="label" htmlFor="oo">Organisation</label><input id="oo" className="input" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} /></div>
          <div><label className="label" htmlFor="oc">Category</label><select id="oc" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{OPP_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="od">Deadline (optional)</label><input id="od" type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
        </div>
        <div><label className="label" htmlFor="os">Summary (10–300 characters)</label><textarea id="os" className="input" rows={2} maxLength={300} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
        <div><label className="label" htmlFor="ox">Details (optional)</label><textarea id="ox" className="input" rows={4} maxLength={4000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div><label className="label" htmlFor="ou">External application link (https only)</label><input id="ou" className="input" inputMode="url" value={f.external_url} onChange={(e) => setF({ ...f, external_url: e.target.value })} /></div>
        {save.isError && <p role="alert" className="err">{msg((save.error as Error).message)}</p>}
        <div className="flex gap-2"><button className="btn-primary" disabled={save.isPending}>{f.id ? "Save changes" : "Save draft"}</button>{f.id && <button type="button" className="btn" onClick={() => setF(EMPTY)}>Cancel edit</button>}</div>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status filter" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option>draft</option><option>published</option><option>archived</option></select>
        <button className="btn" disabled={archive.isPending} onClick={() => archive.mutate()}>Archive expired</button>
        {archive.isSuccess && <span role="status" className="text-sm">Archived {archive.data}.</span>}{archive.isError && <span role="alert" className="err">{msg((archive.error as Error).message)}</span>}
      </div>
      <ul className="space-y-2">{list.data?.map((o) => (
        <li key={o.id} className="card space-y-1"><div className="flex items-start justify-between gap-2"><p className="font-medium">{o.title}{o.featured ? " ★" : ""}</p><span className="rounded-full border border-line px-2 text-xs">{o.status}</span></div>
          <p className="text-xs text-muted">{o.category} · {o.deadline ?? "no deadline"} · {o.save_count} saves · {o.click_count} apply clicks{o.external_url ? ` · ${o.external_url.replace(/^https:\/\//, "").split("/")[0]}` : ""}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn" onClick={() => setF({ id: o.id, title: o.title, organization: o.organization ?? "", summary: o.summary, description: o.description ?? "", category: o.category, external_url: o.external_url ?? "", deadline: o.deadline ?? "" })}>Edit</button>
            {o.status !== "published" && <button className="btn-primary" onClick={() => setAct({ o, status: "published", featured: false })}>Publish</button>}
            {o.status === "published" && <button className="btn" onClick={() => setAct({ o, status: "draft", featured: false })}>Unpublish</button>}
            {o.status === "published" && <button className="btn" onClick={() => setAct({ o, status: "published", featured: !o.featured })}>{o.featured ? "Unfeature" : "Feature"}</button>}
            {o.status !== "archived" && <button className="btn" onClick={() => setAct({ o, status: "archived", featured: false })}>Archive</button>}
          </div></li>))}</ul>
      {list.data?.length === 0 && <p className="card text-center text-muted">Nothing here yet.</p>}
      {act && (
        <div role="dialog" aria-modal="true" aria-label="Confirm" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card w-full max-w-md space-y-3"><h2 className="font-semibold">{act.status} “{act.o.title}”{act.featured ? " (featured)" : ""}</h2>
            <label className="label" htmlFor="or">Reason (recorded in the audit log)</label><textarea id="or" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {state.isError && <p role="alert" className="err">{msg((state.error as Error).message)}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setAct(null)}>Cancel</button><button className="btn-primary" disabled={reason.trim().length < 5 || state.isPending} onClick={() => state.mutate()}>Confirm</button></div></div></div>)}
    </div>
  );
}
