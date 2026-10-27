import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";

interface Setting { key: string; value: unknown; value_type: "boolean" | "string" | "number"; description: string; is_public: boolean; updated_at: string }
interface Flag { key: string; enabled: boolean; description: string; updated_at: string }

// Security-critical configuration (keys, secrets, auth providers) is intentionally NOT editable here.
export function PlatformSettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({}); const [confirmFlag, setConfirmFlag] = useState<Flag | null>(null);
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: async () => { const { data, error } = await supabase.from("platform_settings").select("*").order("key"); if (error) throw error; return (data ?? []) as Setting[]; } });
  const flags = useQuery({ queryKey: ["admin", "flags"], queryFn: async () => { const { data, error } = await supabase.from("feature_flags").select("*").order("key"); if (error) throw error; return (data ?? []) as Flag[]; } });
  const celebrations = useQuery({ queryKey: ["admin", "celebration-count"], queryFn: async () => { const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true }).not("celebration_url", "is", null); if (error) throw error; return count ?? 0; } });
  const saveSetting = useMutation({ mutationFn: async (s: Setting) => {
    const raw = draft[s.key] ?? ""; const value = s.value_type === "boolean" ? raw === "true" : s.value_type === "number" ? Number(raw) : raw;
    const { error } = await supabase.from("platform_settings").update({ value }).eq("key", s.key); if (error) throw new Error(error.message); },
    onSuccess: (_d, s) => { setDraft((d) => { const n = { ...d }; delete n[s.key]; return n; }); void qc.invalidateQueries({ queryKey: ["admin", "settings"] }); void qc.invalidateQueries({ queryKey: ["public-settings"] }); } });
  const toggleFlag = useMutation({ mutationFn: async (f: Flag) => { const { error } = await supabase.from("feature_flags").update({ enabled: !f.enabled }).eq("key", f.key); if (error) throw new Error(error.message); },
    onSuccess: () => { setConfirmFlag(null); void qc.invalidateQueries({ queryKey: ["admin", "flags"] }); void qc.invalidateQueries({ queryKey: ["flag"] }); } });
  const cur = (s: Setting) => draft[s.key] ?? String(s.value);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Platform settings</h1>
      <p className="text-sm text-muted">Every change is validated by the database and recorded in the audit log. Secrets, API keys and authentication providers are configured in deployment, never here.</p>
      <section className="card space-y-4"><h2 className="font-medium">Settings</h2>
        {settings.isError && <p role="alert" className="err">You do not have permission to view or change settings.</p>}
        {settings.data?.map((s) => (
          <div key={s.key} className="space-y-1 border-b border-line pb-3 last:border-0"><label className="label" htmlFor={s.key}>{s.key}</label><p className="text-xs text-muted">{s.description} · updated {timeAgo(s.updated_at)}</p>
            <div className="flex gap-2">
              {s.value_type === "boolean" ? <select id={s.key} className="input w-auto" value={cur(s)} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}><option value="true">On</option><option value="false">Off</option></select>
                : <input id={s.key} className="input" maxLength={500} type={s.value_type === "number" ? "number" : "text"} value={cur(s)} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />}
              <button className="btn-primary" disabled={draft[s.key] === undefined || saveSetting.isPending} onClick={() => saveSetting.mutate(s)}>Save</button></div></div>))}
        {saveSetting.isError && <p role="alert" className="err">That value was not accepted.</p>}
      </section>
      <section className="card space-y-3"><h2 className="font-medium">Feature flags</h2>
        <p className="text-sm text-muted">Flags switch features off in the backend too, not just in the interface.</p>
        {flags.data?.map((f) => (<div key={f.key} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0"><div><p className="font-medium">{f.key}</p><p className="text-xs text-muted">{f.description}</p>
          {f.key === "campus_celebrations" && <p className="text-xs text-muted">{celebrations.data ?? "–"} students have added a whiteshirt.fun link. CampusConnect only links out; it never reads whiteshirt.fun data.</p>}</div>
          <button className={f.enabled ? "btn-primary" : "btn"} aria-pressed={f.enabled} onClick={() => setConfirmFlag(f)}>{f.enabled ? "On" : "Off"}</button></div>))}
        {toggleFlag.isError && <p role="alert" className="err">Could not change the flag.</p>}
      </section>
      {confirmFlag && <div role="alertdialog" aria-modal="true" aria-label="Confirm flag change" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center"><div className="card w-full max-w-sm space-y-3">
        <h2 className="font-semibold">Turn {confirmFlag.enabled ? "off" : "on"} “{confirmFlag.key}”?</h2><p className="text-sm text-muted">This takes effect for all students immediately.</p>
        <div className="flex justify-end gap-2"><button className="btn" autoFocus onClick={() => setConfirmFlag(null)}>Cancel</button><button className="btn-primary" disabled={toggleFlag.isPending} onClick={() => toggleFlag.mutate(confirmFlag)}>Confirm</button></div></div></div>}
    </div>
  );
}
