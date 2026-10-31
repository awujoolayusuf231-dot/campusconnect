import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Discover students</h1>
      <form className="card grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(form); }}>
        <input className="input" aria-label="Name or username" placeholder="Name or username" value={form.q} onChange={set("q")} />
        <select className="input" aria-label="Institution" value={form.institution} onChange={set("institution")}><option value="">Any institution</option>{(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <input className="input" aria-label="Department" placeholder="Department / course" value={form.department} onChange={set("department")} />
        <input className="input" aria-label="Level" placeholder="Level (e.g. 300L, ND2)" value={form.level} onChange={set("level")} />
        <input className="input" aria-label="Interest" placeholder="Interest" value={form.interest} onChange={set("interest")} />
        <button className="btn-primary">Search</button>
      </form>
      {results.isLoading && <LoadingState label="Finding students" variant="panel" />}
      {results.isError && <p role="alert" className="err">Could not load results.</p>}
      {results.data?.length === 0 && <p className="card text-center text-muted">No students match your filters.</p>}
      {toggle.isError && <p role="alert" className="err">{socialErrorMessage((toggle.error as Error).message)}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {results.data?.map((s) => {
          const isFollowing = following.data?.has(s.id) ?? false;
          return (
            <li key={s.id} className="card flex gap-3">
              <Avatar name={s.display_name} path={s.avatar_path} size={48} />
              <div className="min-w-0 flex-1">
                <Link to={`/app/u/${s.username}`} className="font-medium hover:underline">{s.display_name}</Link>
                <p className="text-xs text-muted">@{s.username}{s.institution_id ? ` · ${instName.get(s.institution_id) ?? ""}` : ""}{s.department ? ` · ${s.department}` : ""}{s.academic_level ? ` · ${s.academic_level}` : ""}</p>
                {s.bio && <p className="mt-1 line-clamp-2 text-sm">{s.bio}</p>}
              </div>
              <button className={isFollowing ? "btn" : "btn-primary"} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: s.id, follow: !isFollowing })}>{isFollowing ? "Following" : "Follow"}</button>
            </li>);
        })}
      </ul>
      <div className="flex justify-between"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={(results.data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}
