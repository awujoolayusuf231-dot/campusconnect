import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import { socialErrorMessage } from "@/lib/errors";
import { LoadingState } from "@/app/LoadingState";

interface Opp { id: string; title: string; organization: string | null; summary: string; category: string; deadline: string | null; featured: boolean; save_count: number; saved_by_me: boolean; external_host: string | null }
interface Detail { id: string; title: string; organization: string | null; summary: string; description: string | null; external_url: string | null; deadline: string | null }
export const OPP_CATEGORIES: [string, string][] = [["internship", "Internships"], ["scholarship", "Scholarships"], ["training", "Training"], ["competition", "Competitions"], ["career", "Career"], ["program", "Programs"]];
const PAGE = 20;

// Only ever send the visitor to an https URL; the database enforces the same rule.
export const isSafeExternalUrl = (u: string | null): u is string => !!u && /^https:\/\/[a-z0-9]/i.test(u) && !/[\s<>"]/.test(u);
export function daysLeft(deadline: string | null, today = new Date()): string | null {
  if (!deadline) return null;
  const d = Math.ceil((new Date(deadline + "T23:59:59").getTime() - today.getTime()) / 86400000);
  return d <= 0 ? "Closes today" : d === 1 ? "1 day left" : `${d} days left`;
}

export function OpportunitiesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [cat, setCat] = useState(""); const [saved, setSaved] = useState(false); const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null); const [reporting, setReporting] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["opportunities", term, cat, saved, page], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_opportunities", { p_category: cat || null, p_q: term || null, p_saved: saved, p_limit: PAGE, p_offset: page * PAGE });
    if (error) throw error; return (data ?? []) as Opp[]; } });
  const toggle = useMutation({ mutationFn: async (o: Opp) => {
    if (o.saved_by_me) { const { error } = await supabase.from("opportunity_saves").delete().eq("opportunity_id", o.id); if (error) throw error; }
    else { const { error } = await supabase.from("opportunity_saves").insert({ opportunity_id: o.id }); if (error) throw error; } },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["opportunities"] }) });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Opportunities</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setTerm(q.trim()); }}>
        <input className="input w-full md:w-64" aria-label="Search" placeholder="Search title or organisation" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Category" value={cat} onChange={(e) => { setPage(0); setCat(e.target.value); }}><option value="">All categories</option>{OPP_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => { setPage(0); setSaved(e.target.checked); }} /> Saved only</label>
        <button className="btn-primary">Search</button>
      </form>
      {list.isLoading && <LoadingState label="Finding opportunities" variant="panel" />}
      {list.isError && <p role="alert" className="err">Could not load opportunities.</p>}
      {list.data?.length === 0 && <p className="card text-center text-muted">{saved ? "You have not saved anything yet." : "No opportunities match right now. Check back soon."}</p>}
      {toggle.isError && <p role="alert" className="err">{socialErrorMessage((toggle.error as Error).message)}</p>}
      <ul className="space-y-3">{list.data?.map((o) => (
        <li key={o.id} className={`card space-y-1 ${o.featured ? "border-primary" : ""}`}>
          <div className="flex items-start gap-2"><button className="flex-1 text-left" onClick={() => setOpen(o.id)}>
            {o.featured && <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-fg">Featured</span>}
            <span className="font-medium hover:underline">{o.title}</span></button>
            <button aria-label={o.saved_by_me ? "Remove from saved" : "Save"} aria-pressed={o.saved_by_me} disabled={toggle.isPending} onClick={() => toggle.mutate(o)}><Bookmark size={18} fill={o.saved_by_me ? "currentColor" : "none"} /></button></div>
          <p className="text-xs text-muted">{OPP_CATEGORIES.find(([v]) => v === o.category)?.[1]}{o.organization ? ` · ${o.organization}` : ""}{o.deadline ? ` · ${daysLeft(o.deadline)} (${o.deadline})` : " · No deadline"}</p>
          <p className="text-sm">{o.summary}</p>
        </li>))}</ul>
      <div className="flex justify-between"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={(list.data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Next</button></div>
      {open && <DetailDialog id={open} onClose={() => setOpen(null)} onReport={() => { setReporting(open); setOpen(null); }} />}
      {reporting && <ReportDialog type="opportunity" targetId={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}

function DetailDialog({ id, onClose, onReport }: { id: string; onClose: () => void; onReport: () => void }) {
  const d = useQuery({ queryKey: ["opportunity", id], queryFn: async () => {
    const { data, error } = await supabase.from("opportunities").select("id,title,organization,summary,description,external_url,deadline").eq("id", id).maybeSingle(); if (error) throw error; return data as Detail | null; } });
  const click = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("record_opportunity_click", { p_id: id }); if (error) throw error; } });
  const o = d.data; const host = o?.external_url ? o.external_url.replace(/^https:\/\//i, "").split(/[/:?#]/)[0] : null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Opportunity details" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="card max-h-[85dvh] w-full max-w-lg space-y-3 overflow-y-auto">
        {d.isLoading && <LoadingState label="Preparing opportunity details" />}
        {!d.isLoading && !o && <p>This opportunity is no longer available.</p>}
        {o && <>
          <h2 className="text-lg font-semibold">{o.title}</h2>
          <p className="text-sm text-muted">{o.organization ?? "Organisation not stated"}{o.deadline ? ` · Deadline ${o.deadline}` : ""}</p>
          <p>{o.summary}</p>{o.description && <p className="whitespace-pre-wrap text-sm">{o.description}</p>}
          {isSafeExternalUrl(o.external_url) && (
            <div className="rounded-lg border border-line bg-bg p-3 text-sm">
              <p className="mb-2">The application is on an external website (<strong>{host}</strong>). CampusConnect does not run it and has not verified it.</p>
              <a className="btn-primary" href={o.external_url} target="_blank" rel="noopener noreferrer nofollow" onClick={() => click.mutate()}>Apply on {host} <ExternalLink size={14} className="ml-1" aria-hidden="true" /></a>
            </div>)}
        </>}
        <div className="flex justify-between"><button className="text-sm underline text-muted" onClick={onReport}>Report this opportunity</button><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
