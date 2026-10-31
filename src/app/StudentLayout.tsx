import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, Briefcase, Compass, GraduationCap, Home, MessageCircle, Settings, Sparkles, UserRound, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useUnreadCounts } from "@/features/notifications/useRealtimeCounts";
import { AnnouncementBanner } from "@/features/announcements/AnnouncementBanner";
import { Link } from "react-router-dom";

export function StudentLayout() {
  const { session, role } = useAuth();
  const { pathname } = useLocation();
  const counts = useUnreadCounts();
  const me = useQuery({ queryKey: ["me-username", session?.user.id], enabled: !!session, queryFn: async () => {
    const { data } = await supabase.from("profiles").select("username").eq("id", session!.user.id).maybeSingle(); return (data as { username: string } | null)?.username ?? null; } });
  const items = [
    { to: "/app", label: "Home feed", icon: Home, end: true, badge: 0 },
    { to: "/app/discover", label: "Discover", icon: Compass, end: false, badge: 0 },
    { to: "/app/communities", label: "Communities", icon: Users, end: false, badge: 0 },
    { to: "/app/opportunities", label: "Opportunities", icon: Briefcase, end: false, badge: 0 },
    { to: "/app/messages", label: "Messages", icon: MessageCircle, end: false, badge: counts.messages },
    { to: me.data ? `/app/u/${me.data}` : "/app/profile/edit", label: "My profile", icon: UserRound, end: false, badge: 0 },
    { to: "/app/settings", label: "Settings", icon: Settings, end: false, badge: 0 },
  ];
  const mobileItems = items.filter((i) => ["Home feed", "Discover", "Communities", "Opportunities", "Messages"].includes(i.label));
  const inChat = /^\/app\/messages\/[^/]+/.test(pathname); // chat is a dedicated full screen on mobile
  const desktopLink = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? "bg-[#f4e3e4] font-semibold text-primary" : "text-muted hover:bg-white hover:text-fg"}`;
  const mobileLink = ({ isActive }: { isActive: boolean }) => `relative flex min-w-0 flex-col items-center gap-1 px-1 py-2 text-[10px] sm:text-xs ${isActive ? "font-semibold text-primary" : "text-muted"}`;
  const badge = (n: number) => n > 0 ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 text-white" aria-label={`${n} unread`}>{n > 99 ? "99+" : n}</span> : null;
  return (
    <div className="min-h-full bg-bg">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to main content</a>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/app" className="inline-flex shrink-0 items-center gap-2.5" aria-label="CampusConnect home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm"><GraduationCap size={20} aria-hidden="true" /></span>
            <span className="text-base font-black tracking-tight text-fg sm:text-lg">Campus<span className="text-primary">Connect</span></span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs font-medium text-muted sm:block">Your campus. Your community.</span>
            <NavLink
              to="/app/notifications"
              aria-label={counts.notifications > 0 ? `Notifications, ${counts.notifications} unread` : "Notifications"}
              title="Notifications"
              className={({ isActive }) => `relative flex h-9 w-9 items-center justify-center rounded-full border bg-white transition hover:border-primary/30 hover:bg-[#f4e3e4] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isActive ? "border-primary/30 text-primary" : "border-line text-muted"}`}
            >
              <Bell size={18} aria-hidden="true" />
              {counts.notifications > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 text-white">{counts.notifications > 99 ? "99+" : counts.notifications}</span>}
            </NavLink>
            {!inChat && <>
              <Link
                to={me.data ? `/app/u/${me.data}` : "/app/profile/edit"}
                aria-label="My profile"
                title="My profile"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-muted transition hover:border-primary/30 hover:bg-[#f4e3e4] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <UserRound size={18} aria-hidden="true" />
              </Link>
              {role !== "student" && <NavLink to="/admin" className="text-sm font-semibold text-muted hover:text-primary">Admin</NavLink>}
              <button className="text-sm font-semibold text-muted hover:text-primary" onClick={() => void supabase.auth.signOut()}>Log out</button>
            </>}
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1600px]">
        <aside className={inChat ? "hidden" : "fixed bottom-0 top-16 z-10 hidden w-[250px] flex-col border-r border-line/70 bg-bg px-5 py-5 lg:flex"}>
          <nav aria-label="Main" className="space-y-1">
            {items.map((i) => <NavLink key={i.label} to={i.to} end={i.end} className={desktopLink}><i.icon size={18} aria-hidden="true" /><span>{i.label}</span>{badge(i.badge)}</NavLink>)}
          </nav>
          <div className="mt-auto rounded-2xl border border-[#efd9db] bg-gradient-to-br from-[#faeeee] to-white p-4">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Sparkles size={17} aria-hidden="true" /></span>
            <h2 className="text-sm font-extrabold leading-5 text-fg">Good things grow together.</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted">Find your people, share what you know, and make campus feel a little smaller.</p>
            <Link to="/app/communities" className="mt-3 inline-flex items-center text-xs font-bold text-primary hover:underline">Explore communities <span aria-hidden="true">→</span></Link>
          </div>
        </aside>
        <main id="main" tabIndex={-1} className={`${inChat ? "w-full" : "w-full lg:ml-[250px]"} min-w-0 px-4 pb-24 pt-5 outline-none sm:px-6 lg:px-6 lg:pb-8`}>
          <div className="motion-content mx-auto w-full max-w-[1000px] space-y-4"><AnnouncementBanner /><Outlet /></div>
        </main>
      </div>
      {!inChat && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {mobileItems.map((i) => <NavLink key={i.label} to={i.to} end={i.end} className={mobileLink}><i.icon size={19} aria-hidden="true" /><span className="max-w-full truncate">{i.label === "Home feed" ? "Home" : i.label}</span>{i.badge > 0 && <span className="absolute right-0 top-1 rounded-full bg-primary px-1.5 text-[9px] leading-4 text-white">{i.badge > 99 ? "99+" : i.badge}</span>}</NavLink>)}
        </nav>)}
    </div>
  );
}
