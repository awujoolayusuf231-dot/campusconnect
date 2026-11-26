import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { celebrationUrlSchema } from "@/validation/profile";
import { LoadingState } from "@/app/LoadingState";

// The ONLY site this dialog can show. Fixed on purpose: never built from user input.
export const WHITESHIRT_HOME = "https://www.whiteshirt.fun/?ref=ecomedge";

/** Finds the first valid whiteshirt.fun link inside pasted text. Lookalike domains and other sites are ignored. */
export function extractBoardUrl(input: string): string | null {
  for (const raw of input.split(/\s+/)) {
    const token = raw.replace(/^[<("'[]+/, "").replace(/[>)"',;\]]+$/, "").replace(/\.+$/, "");
    if (token && celebrationUrlSchema.safeParse(token).success) return token;
  }
  return null;
}

interface Props { onUse: (url: string) => void; onClose: () => void }

export function WhiteshirtDialog({ onUse, onClose }: Props) {
  const [pasted, setPasted] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [clipboardNote, setClipboardNote] = useState("");
  const url = extractBoardUrl(pasted);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => setSlow(true), 6000);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; window.clearTimeout(t); };
  }, [onClose]);

  async function pasteFromClipboard() {
    setClipboardNote("");
    try { setPasted(await navigator.clipboard.readText()); }
    catch { setClipboardNote("Your browser did not allow reading the clipboard. Paste the link into the box instead."); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ws-title" className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/50 md:items-center md:p-6">
      <div className="flex h-full w-full flex-col bg-bg md:h-[88dvh] md:max-w-4xl md:overflow-hidden md:rounded-xl md:border md:border-line">
        <header className="flex items-center gap-3 border-b border-line bg-surface p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
          <h2 id="ws-title" className="flex-1 font-semibold">Create your celebration board on whiteshirt.fun</h2>
          <button type="button" aria-label="Close" autoFocus className="rounded p-1 hover:bg-bg" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-muted">Whiteshirt.fun is a separate site and may block embedded viewing. Your CampusConnect login is not shared with it.</p>
          <a href={WHITESHIRT_HOME} target="_blank" rel="noopener noreferrer" className="btn min-h-9 shrink-0 gap-1.5 px-3 text-xs font-bold">
            Open in browser <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="relative flex-1 bg-surface">
          {!loaded && <div className="absolute inset-0 grid place-items-center bg-surface/90 p-4"><LoadingState label="Opening your celebration board" variant="panel" /></div>}
          <iframe title="whiteshirt.fun" src={WHITESHIRT_HOME} onLoad={() => setLoaded(true)} className="relative h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
        </div>
        {(slow || loaded) && (
          <p className="border-t border-line bg-surface px-3 py-2 text-xs text-muted">
            If the embedded page is blank or says “refused to connect”, open it in your browser, create your board there, then come back and paste the link.
          </p>)}
        <footer className="space-y-2 border-t border-line bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <label className="label" htmlFor="ws-link">When your board is ready, paste its link here</label>
          <div className="flex flex-wrap gap-2">
            <input id="ws-link" className="input min-w-0 flex-1" inputMode="url" autoComplete="off" placeholder="https://whiteshirt.fun/…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <button type="button" className="btn" onClick={() => void pasteFromClipboard()}>Paste</button>
            <button type="button" className="btn-primary" disabled={!url} onClick={() => url && onUse(url)}>Use this link</button>
          </div>
          {pasted.trim() && !url && <p role="alert" className="err">That is not a whiteshirt.fun board link. It must start with https://whiteshirt.fun/ or https://www.whiteshirt.fun/.</p>}
          {url && <p role="status" className="text-xs text-muted">Link found: {url}</p>}
          {clipboardNote && <p className="text-xs text-muted">{clipboardNote}</p>}
        </footer>
      </div>
    </div>
  );
}
