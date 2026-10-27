import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, BriefcaseBusiness, Compass, GraduationCap, Home, MessageCircle, Settings, Sparkles, UserRound, Users } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useUnreadCounts } from "@/features/notifications/useRealtimeCounts";
import { AnnouncementBanner } from "@/features/announcements/AnnouncementBanner";

export function StudentLayout() {
  const { session, role } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const counts = useUnreadCounts();
  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => navigate("/", { replace: true }),
  });
  const me = useQuery({
    queryKey: ["me-username", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", session!.user.id).maybeSingle();
      return (data as { username: string } | null)?.username ?? null;
    },
  });
  const items = [
    { to: "/app", label: "Home feed", icon: Home, end: true, badge: 0 },
    { to: "/app/discover", label: "Discover", icon: Compass, end: false, badge: 0 },
    { to: "/app/communities", label: "Communities", icon: Users, end: false, badge: 0 },
    { to: "/app/opportunities", label: "Opportunities", icon: BriefcaseBusiness, end: false, badge: 0 },
    { to: "/app/messages", label: "Messages", icon: MessageCircle, end: false, badge: counts.messages },
    { to: "/app/notifications", label: "Notifications", icon: Bell, end: false, badge: counts.notifications },
    { to: me.data ? `/app/u/${me.data}` : "/app/profile/edit", label: "My profile", icon: UserRound, end: false, badge: 0 },
    { to: "/app/settings", label: "Settings", icon: Settings, end: false, badge: 0 },
  ];
  const mobileItems = items.filter((i) => ["Home feed", "Discover", "Communities", "Opportunities", "Messages", "Notifications"].includes(i.label));
  const inChat = /^\/app\/messages\/[^/]+/.test(pathname);
  const badge = (n: number) => n > 0
    ? <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[10px] font-bold leading-5 text-white" aria-label={`${n} unread`}>{n > 99 ? "99+" : n}</span>
    : null;
  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? "bg-primary/10 font-semibold text-primary" : "text-muted hover:bg-bg hover:text-fg"}`;
  const mobileLink = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${isActive ? "text-primary" : "text-muted"}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/app" className="flex shrink-0 items-center gap-2.5" aria-label="CampusConnect home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm shadow-primary/20"><GraduationCap size={21} aria-hidden="true" /></span>
            <span className="text-[17px] font-extrabold tracking-tight">Campus<span className="text-primary">Connect</span></span>
          </NavLink>
          <div className="flex items-center gap-1 sm:gap-3">
            <span className="hidden text-xs font-medium text-muted md:block">Your campus. Your community.</span>
            {role !== "student" && <NavLink to="/admin" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-bg sm:block">Admin</NavLink>}
            {!inChat && (
              <div className="flex items-center gap-1 lg:hidden">
                <NavLink to={me.data ? `/app/u/${me.data}` : "/app/profile/edit"} aria-label="My profile" className="rounded-lg p-2 text-muted hover:bg-bg hover:text-primary"><UserRound size={18} /></NavLink>
                <NavLink to="/app/settings" aria-label="Settings" className="rounded-lg p-2 text-muted hover:bg-bg hover:text-primary"><Settings size={18} /></NavLink>
              </div>
            )}
            <button className="rounded-lg px-2.5 py-2 text-sm font-semibold text-muted transition hover:bg-bg hover:text-fg disabled:opacity-50 sm:px-3" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? "Logging out…" : "Log out"}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 pb-5 pt-5 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="sticky top-[84px] hidden h-[calc(100vh-104px)] flex-col lg:flex">
          <nav aria-label="Main" className="space-y-1">
            {items.map((item) => (
              <NavLink key={item.label} to={item.to} end={item.end} className={desktopLink}>
                <item.icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{item.label}</span>{badge(item.badge)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.08] to-white p-4">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Sparkles size={18} aria-hidden="true" /></span>
            <p className="text-sm font-bold">Good things grow together.</p>
            <p className="mt-1 text-xs leading-5 text-muted">Find your people, share what you know, and make campus feel a little smaller.</p>
            <NavLink to="/app/communities" className="mt-3 inline-flex text-xs font-bold text-primary hover:underline">Explore communities <span aria-hidden="true">→</span></NavLink>
          </div>
        </aside>

        <main className="min-w-0 space-y-4 pb-24 pt-0 lg:pb-8">
          {logout.isError && <p role="alert" className="err rounded-xl border border-danger/20 bg-white p-3">Could not log out. Please try again.</p>}
          <AnnouncementBanner /><Outlet />
        </main>

        <aside className="hidden space-y-4 xl:block" aria-label="Campus shortcuts">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Make a connection</p>
            <h2 className="mt-2 text-lg font-extrabold leading-snug">There’s a whole campus out there.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Meet students beyond your lecture hall and find people who get your interests.</p>
            <NavLink to="/app/discover" className="btn-primary mt-4 w-full">Discover students <span className="ml-2" aria-hidden="true">→</span></NavLink>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><BriefcaseBusiness size={19} aria-hidden="true" /></div>
            <h2 className="mt-3 font-bold">Your next opportunity</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Find scholarships, internships, training, and more picked for students.</p>
            <NavLink to="/app/opportunities" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">Explore opportunities <span className="ml-1" aria-hidden="true">→</span></NavLink>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users size={19} aria-hidden="true" /></div>
            <h2 className="mt-3 font-bold">Find your corner</h2>
            <p className="mt-1 text-sm leading-6 text-muted">From study buddies to shared passions, there’s room for every kind of community.</p>
            <NavLink to="/app/communities" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">Browse communities <span className="ml-1" aria-hidden="true">→</span></NavLink>
          </section>
        </aside>
      </div>

      {!inChat && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgba(34,20,20,0.06)] backdrop-blur-xl lg:hidden">
          {mobileItems.map((item) => (
            <NavLink key={item.label} to={item.to} end={item.end} className={mobileLink}>
              <span className="relative"><item.icon size={20} strokeWidth={1.8} aria-hidden="true" />{item.badge > 0 && <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />}</span>
              <span className="max-w-full truncate">{item.label === "Home feed" ? "Home" : item.label === "Notifications" ? "Alerts" : item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
