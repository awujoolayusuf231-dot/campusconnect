import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, GraduationCap, Globe, MapPin, MessageCircle, MoreHorizontal, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { blockUser, fetchMediaPaths, fetchProfileReposts, fetchProfileStats, followUser, unfollowUser, type FeedPost } from "@/features/social/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Avatar } from "@/features/social/components/Avatar";
import { PostCard } from "@/features/social/components/PostCard";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import { ConnectionsDialog } from "./ConnectionsDialog";
import { celebrationUrlSchema } from "@/validation/profile";
import { formatCount } from "@/lib/format";
import { socialErrorMessage } from "@/lib/errors";
import { LoadingState } from "@/app/LoadingState";
import { resolveProfileCoverUrl } from "./profileCover";

interface Profile { id: string; username: string; display_name: string; bio: string | null; avatar_path: string | null; cover_path: string | null; institution_id: string | null; faculty: string | null; department: string | null; academic_level: string | null; graduation_year: number | null; interests: string[]; location: string | null; website_url: string | null; celebration_url: string | null; show_celebration: boolean; created_at: string }
type Tab = "posts" | "reposts";

function Stat({ label, value, onClick }: { label: string; value: number | undefined; onClick?: () => void }) {
  const inner = <><span className="block text-lg font-black tabular-nums text-fg sm:text-xl">{value === undefined ? "–" : formatCount(value)}</span><span className="mt-0.5 block text-[11px] font-medium text-muted sm:text-xs">{label}</span></>;
  return onClick ? <button type="button" onClick={onClick} className="rounded-xl px-1 py-3 text-center transition-colors hover:bg-[#fff4f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:px-2" aria-label={`${value ?? 0} ${label}. Show list`}>{inner}</button> : <div className="px-1 py-3 text-center sm:px-2">{inner}</div>;
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
    const { data, error } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_path,cover_path,institution_id,faculty,department,academic_level,graduation_year,interests,location,website_url,celebration_url,show_celebration,created_at").eq("username", username.toLowerCase()).maybeSingle();
    if (error) throw error; return data as Profile | null; } });
  const p = profile.data; const mine = !!p && p.id === me;
  const coverImage = useQuery({
    queryKey: ["profile-cover-url", p?.id, p?.cover_path],
    enabled: !!p?.cover_path,
    queryFn: () => resolveProfileCoverUrl(p!.id, p!.cover_path),
  });
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
    return { posts: rows.map((r) => ({ ...r, liked_by_me: liked.has(r.id), reposted_by_me: reposted.has(r.id), username: p!.username, display_name: p!.display_name, avatar_path: p!.avatar_path, activity_at: r.created_at, reposter_username: null, reposter_name: null })), media: await fetchMediaPaths(ids) }; } });
  const reposts = useQuery({ queryKey: ["profile-reposts", p?.id, limit], enabled: !!p && tab === "reposts", queryFn: async () => { const rows = await fetchProfileReposts(p!.id, limit); return { posts: rows, media: await fetchMediaPaths(rows.map((r) => r.id)) }; } });

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
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_12px_36px_rgba(35,24,20,0.055)] sm:rounded-[28px]">
        <div
          aria-hidden="true"
          className="relative h-36 overflow-hidden bg-[linear-gradient(125deg,#741923_0%,#a52432_48%,#dd6670_100%)] bg-cover bg-center sm:h-48"
          style={coverImage.data
            ? { backgroundImage: `linear-gradient(to top, rgba(49,16,20,0.35), rgba(49,16,20,0.05)), url("${coverImage.data}")` }
            : undefined}
        >
          {coverImage.isError && <p role="alert" className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1 text-xs text-white">Cover image is unavailable.</p>}
          {!p.cover_path && <>
            <div className="absolute -right-10 -top-20 h-56 w-56 rounded-full border border-white/15" />
            <div className="absolute -right-1 -top-12 h-48 w-48 rounded-full border border-white/10" />
            <div className="absolute -bottom-28 left-[28%] h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          </>}
          <div className="absolute bottom-4 right-5 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur sm:bottom-5 sm:right-7">
            <Sparkles size={13} aria-hidden="true" /> CampusConnect community
          </div>
        </div>
        <div className="px-4 pb-4 sm:px-7 sm:pb-6">
          <div className="-mt-11 flex flex-wrap items-end justify-between gap-3 sm:-mt-14">
            <div className="relative z-10 rounded-full border-[5px] border-white bg-white shadow-[0_8px_24px_rgba(35,24,20,0.15)]"><Avatar name={p.display_name} path={p.avatar_path} size={96} /></div>
            <div className="flex max-w-full flex-wrap items-center gap-2 pb-1">
              {mine ? <Link className="btn-primary min-h-10 rounded-xl px-4 font-bold shadow-sm" to="/app/profile/edit">Edit profile</Link> : (
                <>
                  <button className={`${stats.data?.is_following ? "btn border-[#e5d7d4] bg-white" : "btn-primary shadow-sm"} min-h-10 rounded-xl px-4 font-bold`} disabled={follow.isPending || !stats.data} onClick={() => follow.mutate()}>{stats.data?.is_following ? "Following" : stats.data?.follows_me ? "Follow back" : "Follow"}</button>
                  <button className="btn min-h-10 rounded-xl border-[#e5d7d4] bg-white px-3 font-bold" disabled={startChat.isPending} onClick={() => startChat.mutate()}><MessageCircle size={16} className="mr-1.5" aria-hidden="true" />Message</button>
                  <details className="relative"><summary className="btn flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-[#e5d7d4] bg-white p-0" aria-label="More actions"><MoreHorizontal size={19} aria-hidden="true" /></summary>
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-lg">
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => setDialog("report")}>Report</button>
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-bg" onClick={() => setDialog("block")}>Block</button></div></details>
                </>)}
            </div>
          </div>
          <div className="mt-4">
            <h1 className="break-words text-2xl font-black leading-tight tracking-[-0.035em] text-fg sm:text-3xl">{p.display_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">@{p.username}{!mine && stats.data?.follows_me && <span className="rounded-full bg-[#f8e9ea] px-2.5 py-1 text-[11px] font-bold text-primary">Follows you</span>}</p>
          </div>
          {p.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-sm leading-7 text-[#514a48] sm:text-base">{p.bio}</p>}
          <ul className="mt-4 flex flex-wrap gap-2">
            {institution.data && <li className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-line bg-[#fbfaf9] px-3 py-2 text-xs font-medium text-[#514a48] sm:text-sm"><GraduationCap size={15} className="shrink-0 text-primary" aria-hidden="true" /> <span className="truncate">{institution.data}</span> <span className="shrink-0 text-[10px] text-muted">(self-reported)</span></li>}
            {details && <li className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-[#fbfaf9] px-3 py-2 text-xs font-medium text-[#514a48] sm:text-sm"><Briefcase size={15} className="shrink-0 text-primary" aria-hidden="true" /> {details}</li>}
            {p.graduation_year && <li className="rounded-xl border border-line bg-[#fbfaf9] px-3 py-2 text-xs font-medium text-[#514a48] sm:text-sm">Class of {p.graduation_year}</li>}
            {p.location && <li className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-[#fbfaf9] px-3 py-2 text-xs font-medium text-[#514a48] sm:text-sm"><MapPin size={15} className="shrink-0 text-primary" aria-hidden="true" /> {p.location}</li>}
            {p.website_url && /^https:\/\//i.test(p.website_url) && <li className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-[#fbfaf9] px-3 py-2 text-xs font-medium text-[#514a48] sm:text-sm"><Globe size={15} className="shrink-0 text-primary" aria-hidden="true" /> <a className="hover:text-primary hover:underline" href={p.website_url} target="_blank" rel="noopener noreferrer nofollow">Website (external)</a></li>}
          </ul>
          {p.interests.length > 0 && <ul className="mt-4 flex flex-wrap gap-2" aria-label="Interests">{p.interests.map((i) => <li key={i} className="rounded-full border border-[#f0dadd] bg-[#fff7f6] px-3 py-1.5 text-xs font-semibold text-[#843d44]">{i}</li>)}</ul>}
          {celebrationOk && <a className="btn-primary mt-4 min-h-10 rounded-xl px-4 font-bold" href={p.celebration_url!} target="_blank" rel="noopener noreferrer">Celebrate on whiteshirt.fun</a>}
          {actionError && <p role="alert" className="err mt-2">{socialErrorMessage(String(actionError.message))}</p>}
        </div>
        <div className="grid grid-cols-4 gap-1 border-t border-line bg-[#fbfaf9] px-2 py-1 sm:gap-2 sm:px-5" role="group" aria-label="Profile statistics">
          <Stat label="Posts" value={stats.data?.post_count} onClick={() => { setTab("posts"); setLimit(20); }} />
          <Stat label="Reposts" value={stats.data?.repost_total} onClick={() => { setTab("reposts"); setLimit(20); }} />
          <Stat label="Followers" value={stats.data?.follower_count} onClick={() => setList("followers")} />
          <Stat label="Following" value={stats.data?.following_count} onClick={() => setList("following")} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
        <div role="tablist" aria-label="Profile content" className="flex border-b border-line px-2 sm:px-4">
          {(["posts", "reposts"] as Tab[]).map((t) => <button key={t} id={`profile-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls="profile-posts" className={`min-h-12 border-b-2 px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${tab === t ? "border-primary font-bold text-primary" : "border-transparent font-semibold text-muted hover:text-fg"}`} onClick={() => { setTab(t); setLimit(20); }}>{t === "posts" ? "Posts" : "Reposts"}</button>)}
        </div>
        <div id="profile-posts" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="space-y-4 bg-[#fbfaf9] p-3 sm:p-5">
          {active.isLoading && <LoadingState label={tab === "posts" ? "Gathering posts" : "Gathering reposts"} variant="panel" />}
          {active.isError && <p role="alert" className="rounded-xl border border-danger/20 bg-white p-4 text-sm text-danger">Could not load this tab.</p>}
          {active.data?.posts.length === 0 && <div className="rounded-2xl border border-dashed border-[#e7d4d5] bg-white px-4 py-10 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff1f2] text-primary"><Sparkles size={20} aria-hidden="true" /></span>
            <h2 className="mt-3 font-extrabold text-fg">{tab === "posts" ? "The first post is waiting" : "No reposts just yet"}</h2>
            <p className="mt-1 text-sm text-muted">{tab === "posts" ? "When there are posts to share, they’ll show up here." : "Posts this student shares will appear here."}</p>
          </div>}
          {active.data?.posts.map((post) => <PostCard key={`${tab}-${post.id}`} post={post} images={active.data?.media[post.id]} me={me} />)}
          {active.data && active.data.posts.length >= limit && limit < 100 && <button className="btn min-h-11 w-full gap-2 bg-white font-semibold text-muted hover:border-primary/25 hover:text-primary" disabled={active.isFetching} onClick={() => setLimit((l) => Math.min(l + 20, 100))}>{active.isFetching ? <LoadingState label="Finding more posts" /> : "Show more posts"}</button>}
        </div>
      </section>

      {list && <ConnectionsDialog userId={p.id} initial={list} me={me} onClose={() => setList(null)} />}
      {dialog === "report" && <ReportDialog type="user" targetId={p.id} onClose={() => setDialog(null)} />}
      {dialog === "block" && <ConfirmDialog title={`Block @${p.username}?`} confirmLabel="Block" busy={block.isPending} onConfirm={() => block.mutate()} onCancel={() => setDialog(null)}>You will no longer see their content, and they cannot interact with you.</ConfirmDialog>}
    </div>
  );
}
