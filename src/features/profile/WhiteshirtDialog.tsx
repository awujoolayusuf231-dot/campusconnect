import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { celebrationUrlSchema } from "@/validation/profile";

// The ONLY site this dialog can show. Fixed on purpose: never built from user input.
export const WHITESHIRT_HOME = "https://www.whiteshirt.fun/";

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
  // A small separate browser window (not a tab) as a fallback if whiteshirt.fun refuses to be shown inside another site.
  const openSmallWindow = () => { window.open(WHITESHIRT_HOME, "whiteshirt", "popup=yes,width=480,height=760,noopener,noreferrer"); };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ws-title" className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/50 md:items-center md:p-6">
      <div className="flex h-full w-full flex-col bg-bg md:h-[88dvh] md:max-w-4xl md:overflow-hidden md:rounded-xl md:border md:border-line">
        <header className="flex items-center gap-3 border-b border-line bg-surface p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
          <h2 id="ws-title" className="flex-1 font-semibold">Create your celebration board on whiteshirt.fun</h2>
          <button type="button" className="btn hidden md:inline-flex" onClick={openSmallWindow}>Open in a small window <ExternalLink size={14} className="ml-1" aria-hidden="true" /></button>
          <button type="button" aria-label="Close" autoFocus className="rounded p-1 hover:bg-bg" onClick={onClose}><X size={20} /></button>
        </header>
        <p className="border-b border-line bg-surface px-3 py-2 text-xs text-muted">This is the real whiteshirt.fun site shown inside CampusConnect. Your CampusConnect login is not shared with it, and CampusConnect cannot see what you type there. Create your board, then paste its link below.</p>
        <div className="relative flex-1 bg-surface">
          {!loaded && <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading whiteshirt.fun…</p>}
          <iframe title="whiteshirt.fun" src={WHITESHIRT_HOME} onLoad={() => setLoaded(true)} className="relative h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
        </div>
        {(slow || loaded) && (
          <p className="border-t border-line bg-surface px-3 py-2 text-xs text-muted">
            Blank page or “refused to connect”? whiteshirt.fun may not allow being shown inside other sites.{" "}
            <button type="button" className="underline" onClick={openSmallWindow}>Open it in a small window</button>, create your board there, then come back and paste the link.
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
