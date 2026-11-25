import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { listRecentPublishedCelebrations, listUpcomingCelebrations } from "@/features/celebrations/api";
import { Avatar } from "./components/Avatar";
import { supabase } from "@/lib/supabase";

const CELEBRANTS_PER_PAGE = 5;

export function CelebrationSpotlight() {
  const [page, setPage] = useState(0);
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
        const celebrant = card.owner_id || card.id;
        if (seen.has(celebrant)) return false;
        seen.add(celebrant);
        return true;
      });
    },
  });
  const ownerIds = [...new Set((cards.data ?? []).map((card) => card.owner_id).filter(Boolean))];
  const profiles = useQuery({
    queryKey: ["celebrations", "feed-spotlight-profiles", ownerIds],
    enabled: ownerIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id,username,avatar_path")
        .in("id", ownerIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => {
        const profile = row as { id: string; username: string; avatar_path: string | null };
        return [profile.id, profile];
      }));
    },
  });
  const celebrants = cards.data ?? [];
  const pageCount = Math.ceil(celebrants.length / CELEBRANTS_PER_PAGE);
  const visibleCards = celebrants.slice(page * CELEBRANTS_PER_PAGE, (page + 1) * CELEBRANTS_PER_PAGE);

  if (cards.isError) {
    return <p role="alert" className="text-sm text-danger">Could not load celebration highlights.</p>;
  }

  return (
    <section aria-label="Celebration highlights" aria-roledescription="carousel" className="sticky top-16 z-10 mx-auto w-full max-w-3xl py-2">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-fg">
          <PartyPopper size={17} className="text-primary" aria-hidden="true" />
          Celebrations
        </h2>
        <div className="flex items-center gap-2">
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-[#fff1f2] hover:text-primary disabled:opacity-40" aria-label="Previous celebrations" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-[#fff1f2] hover:text-primary disabled:opacity-40" aria-label="More celebrations" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          <Link to="/app/celebrations" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            View more <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {cards.isLoading ? (
        <div className="grid grid-cols-5 gap-2 sm:gap-4" role="status" aria-label="Loading celebrations">
          {Array.from({ length: CELEBRANTS_PER_PAGE }, (_, index) => <span key={index} className="mx-auto h-16 w-16 animate-pulse rounded-full bg-[#f8e9ea] sm:h-[76px] sm:w-[76px]" />)}
        </div>
      ) : visibleCards.length > 0 ? (
        <div className="grid grid-cols-5 gap-2 sm:gap-4" aria-live="polite">
          {visibleCards.map((card) => {
            const profile = profiles.data?.[card.owner_id];
            return (
              <Link
                key={card.id}
                to={`/app/celebrations/${card.id}`}
                aria-label={`${card.celebrant_name}'s ${card.title} celebration`}
                title={`${card.celebrant_name} · ${card.title}`}
                className="group flex min-w-0 flex-col items-center text-center"
              >
                <span className="relative mb-1.5 rounded-full bg-gradient-to-br from-primary via-[#ef8e4a] to-[#f4c95d] p-[3px] transition-transform group-hover:scale-105">
                  <span className="block rounded-full bg-white p-[3px]">
                    <Avatar name={card.celebrant_name} path={profile?.avatar_path ?? null} size={56} />
                  </span>
                  <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-primary text-white">
                    <PartyPopper size={11} aria-hidden="true" />
                  </span>
                </span>
                <span className="w-full truncate text-[11px] font-bold text-fg group-hover:text-primary sm:text-xs">{card.celebrant_name}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="py-2 text-sm text-muted">No celebrations to show yet.</p>
      )}
      {profiles.isError && <p role="alert" className="mt-2 text-xs text-danger">Could not load celebrant profile photos.</p>}
      {pageCount > 1 && <p className="mt-2 text-center text-[10px] text-muted">{page * CELEBRANTS_PER_PAGE + 1}–{Math.min((page + 1) * CELEBRANTS_PER_PAGE, celebrants.length)} of {celebrants.length}</p>}
    </section>
  );
}
