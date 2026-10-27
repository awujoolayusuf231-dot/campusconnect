import { NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, GraduationCap, ShieldCheck } from "lucide-react";
import { visibleNav } from "./nav";
import { useMyPermissions } from "./useMyPermissions";

export function AdminLayout() {
  const perms = useMyPermissions();
  const sections = visibleNav(perms.data ?? []);
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-primary/10 font-semibold text-primary" : "text-muted hover:bg-bg hover:text-fg"}`;
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/app" className="flex items-center gap-2.5" aria-label="Back to CampusConnect">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white"><GraduationCap size={21} aria-hidden="true" /></span>
            <span className="text-[17px] font-extrabold tracking-tight">Campus<span className="text-primary">Connect</span></span>
          </NavLink>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/[0.08] px-3 py-1.5 text-xs font-bold text-primary"><ShieldCheck size={15} aria-hidden="true" />Admin workspace</span>
          <NavLink to="/app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-primary"><ArrowLeft size={16} aria-hidden="true" /><span className="hidden sm:inline">Back to app</span></NavLink>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-7">
        <aside className="min-w-0 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)] lg:overflow-y-auto">
          <div className="mb-3 hidden px-3 lg:block"><p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Workspace</p></div>
          <nav aria-label="Admin" className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-5 lg:overflow-visible lg:pb-0">
            {sections.map((section) => (
              <div key={section.title} className="shrink-0 lg:shrink">
                <p className="mb-1 hidden px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted lg:block">{section.title}</p>
                <div className="flex gap-1 lg:flex-col">
                  {section.items.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/admin"} className={link}>{item.label}</NavLink>)}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6 lg:p-8">
          {perms.isLoading ? <p role="status" className="text-sm text-muted">Loading admin permissions…</p>
            : perms.isError ? <p role="alert" className="err">Could not load permissions.</p>
              : <Outlet />}
        </main>
      </div>
    </div>
  );
}
