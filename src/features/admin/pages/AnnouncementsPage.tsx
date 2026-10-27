import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { listActiveInstitutions } from "@/features/institutions/api";
import { adminErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";

interface Ann { id: string; title: string; body: string; audience: string; institution_id: string | null; status: string; starts_at: string | null; ends_at: string | null; published_at: string | null; recipient_count: number | null; created_at: string }
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

export function AnnouncementsPage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", body: "", audience: "all", institution: "", starts: "", ends: "" });
  const [preview, setPreview] = useState(false);
  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const list = useQuery({ queryKey: ["admin", "announcements"], queryFn: async () => {
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(50); if (error) throw error; return (data ?? []) as Ann[]; } });
  const save = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("admin_save_announcement", { p_id: null, p_title: f.title, p_body: f.body, p_audience: f.audience, p_institution: f.audience === "institution" ? f.institution || null : null, p_starts: toIso(f.starts), p_ends: toIso(f.ends) }); if (error) throw new Error(error.message); },
    onSuccess: () => { setF({ title: "", body: "", audience: "all", institution: "", starts: "", ends: "" }); setPreview(false); void qc.invalidateQueries({ queryKey: ["admin", "announcements"] }); } });
  const valid = f.title.trim().length >= 3 && f.body.trim().length >= 3 && (f.audience === "all" || !!f.institution);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Announcements</h1>
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
        <h2 className="font-medium">New announcement (saved as a draft)</h2>
        <div><label className="label" htmlFor="at">Title</label><input id="at" className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label" htmlFor="ab">Message</label><textarea id="ab" className="input" rows={3} maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label" htmlFor="aa">Audience</label><select id="aa" className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">All students</option><option value="institution">One institution</option></select></div>
          {f.audience === "institution" && <div><label className="label" htmlFor="ai">Institution</label><select id="ai" className="input" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })}><option value="">Select…</option>{(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>}
          <div><label className="label" htmlFor="as">Show from (optional)</label><input id="as" type="datetime-local" className="input" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
          <div><label className="label" htmlFor="ae">Show until (optional)</label><input id="ae" type="datetime-local" className="input" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></div>
        </div>
        {preview && <div className="rounded-xl border border-primary p-3 text-sm"><p className="font-semibold">{f.title || "(title)"}</p><p className="whitespace-pre-wrap">{f.body || "(message)"}</p></div>}
        {save.isError && <p role="alert" className="err">{adminErrorMessage((save.error as Error).message)}</p>}
        <div className="flex gap-2"><button type="button" className="btn" onClick={() => setPreview((v) => !v)}>{preview ? "Hide preview" : "Preview"}</button><button className="btn-primary" disabled={!valid || save.isPending}>Save draft</button></div>
      </form>
      {list.isLoading && <p role="status">Loading…</p>}
      {list.data?.length === 0 && <p className="card text-center text-muted">No announcements yet.</p>}
      <ul className="space-y-3">{list.data?.map((a) => <AnnouncementRow key={a.id} a={a} />)}</ul>
    </div>
  );
}

function AnnouncementRow({ a }: { a: Ann }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(""); const [reason, setReason] = useState("");
  const recipients = useQuery({ queryKey: ["admin", "recipients", a.id], enabled: a.status === "draft", queryFn: async () => { const { data, error } = await supabase.rpc("admin_announcement_recipients", { p_id: a.id }); if (error) throw error; return Number(data); } });
  const done = () => void qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
  const publish = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("admin_publish_announcement", { p_id: a.id, p_confirm_count: Number(confirm) }); if (error) throw new Error(error.message); }, onSuccess: done });
  const unpublish = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("admin_unpublish_announcement", { p_id: a.id, p_reason: reason }); if (error) throw new Error(error.message); }, onSuccess: done });
  const err = (publish.error ?? unpublish.error) as Error | null;
  return (
    <li className="card space-y-2">
      <div className="flex items-center justify-between"><p className="font-medium">{a.title}</p><span className="text-xs rounded-full border border-line px-2 py-0.5">{a.status}</span></div>
      <p className="whitespace-pre-wrap text-sm">{a.body}</p>
      <p className="text-xs text-muted">Audience: {a.audience}{a.published_at ? ` · published ${timeAgo(a.published_at)} to ${a.recipient_count} students` : ` · created ${timeAgo(a.created_at)}`}</p>
      {a.status === "draft" && (
        <div className="space-y-2 rounded-lg bg-bg p-3 text-sm">
          <p>This will send an in-app notification to <strong>{recipients.data ?? "…"}</strong> students. It cannot be recalled.</p>
          <label className="label" htmlFor={`c-${a.id}`}>Type the number of recipients to confirm</label>
          <div className="flex gap-2"><input id={`c-${a.id}`} inputMode="numeric" className="input w-32" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="btn-primary" disabled={publish.isPending || recipients.data === undefined || Number(confirm) !== recipients.data} onClick={() => publish.mutate()}>Publish</button></div>
        </div>)}
      {a.status === "published" && (
        <div className="flex gap-2"><input aria-label="Reason to unpublish" className="input" placeholder="Reason (min 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" disabled={reason.trim().length < 5 || unpublish.isPending} onClick={() => unpublish.mutate()}>Unpublish</button></div>)}
      {err && <p role="alert" className="err">{err.message.includes("confirm_count_mismatch") ? "The audience size changed. Reload and confirm again." : err.message.includes("rate_limited") ? "Daily publish limit reached." : adminErrorMessage(err.message)}</p>}
    </li>
  );
}
