import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const KEY = "cc.dismissed-announcements";
function loadDismissed(): string[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { return []; } }

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);
  const q = useQuery({ queryKey: ["announcements", "active"], staleTime: 120_000, queryFn: async () => {
    const { data, error } = await supabase.from("announcements").select("id,title,body").eq("status", "published").order("published_at", { ascending: false }).limit(3);
    if (error) throw error; return (data ?? []) as { id: string; title: string; body: string }[]; } });
  const visible = (q.data ?? []).filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;
  const dismiss = (id: string) => { const next = [...dismissed, id]; setDismissed(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  return (
    <div className="space-y-2" aria-label="Announcements">
      {visible.map((a) => (
        <div key={a.id} role="status" className="flex items-start gap-3 rounded-xl border border-primary bg-surface p-3 text-sm">
          <div className="flex-1"><p className="font-semibold">{a.title}</p><p className="whitespace-pre-wrap">{a.body}</p></div>
          <button aria-label="Dismiss announcement" onClick={() => dismiss(a.id)}><X size={16} /></button></div>))}
    </div>
  );
}
