import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, BookOpen, Briefcase, Compass, GraduationCap, Home, MessageCircle, MessagesSquare, MoreHorizontal, Settings, Sparkles, UserRound, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useUnreadCounts } from "@/features/notifications/useRealtimeCounts";
import { AnnouncementBanner } from "@/features/announcements/AnnouncementBanner";
import { Link } from "react-router-dom";

export function StudentLayout() {
  const { session, role } = useAuth();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const counts = useUnreadCounts();
  const me = useQuery({ queryKey: ["me-username", session?.user.id], enabled: !!session, queryFn: async () => {
    const { data } = await supabase.from("profiles").select("username").eq("id", session!.user.id).maybeSingle(); return (data as { username: string } | null)?.username ?? null; } });
  const items = [
    { to: "/app", label: "Home feed", icon: Home, end: true, badge: 0 },
    { to: "/app/discover", label: "Discover", icon: Compass, end: false, badge: 0 },
    { to: "/app/communities", label: "Communities", icon: Users, end: false, badge: 0 },
    { to: "/app/past-questions", label: "Past Questions", icon: BookOpen, end: false, badge: 0 },
    { to: "/app/study-notes", label: "Study Notes", icon: BookOpen, end: false, badge: 0 },
    { to: "/app/assignment-discussions", label: "Assignment Discussions", icon: MessagesSquare, end: false, badge: 0 },
    { to: "/app/opportunities", label: "Opportunities", icon: Briefcase, end: false, badge: 0 },
    { to: "/app/messages", label: "Messages", icon: MessageCircle, end: false, badge: counts.messages },
    { to: me.data ? `/app/u/${me.data}` : "/app/profile/edit", label: "My profile", icon: UserRound, end: false, badge: 0 },
    { to: "/app/settings", label: "Settings", icon: Settings, end: false, badge: 0 },
  ];
  const mobileItems = items.filter((i) => ["Home feed", "Discover", "Communities", "Messages"].includes(i.label));
  const moreItems = items.filter((i) => ["Past Questions", "Study Notes", "Assignment Discussions", "Opportunities", "My profile", "Settings"].includes(i.label));
  const moreActive = moreItems.some((item) => item.label === "My profile"
    ? pathname.startsWith("/app/u/") || pathname === "/app/profile/edit"
    : pathname === item.to || pathname.startsWith(`${item.to}/`));
  const inChat = /^\/app\/messages\/[^/]+/.test(pathname); // chat is a dedicated full screen on mobile
  const desktopLink = ({ isActive }: { isActive: boolean }) => `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isActive ? "bg-[#f8e9ea] font-bold text-primary shadow-sm" : "text-muted hover:bg-white hover:text-fg"}`;
  const mobileLink = ({ isActive }: { isActive: boolean }) => `relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[9px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:text-xs ${isActive ? "font-bold text-primary" : "text-muted hover:bg-bg"}`;
  const badge = (n: number) => n > 0 ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 text-white" aria-label={`${n} unread`}>{n > 99 ? "99+" : n}</span> : null;
  useEffect(() => setMoreOpen(false), [pathname]);
  return (
    <div className="min-h-full bg-bg">
      <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to main content</a>
      <header className="sticky top-0 z-20 border-b border-line/80 bg-white/95 shadow-[0_3px_16px_rgba(35,24,20,0.035)] backdrop-blur-xl">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/app" className="inline-flex shrink-0 items-center gap-2.5" aria-label="CampusConnect home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-[0_5px_12px_rgba(197,43,58,0.2)]"><GraduationCap size={20} aria-hidden="true" /></span>
            <span className="text-base font-black tracking-tight text-fg sm:text-lg">Campus<span className="text-primary">Connect</span></span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden rounded-full bg-[#fff4f2] px-3 py-1.5 text-xs font-semibold text-[#8b3c43] sm:block">Your campus. Your community.</span>
            <NavLink
              to="/app/notifications"
              aria-label={counts.notifications > 0 ? `Notifications, ${counts.notifications} unread` : "Notifications"}
              title="Notifications"
              className={({ isActive }) => `relative flex h-10 w-10 items-center justify-center rounded-xl border bg-white transition hover:border-primary/30 hover:bg-[#fff4f2] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isActive ? "border-primary/30 bg-[#fff4f2] text-primary" : "border-line text-muted"}`}
            >
              <Bell size={18} aria-hidden="true" />
              {counts.notifications > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 text-white">{counts.notifications > 99 ? "99+" : counts.notifications}</span>}
            </NavLink>
            {!inChat && <>
              <Link
                to={me.data ? `/app/u/${me.data}` : "/app/profile/edit"}
                aria-label="My profile"
                title="My profile"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:border-primary/30 hover:bg-[#fff4f2] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
        <aside className={inChat ? "hidden" : "fixed bottom-0 top-16 z-10 hidden w-[250px] flex-col border-r border-line/70 bg-[#fbfaf9] px-4 py-6 lg:flex xl:w-[270px] xl:px-5"}>
          <nav aria-label="Main" className="space-y-1.5">
            {items.map((i) => <NavLink key={i.label} to={i.to} end={i.end} className={desktopLink}><i.icon size={18} aria-hidden="true" /><span>{i.label}</span>{badge(i.badge)}</NavLink>)}
          </nav>
          <div className="mt-auto rounded-2xl border border-[#efd9db] bg-gradient-to-br from-[#faeeee] via-white to-white p-4 shadow-[0_8px_24px_rgba(80,30,30,0.04)]">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Sparkles size={17} aria-hidden="true" /></span>
            <h2 className="text-sm font-extrabold leading-5 text-fg">Good things grow together.</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted">Find your people, share what you know, and make campus feel a little smaller.</p>
            <Link to="/app/communities" className="mt-3 inline-flex items-center text-xs font-bold text-primary hover:underline">Explore communities <span aria-hidden="true">→</span></Link>
          </div>
        </aside>
        <main id="main" tabIndex={-1} className={`${inChat ? "w-full px-4 pb-24 pt-5 sm:px-6 lg:px-6 lg:pb-8" : "w-full px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:ml-[250px] lg:px-8 lg:pb-8 xl:ml-[270px]"} min-w-0 outline-none`}>
          <div className={`mx-auto w-full ${inChat ? "max-w-[1000px]" : "max-w-[1120px]"} space-y-4 sm:space-y-5${inChat ? "" : " motion-content"}`}><AnnouncementBanner /><Outlet /></div>
        </main>
      </div>
      {!inChat && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex gap-0.5 border-t border-line/80 bg-white/95 px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] shadow-[0_-8px_26px_rgba(35,24,20,0.07)] backdrop-blur-xl lg:hidden">
          {mobileItems.map((i) => <NavLink key={i.label} to={i.to} end={i.end} aria-label={i.label} className={mobileLink}><i.icon size={19} strokeWidth={2} aria-hidden="true" /><span className="max-w-full truncate">{i.label === "Home feed" ? "Home" : i.label === "Discover" ? "Explore" : i.label === "Communities" ? "Groups" : "Messages"}</span>{i.badge > 0 && <span className="absolute right-1 top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 text-white">{i.badge > 99 ? "99+" : i.badge}</span>}</NavLink>)}
          <button type="button" aria-label="More navigation" aria-expanded={moreOpen} aria-controls="mobile-more-navigation" onClick={() => setMoreOpen((open) => !open)} className={`${mobileLink({ isActive: moreActive || moreOpen })} border-0 bg-transparent`}>
            <MoreHorizontal size={19} strokeWidth={2} aria-hidden="true" /><span>More</span>
          </button>
          {moreOpen && <div id="mobile-more-navigation" className="absolute bottom-full right-2 mb-2 grid w-[min(22rem,calc(100vw-1rem))] grid-cols-2 gap-1 rounded-2xl border border-line bg-white p-2 shadow-[0_12px_36px_rgba(35,24,20,0.16)]">
            {moreItems.map((item) => <NavLink key={item.label} to={item.to} end={item.end} onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold ${isActive ? "bg-[#f8e9ea] text-primary" : "text-fg hover:bg-bg"}`}>
              <item.icon size={16} aria-hidden="true" /><span className="truncate">{item.label}</span>
            </NavLink>)}
          </div>}
        </nav>)}
    </div>
  );
}
