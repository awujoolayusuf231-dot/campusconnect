import { ArrowRight, Compass, Heart, MessageCircle, Users } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { PublicLayout } from "@/pages/public/PublicLayout";
import { usePublicSettings } from "@/lib/publicSettings";
import { useAuth } from "@/features/auth/AuthProvider";

const highlights = [
  {
    icon: Users,
    title: "Find your people",
    text: "Meet students who share your interests, your course, and your campus life.",
  },
  {
    icon: MessageCircle,
    title: "Keep the conversation going",
    text: "Share what’s happening, ask questions, and stay close to your campus community.",
  },
  {
    icon: Compass,
    title: "Discover what’s next",
    text: "Explore student communities and opportunities for your next big step.",
  },
];

export function HomePage() {
  const settings = usePublicSettings().data;
  const { session, loading } = useAuth();
  const registrationOpen = settings?.registration_open !== false;
  if (loading) return <div role="status" aria-busy="true" className="p-8 text-center text-muted">Getting CampusConnect ready…</div>;
  if (session) return <Navigate to="/app" replace />;
  return (
    <PublicLayout>
      <section className="grid gap-7 py-2 sm:py-5 lg:grid-cols-[0.93fr_1.07fr] lg:items-center lg:gap-12 lg:py-8">
        <div className="relative z-[1] py-3 lg:py-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3.5 py-2 text-xs font-bold tracking-wide text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            MADE FOR STUDENT LIFE
          </span>
          <h1 className="mt-5 max-w-[620px] text-[clamp(2.7rem,7vw,5.25rem)] font-black leading-[0.99] tracking-[-0.06em] text-fg">
            Your campus, <span className="text-primary">connected.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted sm:text-lg sm:leading-8">
            A social network for students in Nigerian universities, polytechnics and colleges of education: share, discover people and communities, message privately and find real opportunities.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {registrationOpen
              ? <Link className="btn-primary group !rounded-xl !px-6 !py-3.5" to="/register">Create account <ArrowRight size={17} className="ml-2 transition-transform group-hover:translate-x-1" aria-hidden="true" /></Link>
              : <p className="rounded-xl border border-primary/15 bg-[#fffafa] px-4 py-3 text-sm text-muted sm:max-w-xs">New registrations are paused right now. Existing students can still log in.</p>}
            <Link className="btn !rounded-xl !px-6 !py-3.5" to="/login">I already have an account</Link>
          </div>
          <div className="mt-8 flex items-center gap-3 text-sm text-muted">
            <span className="flex -space-x-2" aria-hidden="true">
              <span className="h-8 w-8 rounded-full border-2 border-white bg-[#f0c2ae]" />
              <span className="h-8 w-8 rounded-full border-2 border-white bg-[#593a34]" />
              <span className="h-8 w-8 rounded-full border-2 border-white bg-[#e5a986]" />
            </span>
            <span>A little more connected, one conversation at a time.</span>
          </div>
        </div>

        <div className="relative min-h-[300px] overflow-hidden rounded-[26px] bg-[#7d1c23] shadow-[0_28px_70px_rgba(142,24,32,0.18)] sm:min-h-[420px] lg:min-h-[510px]">
          <img
            src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1500&q=85"
            alt="University students learning and sharing a moment together"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#30090e]/85 via-[#4b1018]/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-9">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 backdrop-blur"><Heart size={20} fill="currentColor" aria-hidden="true" /></div>
            <p className="max-w-md text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Your campus story is better when it’s shared.</p>
            <p className="mt-2 text-sm text-white/80">Connect, learn, and grow—together.</p>
          </div>
          <span className="absolute right-4 top-4 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur sm:right-5 sm:top-5">Made for your next chapter</span>
        </div>
      </section>

      <section id="why-campusconnect" className="mt-9 scroll-mt-20 rounded-[26px] border border-line/70 bg-[#fffafa] px-5 py-10 sm:mt-14 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">More than a feed</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">A little more campus. A lot more connection.</h2>
          <p className="mt-4 leading-7 text-muted">Whether you’re finding your study crew or sharing what’s on your mind, there’s space for you here.</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3 sm:mt-10 sm:gap-4">
          {highlights.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="group rounded-2xl border border-line bg-white p-5 transition duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-card sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition group-hover:bg-primary group-hover:text-white">
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className="mt-4 text-xs font-bold tracking-wide text-primary">0{index + 1}</p>
              <h3 className="mt-1 text-base font-extrabold sm:text-lg">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mt-9 overflow-hidden rounded-[26px] bg-[#a91f2a] px-5 py-8 text-white sm:mt-14 sm:px-10 sm:py-12 lg:px-14">
        <div className="pointer-events-none absolute -right-12 -top-28 h-80 w-80 rounded-full border-[50px] border-white/[0.07]" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-white/75">Your people are out there</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">Come find your corner of campus.</h2>
            <p className="mt-3 max-w-lg leading-7 text-white/80">Join the conversations and communities that make your campus feel like yours.</p>
          </div>
          {registrationOpen && <Link to="/register" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-primary transition hover:bg-[#fff0f0]">Get started <ArrowRight size={17} aria-hidden="true" /></Link>}
        </div>
      </section>
    </PublicLayout>
  );
}
