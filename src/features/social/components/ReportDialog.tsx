import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { REPORT_CATEGORIES, submitReport, type ReportTarget } from "../api";
import { socialErrorMessage } from "@/lib/errors";

export function ReportDialog({ type, targetId, onClose }: { type: ReportTarget; targetId: string; onClose: () => void }) {
  const [category, setCategory] = useState("spam");
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: () => submitReport(type, targetId, category, text.trim()) });
  return (
    <div role="dialog" aria-modal="true" aria-label={`Report ${type}`} className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="card w-full max-w-md space-y-3">
        {m.isSuccess ? (
          <>
            <h2 className="font-semibold">Thanks for the report</h2>
            <p className="text-sm text-muted">Our moderators will review it. The person you reported is not told who reported them.</p>
            <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <>
            <h2 className="font-semibold">Report this {type}</h2>
            <div><label className="label" htmlFor="rc">Reason</label>
              <select id="rc" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {REPORT_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className="label" htmlFor="rt">Details (optional)</label>
              <textarea id="rt" className="input" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /></div>
            {m.isError && <p role="alert" className="err">{socialErrorMessage((m.error as Error).message)}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Sending…" : "Submit report"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
