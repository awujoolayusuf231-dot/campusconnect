import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { usePublicSettings } from "@/lib/publicSettings";
import { useAuth } from "@/features/auth/AuthProvider";

export function PublicLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const s = usePublicSettings().data;
  const { session } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) => `px-2 py-1 text-sm ${isActive ? "font-semibold underline" : "text-muted"}`;
  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to main content</a>
      {s?.maintenance_message && <div role="status" className="bg-danger px-4 py-2 text-center text-sm text-white">{s.maintenance_message}</div>}
      {s?.announcement_banner && <div role="status" className="border-b border-line bg-surface px-4 py-2 text-center text-sm">{s.announcement_banner}</div>}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="inline-flex shrink-0 items-center gap-2.5" aria-label="CampusConnect home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm"><GraduationCap size={20} aria-hidden="true" /></span>
            <span className="text-base font-black tracking-tight text-fg sm:text-lg">{s?.platform_name ?? "CampusConnect"}</span>
          </Link>
          <nav aria-label="Site" className="flex flex-wrap items-center justify-end gap-y-1">
            <NavLink to="/features" className={link}>Features</NavLink><NavLink to="/about" className={link}>About</NavLink><NavLink to="/contact" className={link}>Contact</NavLink>
            {session ? <Link to="/app" className="btn-primary ml-2">Open app</Link> : <><Link to="/login" className="btn ml-2">Log in</Link>{s?.registration_open !== false && <Link to="/register" className="btn-primary ml-2">Join</Link>}</>}
          </nav></div></header>
      <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 px-4 py-8 outline-none sm:px-6 ${wide ? "max-w-7xl" : "max-w-3xl"}`}>{children}</main>
      <footer className="border-t border-line bg-surface"><nav aria-label="Legal" className="mx-auto flex max-w-7xl flex-wrap gap-4 px-4 py-4 text-sm text-muted sm:px-6">
        <Link to="/community-guidelines" className="underline">Community guidelines</Link><Link to="/privacy" className="underline">Privacy</Link><Link to="/terms" className="underline">Terms</Link><Link to="/contact" className="underline">Support</Link>
        <span className="ml-auto">© {new Date().getFullYear()} {s?.platform_name ?? "CampusConnect"}</span></nav></footer>
    </div>
  );
}
