import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Building2, Search, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { followUser, unfollowUser } from "./api";
import { listActiveInstitutions } from "@/features/institutions/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Avatar } from "./components/Avatar";
import { socialErrorMessage } from "@/lib/errors";
import { LoadingState } from "@/app/LoadingState";

interface Student { id: string; username: string; display_name: string; avatar_path: string | null; bio: string | null; institution_id: string | null; department: string | null; academic_level: string | null }
const PAGE = 24;

export function DiscoverPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ q: "", institution: "", department: "", level: "", interest: "" });
  const [applied, setApplied] = useState(form);
  const [page, setPage] = useState(0);

  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const instName = new Map((institutions.data ?? []).map((i) => [i.id, i.short_name ?? i.name]));
  const results = useQuery({ queryKey: ["discover", applied, page], queryFn: async () => {
    const { data, error } = await supabase.rpc("discover_students", {
      p_query: applied.q.trim() || null, p_institution: applied.institution || null, p_department: applied.department.trim() || null,
      p_level: applied.level.trim() || null, p_interest: applied.interest.trim() || null, p_limit: PAGE, p_offset: page * PAGE });
    if (error) throw error; return (data ?? []) as Student[]; } });
  const following = useQuery({ queryKey: ["following", session?.user.id], enabled: !!session, queryFn: async () => {
    const { data, error } = await supabase.from("follows").select("followee_id").eq("follower_id", session!.user.id).limit(1000);
    if (error) throw error; return new Set((data ?? []).map((r) => (r as { followee_id: string }).followee_id)); } });
  const toggle = useMutation({ mutationFn: (s: { id: string; follow: boolean }) => (s.follow ? followUser(s.id) : unfollowUser(s.id)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["following"] }); void qc.invalidateQueries({ queryKey: ["feed"] }); } });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const activeFilters = [
    applied.institution ? institutions.data?.find((i) => i.id === applied.institution)?.name : null,
    applied.department.trim(),
    applied.level.trim(),
    applied.interest.trim(),
  ].filter((value): value is string => !!value);

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <header className="overflow-hidden rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff0ef] p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-8">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-primary">
          <UsersRound size={15} aria-hidden="true" /> Campus directory
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-fg sm:text-4xl">Find your people</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Meet students across your campus by name, institution, department, or shared interests.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-white p-3 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-4">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(form); }}>
          <label className="relative block">
            <span className="sr-only">Name or username</span>
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input min-h-11 w-full rounded-xl pl-10"
              aria-label="Name or username"
              placeholder="Search students by name or username"
              value={form.q}
              onChange={set("q")}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select className="input min-h-11 rounded-xl" aria-label="Institution" value={form.institution} onChange={set("institution")}>
              <option value="">Any institution</option>{(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input className="input min-h-11 rounded-xl" aria-label="Department" placeholder="Department / course" value={form.department} onChange={set("department")} />
            <input className="input min-h-11 rounded-xl" aria-label="Level" placeholder="Level (e.g. 300L, ND2)" value={form.level} onChange={set("level")} />
            <input className="input min-h-11 rounded-xl" aria-label="Interest" placeholder="Interest" value={form.interest} onChange={set("interest")} />
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted">
              {activeFilters.length > 0
                ? `Filters: ${activeFilters.join(" · ")}`
                : "Use one or more filters to narrow your search."}
            </p>
            <button className="btn-primary min-h-11 w-full justify-center gap-2 rounded-xl px-5 font-bold sm:w-auto">
              <Search size={16} aria-hidden="true" /> Search students
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="student-results-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Your campus network</p>
            <h2 id="student-results-title" className="mt-1 text-lg font-black tracking-tight text-fg">Students to meet</h2>
          </div>
          {results.data && <span className="text-xs font-medium text-muted">Showing {results.data.length} on this page</span>}
        </div>

        {results.isLoading && <LoadingState label="Finding students" variant="panel" />}
        {results.isError && <p role="alert" className="err">Could not load results.</p>}
        {results.data?.length === 0 && <p className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-10 text-center text-sm text-muted">No students match your filters. Try changing or clearing a filter.</p>}
        {toggle.isError && <p role="alert" className="err">{socialErrorMessage((toggle.error as Error).message)}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.data?.map((s) => {
            const isFollowing = following.data?.has(s.id) ?? false;
            const institution = s.institution_id ? instName.get(s.institution_id) : null;
            return (
              <li key={s.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.02)] transition hover:border-[#edced1] hover:shadow-[0_8px_18px_rgba(35,24,20,0.07)] sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={s.display_name} path={s.avatar_path} size={52} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/u/${s.username}`} className="break-words font-bold text-fg hover:text-primary hover:underline">{s.display_name}</Link>
                    <p className="mt-0.5 truncate text-xs text-muted">@{s.username}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {institution && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#fff4f2] px-2.5 py-1 text-[11px] font-semibold text-[#843d44]"><Building2 size={12} aria-hidden="true" /><span className="truncate">{institution}</span></span>}
                      {s.department && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted"><BookOpen size={12} aria-hidden="true" /><span className="truncate">{s.department}</span></span>}
                      {s.academic_level && <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted">{s.academic_level}</span>}
                    </div>
                  </div>
                </div>
                {s.bio && <p className="line-clamp-2 text-sm leading-6 text-[#514a48]">{s.bio}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
                  <Link to={`/app/u/${s.username}`} className="text-xs font-bold text-primary hover:underline">View profile</Link>
                  <button
                    className={`${isFollowing ? "btn border-[#e5d7d4] bg-white" : "btn-primary"} min-h-10 rounded-xl px-4 font-bold`}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: s.id, follow: !isFollowing })}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <nav aria-label="Student search pages" className="flex items-center justify-between rounded-2xl border border-line bg-white p-3">
        <button className="btn min-h-10" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="text-xs font-semibold text-muted">Page {page + 1}</span>
        <button className="btn min-h-10" disabled={(results.data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Next</button>
      </nav>
    </div>
  );
}
