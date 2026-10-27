import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { usePublicSettings } from "@/lib/publicSettings";
import { useAuth } from "@/features/auth/AuthProvider";

export function PublicLayout({ children }: { children: ReactNode }) {
  const s = usePublicSettings().data;
  const { session } = useAuth();
  const brand = s?.platform_name ?? "CampusConnect";
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:text-primary ${isActive ? "text-primary" : "text-muted"}`;
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {s?.maintenance_message && <div role="status" className="bg-danger px-4 py-2 text-center text-sm font-medium text-white">{s.maintenance_message}</div>}
      {s?.announcement_banner && <div role="status" className="border-b border-primary/10 bg-[#fffafa] px-4 py-2 text-center text-sm">{s.announcement_banner}</div>}
      <header className="sticky top-0 z-20 border-b border-line/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${brand} home`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <GraduationCap size={21} aria-hidden="true" />
            </span>
            <span className="text-[17px] font-extrabold tracking-tight">{brand === "CampusConnect" ? <>Campus<span className="text-primary">Connect</span></> : brand}</span>
          </Link>
          <nav aria-label="Site" className="flex items-center gap-0.5 sm:gap-1">
            <NavLink to="/features" className={({ isActive }) => `${link({ isActive })} hidden sm:inline-flex`}>Features</NavLink>
            <NavLink to="/about" className={({ isActive }) => `${link({ isActive })} hidden md:inline-flex`}>About</NavLink>
            <NavLink to="/contact" className={({ isActive }) => `${link({ isActive })} hidden md:inline-flex`}>Contact</NavLink>
            {session ? (
              <Link to="/app" className="btn-primary ml-1 !px-3 sm:ml-2 sm:!px-4">Open app</Link>
            ) : (
              <>
                <Link to="/login" className="whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-fg transition hover:bg-bg sm:px-3">Log in</Link>
                {s?.registration_open !== false && <Link to="/register" className="btn-primary ml-1 !px-3 sm:ml-2 sm:!px-4">Join</Link>}
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <footer className="border-t border-line/80 bg-[#fffafa]">
        <nav aria-label="Legal" className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-muted sm:justify-start sm:px-6 lg:px-8">
          <Link to="/community-guidelines" className="transition hover:text-primary">Community guidelines</Link>
          <Link to="/privacy" className="transition hover:text-primary">Privacy</Link>
          <Link to="/terms" className="transition hover:text-primary">Terms</Link>
          <Link to="/contact" className="transition hover:text-primary">Support</Link>
          <span className="w-full text-center sm:ml-auto sm:w-auto">© {new Date().getFullYear()} {brand}</span>
        </nav>
      </footer>
    </div>
  );
}
