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
      <div className="space-y-16 py-2 sm:space-y-20 sm:py-6">
        <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_24px_70px_rgba(35,24,20,0.08)] sm:rounded-[36px]">
          <div className="grid lg:min-h-[520px] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative z-10 px-6 py-9 sm:px-10 sm:py-12 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#f1dadd] bg-[#fcf2f3] px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                Made for student life
              </span>
              <h1 className="mt-6 max-w-xl text-[2.65rem] font-black leading-[1.02] tracking-[-0.055em] text-fg sm:text-6xl lg:text-[4.25rem]">
                Your campus is better <span className="text-primary">together.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted sm:text-lg sm:leading-8">
                Meet your people, find your communities, and discover opportunities that move your student life forward.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {s?.registration_open === false
                  ? <p className="rounded-2xl border border-line bg-bg px-4 py-3 text-sm leading-6 text-muted">New registrations are paused right now. Existing students can still log in.</p>
                  : <Link className="interactive-lift inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(197,43,58,0.22)] transition hover:bg-[#a92030]" to="/register">Join the community <ArrowRight size={17} aria-hidden="true" /></Link>}
                <Link className="interactive-lift inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-white px-5 py-3 text-sm font-bold text-fg transition hover:border-[#dfb8bd] hover:bg-[#fcf7f7]" to="/login">Log in</Link>
              </div>
              <p className="mt-5 text-xs leading-5 text-muted">For students across universities, polytechnics, and colleges of education.</p>
            </div>

            <div className="relative min-h-[280px] overflow-hidden bg-[#771820] sm:min-h-[360px] lg:min-h-full">
              <img
                src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1800&q=85"
                alt=""
                className="hero-image absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#311014]/75 via-[#4c0d13]/10 to-[#4c0d13]/10" />
              <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/30 bg-white/90 p-4 shadow-xl backdrop-blur-md sm:inset-x-7 sm:bottom-7 sm:max-w-sm sm:p-5 lg:inset-x-8 lg:bottom-8">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><UsersRound size={20} aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-extrabold text-fg">Your campus community</p>
                    <p className="mt-1 text-xs leading-5 text-muted">A place to find your people and make campus feel a little closer.</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-semibold text-fg"><MessageCircle size={14} className="text-primary" aria-hidden="true" /> Conversations</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-semibold text-fg"><BookOpen size={14} className="text-primary" aria-hidden="true" /> Communities</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-semibold text-fg"><BriefcaseBusiness size={14} className="text-primary" aria-hidden="true" /> Opportunities</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">Campus life, more connected</p>
            <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.035em] text-fg sm:text-4xl">Everything you need to feel at home on campus.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7">CampusConnect brings student conversations, communities, and useful opportunities together in one welcoming space.</p>
          </div>
          <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
            {[
              { icon: UsersRound, title: "Meet your people", body: "Discover and connect with students who share your campus and interests." },
              { icon: MessageCircle, title: "Join the conversation", body: "Share ideas, follow campus updates, and keep up with your community." },
              { icon: BriefcaseBusiness, title: "Find what’s next", body: "Explore opportunities and make room for your next big step." },
            ].map(({ icon: Icon, title, body }) => <article key={title} className="feature-card interactive-lift h-full rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.04)] sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><Icon size={20} aria-hidden="true" /></span>
              <h3 className="mt-5 font-extrabold text-fg">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </article>)}
          </div>
          <div className="mt-7 text-center">
            <Link to="/features" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">Explore CampusConnect <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
