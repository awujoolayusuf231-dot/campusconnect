import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, GraduationCap, Globe, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { blockUser, fetchMediaUrls, fetchProfileReposts, fetchProfileStats, followUser, unfollowUser, type FeedPost } from "@/features/social/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Avatar } from "@/features/social/components/Avatar";
import { PostCard } from "@/features/social/components/PostCard";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import { ConnectionsDialog } from "./ConnectionsDialog";
import { celebrationUrlSchema } from "@/validation/profile";
import { formatCount } from "@/lib/format";
import { socialErrorMessage } from "@/lib/errors";

interface Profile { id: string; username: string; display_name: string; bio: string | null; avatar_path: string | null; institution_id: string | null; faculty: string | null; department: string | null; academic_level: string | null; graduation_year: number | null; interests: string[]; location: string | null; website_url: string | null; celebration_url: string | null; show_celebration: boolean; created_at: string }
type Tab = "posts" | "reposts";

function Stat({ label, value, onClick }: { label: string; value: number | undefined; onClick?: () => void }) {
  const inner = <><span className="block text-xl font-semibold tabular-nums">{value === undefined ? "–" : formatCount(value)}</span><span className="block text-xs text-muted">{label}</span></>;
  return onClick ? <button type="button" onClick={onClick} className="px-2 py-3 text-center hover:bg-bg focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${value ?? 0} ${label}. Show list`}>{inner}</button> : <div className="px-2 py-3 text-center">{inner}</div>;
}

