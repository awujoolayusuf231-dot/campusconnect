import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type FeatureDialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function FeatureDialog({ title, onClose, children }: FeatureDialogProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line p-4 sm:p-6">
          <h2 id={titleId} className="text-xl font-black">{title}</h2>
          <button type="button" className="btn shrink-0" onClick={onClose}>Close</button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
