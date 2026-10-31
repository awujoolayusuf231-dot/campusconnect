import { ArrowRight, BookOpen, BriefcaseBusiness, MessageCircle, UsersRound } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { PublicLayout } from "@/pages/public/PublicLayout";
import { usePublicSettings } from "@/lib/publicSettings";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoadingState } from "@/app/LoadingState";

export function HomePage() {
  const s = usePublicSettings().data;
  const { session, loading } = useAuth();
  if (loading) return <LoadingState label="Welcome to CampusConnect" variant="page" />;
  if (session) return <Navigate to="/app" replace />;
  return (
    <PublicLayout wide>
      <div className="space-y-12 py-2 sm:space-y-16 sm:py-6">
        <section className="relative isolate overflow-hidden rounded-[26px] bg-[#771820] text-white shadow-[0_24px_70px_rgba(80,30,30,0.18)] sm:rounded-[32px]">
          <img
            src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1800&q=85"
            alt=""
            className="hero-image absolute inset-0 -z-20 h-full w-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#4c0d13]/95 via-[#771820]/80 to-[#771820]/35" />
          <div className="grid min-h-[430px] items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:min-h-[500px] lg:grid-cols-[1.05fr_0.95fr] lg:px-14">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur sm:text-xs">
                Made for student life
              </span>
              <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Your campus is better <span className="text-[#ffc9ce]">together.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
                Meet your people, find your communities, and discover opportunities that move your student life forward.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {s?.registration_open === false
                  ? <p className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90">New registrations are paused right now. Existing students can still log in.</p>
                  : <Link className="interactive-lift inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#771820] shadow-sm transition hover:bg-[#fff1f2]" to="/register">Join the community <ArrowRight size={17} aria-hidden="true" /></Link>}
                <Link className="interactive-lift inline-flex min-h-12 items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20" to="/login">Log in</Link>
              </div>
              <p className="mt-4 text-xs text-white/65">For students across universities, polytechnics, and colleges of education.</p>
            </div>
            <div className="hidden lg:block">
              <div className="hero-float hero-glow ml-auto max-w-sm rounded-3xl border border-white/25 bg-white/10 p-5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-3 border-b border-white/20 pb-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#771820]"><UsersRound size={21} aria-hidden="true" /></span>
                  <div><p className="text-sm font-bold">Your campus community</p><p className="text-xs text-white/70">A place to find your people</p></div>
                </div>
                <div className="space-y-3 py-4">
                  {[
                    { icon: MessageCircle, label: "Share what’s happening", detail: "Start a conversation on campus" },
                    { icon: BookOpen, label: "Find your community", detail: "Connect around what you care about" },
                    { icon: BriefcaseBusiness, label: "Discover opportunities", detail: "Take your next step forward" },
                  ].map(({ icon: Icon, label, detail }) => <div key={label} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Icon size={17} aria-hidden="true" /></span><span><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-xs text-white/70">{detail}</span></span></div>)}
                </div>
                <p className="pt-1 text-center text-xs text-white/70">Good things grow together.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">Campus life, more connected</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">Everything you need to feel at home on campus.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">CampusConnect brings student conversations, communities, and useful opportunities together in one welcoming space.</p>
          <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
            {[
              { icon: UsersRound, title: "Meet your people", body: "Discover and connect with students who share your campus and interests." },
              { icon: MessageCircle, title: "Join the conversation", body: "Share ideas, follow campus updates, and keep up with your community." },
              { icon: BriefcaseBusiness, title: "Find what’s next", body: "Explore opportunities and make room for your next big step." },
            ].map(({ icon: Icon, title, body }) => <article key={title} className="feature-card interactive-lift rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.04)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><Icon size={19} aria-hidden="true" /></span>
              <h3 className="mt-4 font-extrabold text-fg">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </article>)}
          </div>
          <Link to="/features" className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Explore CampusConnect <ArrowRight size={15} aria-hidden="true" /></Link>
        </section>
      </div>
    </PublicLayout>
  );
}
