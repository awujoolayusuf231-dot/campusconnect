import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, GraduationCap, Menu, Users, Compass, HeartHandshake, Info, Sparkles, LifeBuoy, X } from "lucide-react";
import { usePublicSettings } from "@/lib/publicSettings";
import { useAuth } from "@/features/auth/AuthProvider";

export function PublicLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const s = usePublicSettings().data;
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems = [
    { to: session ? "/app/learn" : "/login", label: "Learn", icon: BookOpen },
    { to: session ? "/app/collaborate" : "/login", label: "Collaborate", icon: Users },
    { to: session ? "/app/discover-hub" : "/login", label: "Discover", icon: Compass },
    { to: "/mission", label: "Our mission", icon: HeartHandshake },
    { to: "/features", label: "Features", icon: Sparkles },
    { to: "/about", label: "About", icon: Info },
    { to: "/contact", label: "Contact", icon: LifeBuoy },
  ];
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
          <div className="relative flex items-center gap-2">
            {session ? <Link to="/app" className="btn-primary hidden sm:inline-flex">Open app</Link> : <><Link to="/login" className="btn hidden sm:inline-flex">Log in</Link>{s?.registration_open !== false && <Link to="/register" className="btn-primary hidden sm:inline-flex">Join</Link>}</>}
            <button type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:border-primary/30 hover:bg-primary-soft hover:text-primary">
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav aria-label="Site" className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-1 px-4 pb-3 sm:grid-cols-3 sm:px-6">
            {menuItems.map(({ to, label, icon: Icon }) => (
              <Link key={label} to={to} onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-fg hover:bg-primary-soft hover:text-primary">
                <Icon size={17} aria-hidden="true" />{label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className={`motion-content mx-auto w-full flex-1 px-4 py-8 outline-none sm:px-6 ${wide ? "max-w-7xl" : "max-w-3xl"}`}>{children}</main>
      <footer className="border-t border-line bg-surface"><nav aria-label="Legal" className="mx-auto flex max-w-7xl flex-wrap gap-4 px-4 py-4 text-sm text-muted sm:px-6">
        <Link to="/community-guidelines" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Community guidelines</Link><Link to="/privacy" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Privacy</Link><Link to="/terms" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Terms</Link><Link to="/contact" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Support</Link>
        <span className="ml-auto">© {new Date().getFullYear()} {s?.platform_name ?? "CampusConnect"}</span></nav></footer>
    </div>
  );
}
