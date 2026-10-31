import { NavLink, Outlet } from "react-router-dom";
import { visibleNav } from "./nav";
import { useMyPermissions } from "./useMyPermissions";

export function AdminLayout() {
  const perms = useMyPermissions();
  const sections = visibleNav(perms.data ?? []);
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to main content</a>
      <aside className="border-b border-line bg-surface p-4 md:w-60 md:border-b-0 md:border-r">
        <p className="mb-3 font-semibold">CampusConnect Admin</p>
        <nav aria-label="Admin" className="flex gap-4 overflow-x-auto md:flex-col md:gap-5">
          {sections.map((s) => (
            <div key={s.title}>
              <p className="mb-1 hidden text-xs uppercase tracking-wide text-muted md:block">{s.title}</p>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end className={({ isActive }) => `block whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${isActive ? "bg-primary text-primary-fg" : "hover:bg-bg"}`}>{i.label}</NavLink>
              ))}
            </div>
          ))}
          <NavLink to="/app" className="whitespace-nowrap px-2 py-1.5 text-sm text-muted underline">Back to app</NavLink>
        </nav>
      </aside>
      <main id="main" tabIndex={-1} className="motion-content flex-1 p-4 outline-none md:p-8">
        {perms.isLoading ? <p role="status">Loading…</p> : perms.isError ? <p role="alert" className="err">Could not load permissions.</p> : <Outlet />}
      </main>
    </div>
  );
}
