import { useEffect, useState } from "react";
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
import { HashtagDiscovery } from "./HashtagDiscovery";

interface Student {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  bio: string | null;
  institution_id: string | null;
  department: string | null;
  academic_level: string | null;
  shared_interests?: number;
  same_institution?: boolean;
  same_department?: boolean;
  same_location?: boolean;
}
const PAGE = 24;

function StudentCard({
  student,
  institution,
  isFollowing,
  followPending,
  onToggle,
}: {
  student: Student;
  institution: string | null;
  isFollowing: boolean;
  followPending: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.02)] transition hover:border-[#edced1] hover:shadow-[0_8px_18px_rgba(35,24,20,0.07)] sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={student.display_name} path={student.avatar_path} size={52} />
        <div className="min-w-0 flex-1">
          <Link to={`/app/u/${student.username}`} className="break-words font-bold text-fg hover:text-primary hover:underline">{student.display_name}</Link>
          <p className="mt-0.5 truncate text-xs text-muted">@{student.username}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {institution && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary-deep"><Building2 size={12} aria-hidden="true" /><span className="truncate">{institution}</span></span>}
            {student.department && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted"><BookOpen size={12} aria-hidden="true" /><span className="truncate">{student.department}</span></span>}
            {student.academic_level && <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted">{student.academic_level}</span>}
            {student.shared_interests ? <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">{student.shared_interests} shared interest{student.shared_interests === 1 ? "" : "s"}</span> : null}
            {student.same_location && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">Same city/state</span>}
          </div>
        </div>
      </div>
      {student.bio && <p className="line-clamp-2 text-sm leading-6 text-[#514a48]">{student.bio}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
        <Link to={`/app/u/${student.username}`} className="text-xs font-bold text-primary hover:underline">View profile</Link>
        <button
          className={`${isFollowing ? "btn border-[#e5d7d4] bg-white" : "btn-primary"} min-h-10 rounded-xl px-4 font-bold`}
          disabled={followPending}
          onClick={onToggle}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
      </div>
    </li>
  );
}

export function DiscoverPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ q: "", institution: "", department: "", level: "", interest: "" });
  const [applied, setApplied] = useState(form);
  const [page, setPage] = useState(0);
  const [discoveryMode, setDiscoveryMode] = useState<"recommended" | "nearby">("recommended");
  const [discoveryLocationInput, setDiscoveryLocationInput] = useState("");

  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const instName = new Map((institutions.data ?? []).map((i) => [i.id, i.short_name ?? i.name]));
  const locationPreference = useQuery({
    queryKey: ["discover", "location-sharing", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_discovery_location");
      if (error) throw error;
      return ((data ?? []) as { city_state: string | null; enabled: boolean }[])[0] ?? { city_state: null, enabled: false };
    },
  });
  useEffect(() => setDiscoveryLocationInput(locationPreference.data?.city_state ?? ""), [locationPreference.data?.city_state]);
  const setLocationPreference = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!session) throw new Error("Sign in to update this setting.");
      const { error } = await supabase.rpc("set_my_discovery_location", {
        p_city_state: discoveryLocationInput.trim(),
        p_enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["discover", "location-sharing", session?.user.id] });
      await qc.invalidateQueries({ queryKey: ["discover", "recommendations"] });
    },
  });
  const recommendations = useQuery({
    queryKey: ["discover", "recommendations", discoveryMode],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recommend_students", {
        p_location_only: discoveryMode === "nearby",
        p_limit: 12,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as Student[];
    },
  });
  const results = useQuery({ queryKey: ["discover", applied, page], queryFn: async () => {
    const { data, error } = await supabase.rpc("discover_students", {
      p_query: applied.q.trim() || null, p_institution: applied.institution || null, p_department: applied.department.trim() || null,
      p_level: applied.level.trim() || null, p_interest: applied.interest.trim() || null, p_limit: PAGE, p_offset: page * PAGE });
    if (error) throw error; return (data ?? []) as Student[]; } });
  const following = useQuery({ queryKey: ["following", session?.user.id], enabled: !!session, queryFn: async () => {
    const { data, error } = await supabase.from("follows").select("followee_id").eq("follower_id", session!.user.id).limit(1000);
    if (error) throw error; return new Set((data ?? []).map((r) => (r as { followee_id: string }).followee_id)); } });
  const toggle = useMutation({ mutationFn: (s: { id: string; follow: boolean }) => (s.follow ? followUser(s.id) : unfollowUser(s.id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["following"] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["discover", "recommendations"] });
    } });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const activeFilters = [
    applied.institution ? institutions.data?.find((i) => i.id === applied.institution)?.name : null,
    applied.department.trim(),
    applied.level.trim(),
    applied.interest.trim(),
  ].filter((value): value is string => !!value);

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <header className="overflow-hidden rounded-[26px] border border-primary-border bg-gradient-to-br from-primary-soft via-white to-primary-soft p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-8">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-primary">
          <UsersRound size={15} aria-hidden="true" /> Campus directory
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-fg sm:text-4xl">Find your people</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Meet students across your campus by name, institution, department, or shared interests.
        </p>
      </header>

      <HashtagDiscovery />

      <section aria-labelledby="student-recommendations-title" className="space-y-3 rounded-2xl border border-primary-border bg-gradient-to-br from-primary-soft via-white to-primary-soft p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">On-platform suggestions</p>
            <h2 id="student-recommendations-title" className="mt-1 text-lg font-black tracking-tight text-fg">
              {discoveryMode === "nearby" ? "Students in your city or state" : "Recommended for you"}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              {discoveryMode === "nearby"
                  ? "Enter only a city or state. It is stored privately, never shown on your profile by this feature, and matched without GPS or external services."
                : "Suggestions use shared interests, study details, mutual connections, and opted-in city/state matches. No external AI service receives your data."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" aria-pressed={discoveryMode === "recommended"} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${discoveryMode === "recommended" ? "bg-primary text-white" : "border border-line bg-white text-muted"}`} onClick={() => setDiscoveryMode("recommended")}>Recommended</button>
            <button type="button" aria-pressed={discoveryMode === "nearby"} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${discoveryMode === "nearby" ? "bg-primary text-white" : "border border-line bg-white text-muted"}`} onClick={() => setDiscoveryMode("nearby")}>Same city/state</button>
          </div>
        </div>
        {discoveryMode === "nearby" && (
          <div className="space-y-2 rounded-xl border border-line bg-white p-3">
            <label htmlFor="discovery-city-state" className="block text-xs font-semibold text-fg">City or state (not a street address)</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="discovery-city-state"
                className="input min-h-10 flex-1"
                maxLength={80}
                value={discoveryLocationInput}
                onChange={(event) => setDiscoveryLocationInput(event.target.value)}
                placeholder="e.g. Lagos, Nigeria"
              />
              <button
                type="button"
                className="btn-primary min-h-10 rounded-xl px-4 font-bold"
                disabled={locationPreference.isLoading || setLocationPreference.isPending || discoveryLocationInput.trim().length < 2}
                onClick={() => setLocationPreference.mutate(true)}
              >
                {locationPreference.data?.enabled ? "Save and share" : "Share city/state"}
              </button>
              {locationPreference.data?.enabled && (
                <button
                  type="button"
                  className="btn min-h-10 rounded-xl px-4 font-bold"
                  disabled={setLocationPreference.isPending}
                  onClick={() => setLocationPreference.mutate(false)}
                >
                  Stop sharing
                </button>
              )}
            </div>
            <p className="text-xs leading-5 text-muted">
              {locationPreference.data?.enabled
                ? "Your city/state is stored privately and included only in matching recommendations. Stop sharing removes it."
                : "This is off until you choose Share city/state. Your entry is not added to your public profile."}
            </p>
          </div>
        )}
        {locationPreference.isError && <p role="alert" className="err">Could not load your location privacy setting.</p>}
        {setLocationPreference.isError && <p role="alert" className="err">Could not save your location privacy setting.</p>}
        {recommendations.isLoading && <LoadingState label="Finding students you may know" variant="panel" />}
        {recommendations.isError && <p role="alert" className="err">Could not load student recommendations.</p>}
        {!recommendations.isLoading && !recommendations.isError && recommendations.data?.length === 0 && (
          <p className="rounded-xl border border-dashed border-primary-border bg-white px-4 py-6 text-center text-sm text-muted">
            {discoveryMode === "nearby"
              ? locationPreference.data?.enabled
                ? "No other students who opted in matched your city/state yet."
                : "Share a city/state above to discover students who chose to share a matching area."
              : "We don’t have enough shared profile details to suggest students yet. Add interests or study details to your profile."}
          </p>
        )}
        {toggle.isError && <p role="alert" className="err">{socialErrorMessage((toggle.error as Error).message)}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {recommendations.data?.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              institution={student.institution_id ? instName.get(student.institution_id) ?? null : null}
              isFollowing={following.data?.has(student.id) ?? false}
              followPending={toggle.isPending}
              onToggle={() => toggle.mutate({ id: student.id, follow: !(following.data?.has(student.id) ?? false) })}
            />
          ))}
        </ul>
      </section>

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
        {results.data?.length === 0 && <p className="rounded-2xl border border-dashed border-primary-border bg-white px-5 py-10 text-center text-sm text-muted">No students match your filters. Try changing or clearing a filter.</p>}
        {toggle.isError && <p role="alert" className="err">{socialErrorMessage((toggle.error as Error).message)}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.data?.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              institution={student.institution_id ? instName.get(student.institution_id) ?? null : null}
              isFollowing={following.data?.has(student.id) ?? false}
              followPending={toggle.isPending}
              onToggle={() => toggle.mutate({ id: student.id, follow: !(following.data?.has(student.id) ?? false) })}
            />
          ))}
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
