import type { ReactNode } from "react";

export function ConfirmDialog({ title, children, confirmLabel, danger = true, busy = false, onConfirm, onCancel }:
  { title: string; children?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="card w-full max-w-sm space-y-3">
        <h2 className="font-semibold">{title}</h2>
        {children && <div className="text-sm text-muted">{children}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn" autoFocus onClick={onCancel}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
