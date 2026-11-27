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
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
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
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <section aria-labelledby="social-links-heading" className="min-w-0">
            <h2 id="social-links-heading" className="mb-2 text-xs font-bold text-fg">Follow CampusConnect</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
              <a href="https://www.tiktok.com/@campus.connect36" target="_blank" rel="noopener noreferrer" aria-label="TikTok @campus.connect36 (opens in a new tab)" className="inline-flex min-h-8 items-center gap-1.5 rounded-md transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-4.22-4.25V2h-3.57v13.67a2.9 2.9 0 0 1-2.9 2.75 2.9 2.9 0 0 1-2.9-2.9 2.9 2.9 0 0 1 2.9-2.9c.3 0 .59.05.86.13V9.12a6.48 6.48 0 0 0-.86-.06A6.47 6.47 0 0 0 2.43 15.5a6.47 6.47 0 0 0 12.94 0V8.55a8.35 8.35 0 0 0 4.88 1.57V6.56a4.8 4.8 0 0 1-.66.13Z" /></svg>
              </a>
              <a href="https://x.com/campusconnectai" target="_blank" rel="noopener noreferrer" aria-label="X @campusconnectai (opens in a new tab)" className="inline-flex min-h-8 items-center gap-1.5 rounded-md transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-7.42L5.56 22H2.44l7.25-8.29L1.8 2h6.4l4.43 6.77L18.9 2Zm-1.1 18h1.73L7.27 3.89H5.4L17.8 20Z" /></svg>
              </a>
              <a href="https://www.instagram.com/campus_connectai/" target="_blank" rel="noopener noreferrer" aria-label="Instagram @campus_connectai (opens in a new tab)" className="inline-flex min-h-8 items-center gap-1.5 rounded-md transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm4.2 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-3.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" /></svg>
              </a>
            </div>
          </section>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <Link to="/community-guidelines" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Community guidelines</Link>
            <Link to="/privacy" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Privacy</Link>
            <Link to="/terms" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Terms</Link>
            <Link to="/contact" className="rounded-md no-underline transition hover:text-primary hover:underline-offset-4">Support</Link>
            <span>© {new Date().getFullYear()} {s?.platform_name ?? "CampusConnect"}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
