// Permission-aware admin navigation. UI hint only: every action is re-authorized by the database.
// RULE: only list a route here once its page is implemented. No placeholder menu items.
export interface AdminNavItem { label: string; to: string; permission: string }
export interface AdminNavSection { title: string; items: AdminNavItem[] }

export const ADMIN_NAV: AdminNavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", to: "/admin", permission: "analytics.view" }] },
  { title: "People", items: [
    { label: "Users", to: "/admin/users", permission: "users.view" },
    { label: "Staff", to: "/admin/staff", permission: "staff.view" },
    { label: "Institutions", to: "/admin/institutions", permission: "institutions.manage" }] },
  { title: "Content", items: [{ label: "Reports", to: "/admin/reports", permission: "reports.manage" }] },
  { title: "Community", items: [{ label: "Communities", to: "/admin/communities", permission: "communities.manage" }] },
  { title: "Student services", items: [{ label: "Opportunities", to: "/admin/opportunities", permission: "opportunities.manage" }] },
  { title: "Communication", items: [{ label: "Announcements", to: "/admin/announcements", permission: "announcements.manage" }] },
  { title: "Platform", items: [
    { label: "Settings and flags", to: "/admin/settings", permission: "settings.manage" },
    { label: "Audit log", to: "/admin/audit", permission: "audit.view" }] },
];

export function visibleNav(permissions: readonly string[]): AdminNavSection[] {
  const allowed = new Set(permissions);
  return ADMIN_NAV
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed.has(i.permission)) }))
    .filter((s) => s.items.length > 0);
}
