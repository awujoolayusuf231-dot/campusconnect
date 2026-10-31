import type { ReactNode } from "react";
import { ArrowLeft, GraduationCap, Sparkles } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

type AuthPageLayoutProps = {
  mode: "login" | "register";
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthPageLayout({ mode, eyebrow, title, description, children }: AuthPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[#fffafa] p-3 sm:p-5 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-7xl overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_24px_80px_rgba(80,30,30,0.10)] sm:min-h-[calc(100dvh-2.5rem)] sm:rounded-[32px] lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.02fr_0.98fr]">
        <aside className="relative flex min-h-[245px] flex-col justify-between overflow-hidden bg-[#771820] px-5 py-5 text-white sm:min-h-[285px] sm:px-8 sm:py-7 lg:min-h-full lg:px-10 lg:py-9 xl:px-14">
          <img
            src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=85"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#4c0d13]/80 via-[#8f1924]/55 to-[#39090e]/90" />
          <div className="pointer-events-none absolute -right-20 top-1/4 h-72 w-72 rounded-full border-[42px] border-white/[0.08]" />

          <div className="relative flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label="CampusConnect home">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary">
                <GraduationCap size={21} aria-hidden="true" />
              </span>
              <span className="text-base font-extrabold tracking-tight">Campus<span className="text-white/75">Connect</span></span>
            </Link>
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10 hover:text-white sm:text-sm">
              <ArrowLeft size={15} aria-hidden="true" /><span className="hidden sm:inline">Back to home</span><span className="sm:hidden">Home</span>
            </Link>
          </div>

          <div className="relative mt-8 max-w-lg pb-1 sm:mt-10 lg:mt-auto lg:pb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur sm:text-xs">
              <Sparkles size={13} aria-hidden="true" /> Made for student life
            </span>
            <p className="mt-4 text-2xl font-black leading-tight tracking-[-0.035em] sm:mt-5 sm:text-3xl lg:text-4xl xl:text-5xl">
              Your next campus connection starts here.
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/80 sm:mt-3 sm:text-base sm:leading-7">
              Find your people, join conversations, and discover opportunities for what comes next.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-6">
              {["People", "Communities", "Opportunities"].map((item) => (
                <span key={item} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur sm:text-xs">{item}</span>
              ))}
            </div>
          </div>
          <p className="relative mt-5 hidden text-xs text-white/60 lg:block">A little more connected, one conversation at a time.</p>
        </aside>

        <main className="motion-content flex min-w-0 flex-col px-5 py-6 sm:px-9 sm:py-9 lg:px-10 lg:py-10 xl:px-16 xl:py-12">
          <nav aria-label="Account" className="flex justify-end gap-1">
            <NavLink to="/login" className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive && mode === "login" ? "bg-primary/[0.08] text-primary" : "text-muted hover:bg-bg hover:text-fg"}`}>Log in</NavLink>
            <NavLink to="/register" className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive && mode === "register" ? "bg-primary/[0.08] text-primary" : "text-muted hover:bg-bg hover:text-fg"}`}>Join</NavLink>
          </nav>
          <div className="mx-auto my-auto w-full max-w-md py-7 sm:py-9">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted sm:text-base">{description}</p>
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-auto pt-3 text-center text-xs leading-5 text-muted">
            By continuing, you agree to our <Link to="/terms" className="font-semibold text-primary underline underline-offset-2">Terms</Link> and <Link to="/privacy" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </main>
      </div>
    </div>
  );
}
