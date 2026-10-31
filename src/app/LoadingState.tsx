import { LoaderCircle } from "lucide-react";

type LoadingStateProps = {
  label?: string;
  variant?: "inline" | "panel" | "page";
  className?: string;
};

export function LoadingState({ label = "Getting things ready", variant = "inline", className = "" }: LoadingStateProps) {
  if (variant === "page") {
    return (
      <div role="status" aria-busy="true" className={`flex min-h-[45vh] flex-col items-center justify-center gap-4 px-6 text-center ${className}`}>
        <span className="relative grid h-16 w-16 place-items-center rounded-[22px] border border-[#efd9db] bg-white shadow-[0_12px_36px_rgba(80,30,30,0.10)]">
          <span aria-hidden="true" className="absolute inset-1 rounded-[18px] border-2 border-primary/10 border-t-primary animate-spin" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <span className="text-sm font-semibold text-fg">{label}</span>
        <span aria-hidden="true" className="h-1 w-32 overflow-hidden rounded-full bg-[#f3e7e8]">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
        </span>
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div role="status" aria-busy="true" className={`flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.04)] ${className}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary">
          <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-muted">{label}</span>
      </div>
    );
  }

  return (
    <span role="status" aria-busy="true" className={`inline-flex items-center gap-2 text-sm text-muted ${className}`}>
      <LoaderCircle size={16} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
