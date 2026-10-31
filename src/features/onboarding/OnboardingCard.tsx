import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Compass, GraduationCap, MessageSquarePlus, Sparkles, UserRound, UsersRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { fetchProfileStats } from "@/features/social/api";
import { computeOnboarding } from "./steps";

const key = (uid: string) => `cc.onboarding-dismissed.${uid}`;
const wasDismissed = (uid: string) => { try { return localStorage.getItem(key(uid)) === "1"; } catch { return false; } };
const stepIcons = {
  avatar: UserRound,
  institution: GraduationCap,
  bio: MessageSquarePlus,
  follow: UsersRound,
  community: Compass,
  post: MessageSquarePlus,
} as const;

// Shown on the feed until every step is done or the student dismisses it. Purely a guide: nothing here grants access.
export function OnboardingCard() {
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const [dismissed, setDismissed] = useState(() => (uid ? wasDismissed(uid) : false));
  const q = useQuery({ queryKey: ["onboarding", uid], enabled: !!uid && !dismissed, staleTime: 30_000, queryFn: async () => {
    const [{ data: prof }, stats, mem] = await Promise.all([
      supabase.from("profiles").select("avatar_path,institution_id,bio").eq("id", uid).maybeSingle(),
      fetchProfileStats(uid),
      supabase.from("community_members").select("community_id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active"),
    ]);
    const p = (prof ?? {}) as { avatar_path?: string | null; institution_id?: string | null; bio?: string | null };
    return computeOnboarding({ hasAvatar: !!p.avatar_path, hasInstitution: !!p.institution_id, hasBio: !!p.bio?.trim(), following: stats?.following_count ?? 0, communities: mem.count ?? 0, posts: stats?.post_count ?? 0 });
  } });
  if (!uid || dismissed || !q.data || q.data.complete) return null;
  const { steps, percent, doneCount } = q.data;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(key(uid), "1"); } catch { /* storage unavailable */ } };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#771820]/15 bg-white p-4 shadow-[0_12px_36px_rgba(80,30,30,0.07)] sm:p-6" aria-label="Getting started">
      <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-[#f9e9ea]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#771820] text-white shadow-sm">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#771820] sm:text-xs">Your campus journey</p>
              <h2 className="mt-1 text-lg font-black leading-tight tracking-[-0.03em] text-fg sm:text-xl">Make CampusConnect yours</h2>
              <p className="mt-1 text-sm leading-5 text-muted">A few quick steps will help you find your people.</p>
            </div>
          </div>
          <button aria-label="Dismiss getting started" className="relative rounded-lg p-2 text-muted transition hover:bg-[#f9e9ea] hover:text-[#771820] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#771820]" onClick={dismiss}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-xl bg-[#fffafa] p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-fg">Your profile checklist</span>
            <span className="font-bold text-[#771820]">{doneCount}/{steps.length} complete</span>
          </div>
          <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress" className="h-2 overflow-hidden rounded-full bg-[#f1dfe1]">
            <div className="h-full rounded-full bg-[#9c2430] transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{steps.map((s) => {
          const Icon = stepIcons[s.id as keyof typeof stepIcons] ?? Sparkles;
          return (
            <li key={s.id} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 transition-colors ${s.done ? "border-[#771820]/10 bg-[#fffafa]" : "border-line bg-white hover:border-[#771820]/30 hover:bg-[#fffafa]"}`}>
              <span aria-hidden="true" className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.done ? "bg-[#771820] text-white" : "bg-[#f9e9ea] text-[#771820]"}`}>
                {s.done ? <Check size={15} /> : <Icon size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                {s.done
                  ? <span className="text-sm font-semibold text-muted">{s.label}</span>
                  : <Link to={s.to} className="group inline-flex items-center gap-1 text-sm font-bold text-fg hover:text-[#771820] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#771820]">
                    <span>{s.label}</span><ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>}
                {!s.done && <p className="mt-1 text-xs leading-4 text-muted">{s.hint}</p>}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </div>
            </li>
          );
        })}</ul>
      </div>
    </section>
  );
}
