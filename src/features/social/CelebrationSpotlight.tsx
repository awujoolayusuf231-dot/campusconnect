import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { listRecentPublishedCelebrations, listUpcomingCelebrations } from "@/features/celebrations/api";

export function CelebrationSpotlight() {
  const [index, setIndex] = useState(0);
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
  const active = cards.data?.length ? cards.data[index % cards.data.length] : undefined;
  const count = cards.data?.length ?? 0;
  const previous = () => setIndex((value) => (value - 1 + count) % count);
  const next = () => setIndex((value) => (value + 1) % count);

  return (
    <section aria-labelledby="celebration-spotlight-title" className="overflow-hidden rounded-2xl border border-[#efd9db] bg-gradient-to-br from-[#fff4f1] via-white to-[#fff0f2] shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm"><PartyPopper size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Celebration spotlight</p>
          <h2 id="celebration-spotlight-title" className="mt-1 text-lg font-black tracking-tight text-fg">
            {cards.isLoading ? "Finding a moment to celebrate" : active?.celebrant_name ?? "Celebrate campus milestones"}
          </h2>
          {cards.isError ? (
            <p role="alert" className="mt-1 text-xs text-danger">Could not load celebration highlights.</p>
          ) : active ? (
            <>
              <p className="mt-1 line-clamp-1 text-sm text-muted">{active.title} · {active.category.replace(/_/g, " ")}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <CalendarDays size={14} aria-hidden="true" />
                {new Date(active.celebration_at).toLocaleDateString(undefined, { dateStyle: "long", timeZone: active.timezone })}
              </p>
            </>
          ) : !cards.isLoading ? (
            <p className="mt-1 text-sm text-muted">Discover newly shared cards and upcoming milestones from students.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active && <div className="flex items-center gap-1" aria-label="Rotate celebration highlights">
            <button type="button" className="btn min-h-10 w-10 justify-center rounded-xl p-0" aria-label="Previous celebration" disabled={count < 2} onClick={previous}>
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button type="button" className="btn min-h-10 w-10 justify-center rounded-xl p-0" aria-label="Next celebration" disabled={count < 2} onClick={next}>
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