export function ProfilePage() {
  const { username = "" } = useParams();
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const nav = useNavigate(); const qc = useQueryClient();
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [limit, setLimit] = useState(20);

  const profile = useQuery({ queryKey: ["profile", username], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_path,institution_id,faculty,department,academic_level,graduation_year,interests,location,website_url,celebration_url,show_celebration,created_at").eq("username", username.toLowerCase()).maybeSingle();
    if (error) throw error; return data as Profile | null; } });
  const p = profile.data; const mine = !!p && p.id === me;
  const stats = useQuery({ queryKey: ["profile-stats", p?.id], enabled: !!p, queryFn: () => fetchProfileStats(p!.id) });
  const institution = useQuery({ queryKey: ["institution", p?.institution_id], enabled: !!p?.institution_id, queryFn: async () => {
    const { data } = await supabase.from("institutions").select("name").eq("id", p!.institution_id!).maybeSingle(); return (data as { name: string } | null)?.name ?? null; } });
  const flag = useQuery({ queryKey: ["flag", "campus_celebrations"], queryFn: async () => {
    const { data } = await supabase.from("feature_flags").select("enabled").eq("key", "campus_celebrations").maybeSingle(); return (data as { enabled: boolean } | null)?.enabled ?? false; } });

  const posts = useQuery({ queryKey: ["author-posts", p?.id, limit], enabled: !!p && tab === "posts", queryFn: async (): Promise<{ posts: FeedPost[]; media: Record<string, string[]> }> => {
    const { data, error } = await supabase.from("posts").select("id,author_id,body,created_at,edited_at,like_count,comment_count,repost_count").eq("author_id", p!.id).eq("status", "visible").is("community_id", null).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; author_id: string; body: string; created_at: string; edited_at: string | null; like_count: number; comment_count: number; repost_count: number }[];
    const ids = rows.map((r) => r.id); const liked = new Set<string>(); const reposted = new Set<string>();
    if (ids.length) {
      const [l, r] = await Promise.all([supabase.from("post_likes").select("post_id").in("post_id", ids), supabase.from("reposts").select("post_id").eq("user_id", me).in("post_id", ids)]);
      (l.data ?? []).forEach((x) => liked.add((x as { post_id: string }).post_id)); (r.data ?? []).forEach((x) => reposted.add((x as { post_id: string }).post_id));
    }
    return { posts: rows.map((r) => ({ ...r, liked_by_me: liked.has(r.id), reposted_by_me: reposted.has(r.id), username: p!.username, display_name: p!.display_name, avatar_path: p!.avatar_path, activity_at: r.created_at, reposter_username: null, reposter_name: null })), media: await fetchMediaUrls(ids) }; } });
  const reposts = useQuery({ queryKey: ["profile-reposts", p?.id, limit], enabled: !!p && tab === "reposts", queryFn: async () => { const rows = await fetchProfileReposts(p!.id, limit); return { posts: rows, media: await fetchMediaUrls(rows.map((r) => r.id)) }; } });

  const follow = useMutation({ mutationFn: () => (stats.data?.is_following ? unfollowUser(p!.id) : followUser(p!.id)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["profile-stats"] }); void qc.invalidateQueries({ queryKey: ["connections"] }); void qc.invalidateQueries({ queryKey: ["feed"] }); } });
  const startChat = useMutation({ mutationFn: async () => { const { data, error } = await supabase.rpc("start_conversation", { p_other: p!.id }); if (error) throw error; return data as string; }, onSuccess: (id) => nav(`/app/messages/${id}`) });
  const block = useMutation({ mutationFn: () => blockUser(p!.id), onSuccess: () => { void qc.invalidateQueries(); nav("/app"); } });

  if (profile.isLoading) return <div role="status" aria-label="Loading profile" className="space-y-3"><div className="h-52 animate-pulse rounded-2xl bg-surface" /><div className="h-24 animate-pulse rounded-2xl bg-surface" /></div>;
  if (profile.isError) return <p role="alert" className="err">Could not load this profile.</p>;
  if (!p) return <div className="card">This profile does not exist or is not visible to you.</div>;

  const celebrationOk = !!flag.data && p.show_celebration && !!p.celebration_url && celebrationUrlSchema.safeParse(p.celebration_url).success;
  const details = [p.faculty, p.department, p.academic_level].filter(Boolean).join(" · ");
  const active = tab === "posts" ? posts : reposts;
  const actionError = (follow.error ?? startChat.error ?? block.error) as Error | null;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div aria-hidden="true" className="h-28 bg-[linear-gradient(135deg,var(--cc-primary),color-mix(in_srgb,var(--cc-primary)_60%,#000))] md:h-40" />
        <div className="px-5 pb-5">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-3">
            <div className="rounded-full border-4 border-surface bg-surface shadow-sm"><Avatar name={p.display_name} path={p.avatar_path} size={96} /></div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {mine ? <Link className="btn-primary" to="/app/profile/edit">Edit profile</Link> : (
                <>
                  <button className={stats.data?.is_following ? "btn" : "btn-primary"} disabled={follow.isPending || !stats.data} onClick={() => follow.mutate()}>{stats.data?.is_following ? "Following" : stats.data?.follows_me ? "Follow back" : "Follow"}</button>
                  <button className="btn" disabled={startChat.isPending} onClick={() => startChat.mutate()}>Message</button>
                  <details className="relative"><summary className="btn cursor-pointer list-none" aria-label="More actions">⋯</summary>
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-lg">
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => setDialog("report")}>Report</button>
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-bg" onClick={() => setDialog("block")}>Block</button></div></details>
                </>)}
            </div>
          </div>
          <div className="mt-3">
            <h1 className="text-2xl font-semibold leading-tight">{p.display_name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">@{p.username}{!mine && stats.data?.follows_me && <span className="rounded-full bg-bg px-2 py-0.5 text-xs">Follows you</span>}</p>
          </div>
          {p.bio && <p className="mt-3 whitespace-pre-wrap break-words">{p.bio}</p>}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {institution.data && <li className="inline-flex items-center gap-1"><GraduationCap size={14} aria-hidden="true" /> {institution.data} <span className="text-xs">(self-reported)</span></li>}
            {details && <li className="inline-flex items-center gap-1"><Briefcase size={14} aria-hidden="true" /> {details}</li>}
            {p.graduation_year && <li>Class of {p.graduation_year}</li>}
            {p.location && <li className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" /> {p.location}</li>}
            {p.website_url && /^https:\/\//i.test(p.website_url) && <li className="inline-flex items-center gap-1"><Globe size={14} aria-hidden="true" /> <a className="underline" href={p.website_url} target="_blank" rel="noopener noreferrer nofollow">Website (external)</a></li>}
          </ul>
          {p.interests.length > 0 && <ul className="mt-3 flex flex-wrap gap-2" aria-label="Interests">{p.interests.map((i) => <li key={i} className="rounded-full border border-line bg-bg px-3 py-1 text-sm">{i}</li>)}</ul>}
          {celebrationOk && <a className="btn-primary mt-4" href={p.celebration_url!} target="_blank" rel="noopener noreferrer">Celebrate on whiteshirt.fun</a>}
          {actionError && <p role="alert" className="err mt-2">{socialErrorMessage(String(actionError.message))}</p>}
        </div>
        <div className="grid grid-cols-4 divide-x divide-line border-t border-line" role="group" aria-label="Profile statistics">
          <Stat label="Posts" value={stats.data?.post_count} onClick={() => { setTab("posts"); setLimit(20); }} />
          <Stat label="Reposts" value={stats.data?.repost_total} onClick={() => { setTab("reposts"); setLimit(20); }} />
          <Stat label="Followers" value={stats.data?.follower_count} onClick={() => setList("followers")} />
          <Stat label="Following" value={stats.data?.following_count} onClick={() => setList("following")} />
        </div>
      </section>

      <div role="tablist" aria-label="Profile content" className="flex gap-2">
        {(["posts", "reposts"] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "btn-primary" : "btn"} onClick={() => { setTab(t); setLimit(20); }}>{t === "posts" ? "Posts" : "Reposts"}</button>)}
      </div>
      {active.isLoading && <p role="status">Loading…</p>}
      {active.isError && <p role="alert" className="err">Could not load this tab.</p>}
      {active.data?.posts.length === 0 && <p className="card text-center text-muted">{tab === "posts" ? "No posts yet." : "No reposts yet."}</p>}
      {active.data?.posts.map((post) => <PostCard key={`${tab}-${post.id}`} post={post} images={active.data?.media[post.id]} me={me} />)}

      {active.data && active.data.posts.length >= limit && limit < 100 && <button className="btn w-full" disabled={active.isFetching} onClick={() => setLimit((l) => Math.min(l + 20, 100))}>{active.isFetching ? "Loading…" : "Show more"}</button>}

      {list && <ConnectionsDialog userId={p.id} initial={list} me={me} onClose={() => setList(null)} />}
      {dialog === "report" && <ReportDialog type="user" targetId={p.id} onClose={() => setDialog(null)} />}
      {dialog === "block" && <ConfirmDialog title={`Block @${p.username}?`} confirmLabel="Block" busy={block.isPending} onConfirm={() => block.mutate()} onCancel={() => setDialog(null)}>You will no longer see their content, and they cannot interact with you.</ConfirmDialog>}
    </div>
  );
}
