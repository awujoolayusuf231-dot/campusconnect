import { useEffect, useRef, useState } from "react";
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
  const [attentionPulse, setAttentionPulse] = useState(false);
  const hasShownAttention = useRef(false);
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
    if (!count || hasShownAttention.current) return;
    hasShownAttention.current = true;
    if (reducedMotion) return;

    setAttentionPulse(true);
    const timer = window.setTimeout(() => setAttentionPulse(false), 1400);
    return () => window.clearTimeout(timer);
  }, [count, reducedMotion]);

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
      className={`sticky top-16 z-10 mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#efd9db] bg-gradient-to-br from-[#fff4f1] via-white to-[#fff0f2] shadow-[0_6px_18px_rgba(35,24,20,0.07)] ${attentionPulse ? "celebration-spotlight-pulse" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><PartyPopper size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div aria-live="off" aria-atomic="true">
            {cards.isLoading ? (
              <><p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">Celebration spotlight</p><h2 id="celebration-spotlight-title" className="truncate text-sm font-black text-fg">Finding a moment to celebrate</h2></>
            ) : active ? (
              <div
                key={active.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index % count + 1} of ${count}`}
                className={`min-w-0 ${direction === 1 ? "celebration-slide-next" : "celebration-slide-prev"}`}
              >
                <p className="truncate text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">
                  Celebration spotlight · {active.category.replace(/_/g, " ")} · {new Date(active.celebration_at).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: active.timezone })}
                </p>
                <h2 id="celebration-spotlight-title" title={`${active.celebrant_name} — ${active.title}`} className="truncate text-sm font-black tracking-tight text-fg">
                  {active.celebrant_name}<span className="font-semibold text-muted"> · {active.title}</span>
                </h2>
              </div>
            ) : cards.isError ? (
              <p role="alert" className="truncate text-xs text-danger">Could not load celebration highlights.</p>
            ) : (
              <div className="min-w-0">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">Celebration spotlight</p>
                <h2 id="celebration-spotlight-title" className="truncate text-sm font-black text-fg">Discover new cards and upcoming milestones</h2>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {active && count > 1 && <div className="flex items-center gap-0.5" aria-label="Rotate celebration highlights">
            <button type="button" className="btn min-h-8 w-8 justify-center rounded-lg p-0" aria-label="Previous celebration" onClick={() => move(-1)}>
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <button type="button" className="btn min-h-8 w-8 justify-center rounded-lg p-0" aria-label="Next celebration" onClick={() => move(1)}>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>}
          {active && <Link to={`/app/celebrations/${active.id}`} aria-label="View card" className="btn-primary inline-flex min-h-8 items-center justify-center rounded-lg px-2.5 text-[11px] font-bold sm:min-h-9 sm:px-3 sm:text-xs">
            <span className="sm:hidden">View</span><span className="hidden sm:inline">View card</span>
          </Link>}
          <Link to="/app/celebrations" className="hidden min-h-8 items-center justify-center rounded-lg px-2.5 text-[11px] font-bold text-primary hover:bg-white/70 sm:inline-flex sm:min-h-9 sm:px-3 sm:text-xs">Explore all</Link>
        </div>
      </div>
    </section>
  );
}
