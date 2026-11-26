import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({ title, children, confirmLabel, danger = true, busy = false, confirmDisabled = false, onConfirm, onCancel }:
  { title: string; children?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; confirmDisabled?: boolean; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-4"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="card max-h-[calc(100dvh-2rem)] w-full max-w-sm space-y-3 overflow-y-auto">
        <h2 className="font-semibold">{title}</h2>
        {children && <div className="text-sm text-muted">{children}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn" autoFocus onClick={onCancel}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
