import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { listRecentPublishedCelebrations, listUpcomingCelebrations } from "@/features/celebrations/api";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CelebrationSpotlight() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const cards = useQuery({
    queryKey: ["celebrations", "feed-spotlight"],
    staleTime: 60_000,
    queryFn: async () => {
      const [upcoming, recent] = await Promise.all([
        listUpcomingCelebrations(),
        listRecentPublishedCelebrations(),
      ]);
      const seen = new Set<string>();
      return [...upcoming, ...recent].filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
    },
  });
  const count = cards.data?.length ?? 0;
  const paused = hovered || focused;
  const active = count ? cards.data?.[index % count] : undefined;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setDirection(1);
      setIndex((value) => (value + 1) % count);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [count, paused, reducedMotion]);

  const move = (step: 1 | -1) => {
    setDirection(step);
    setIndex((value) => (value + step + count) % count);
  };

  return (
    <section
      aria-label="Celebration highlights"
      aria-roledescription="carousel"
      className="sticky top-16 z-10 overflow-hidden rounded-2xl border border-[#efd9db] bg-gradient-to-br from-[#fff4f1] via-white to-[#fff0f2] shadow-[0_8px_24px_rgba(35,24,20,0.08)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm"><PartyPopper size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Celebration spotlight</p>
          <div aria-live="off" aria-atomic="true">
            {cards.isLoading ? (
              <h2 id="celebration-spotlight-title" className="mt-1 text-lg font-black tracking-tight text-fg">Finding a moment to celebrate</h2>
            ) : active ? (
              <div
                key={active.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index % count + 1} of ${count}`}
                className={`min-w-0 ${direction === 1 ? "celebration-slide-next" : "celebration-slide-prev"}`}
              >
                <h2 id="celebration-spotlight-title" className="mt-1 text-lg font-black tracking-tight text-fg">{active.celebrant_name}</h2>
                <p className="mt-1 line-clamp-1 text-sm text-muted">{active.title} · {active.category.replace(/_/g, " ")}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <CalendarDays size={14} aria-hidden="true" />
                  {new Date(active.celebration_at).toLocaleDateString(undefined, { dateStyle: "long", timeZone: active.timezone })}
                </p>
              </div>
            ) : cards.isError ? (
              <p role="alert" className="mt-1 text-xs text-danger">Could not load celebration highlights.</p>
            ) : (
              <div>
                <h2 id="celebration-spotlight-title" className="mt-1 text-lg font-black tracking-tight text-fg">Celebrate campus milestones</h2>
                <p className="mt-1 text-sm text-muted">Discover newly shared cards and upcoming milestones from students.</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active && <div className="flex items-center gap-1" aria-label="Rotate celebration highlights">
            <button type="button" className="btn min-h-10 w-10 justify-center rounded-xl p-0" aria-label="Previous celebration" disabled={count < 2} onClick={() => move(-1)}>
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button type="button" className="btn min-h-10 w-10 justify-center rounded-xl p-0" aria-label="Next celebration" disabled={count < 2} onClick={() => move(1)}>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>}
          {active && <Link to={`/app/celebrations/${active.id}`} className="btn-primary inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-xs font-bold">View card</Link>}
          <Link to="/app/celebrations" className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-bold text-primary hover:bg-white/70">Explore all</Link>
        </div>
      </div>
    </section>
  );
}
