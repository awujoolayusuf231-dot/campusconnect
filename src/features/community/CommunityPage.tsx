import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { archiveCommunity, COMMUNITY_CATEGORIES, getCommunityBySlug, joinCommunity, leaveCommunity, listMembers, myCommunityRole, setMember, setPostState, updateCommunity } from "./api";
import { fetchMediaUrls, FEED_PAGE, type Cursor, type FeedPost } from "@/features/social/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Composer } from "@/features/social/components/Composer";
import { PostCard } from "@/features/social/components/PostCard";
import { Avatar } from "@/features/social/components/Avatar";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import { socialErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";

type Tab = "posts" | "members" | "moderation";

export function CommunityPage() {
  const { slug = "" } = useParams();
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("posts");
  const [reporting, setReporting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const community = useQuery({ queryKey: ["community", slug], queryFn: () => getCommunityBySlug(slug) });
  const c = community.data;
  const role = useQuery({ queryKey: ["community-role", c?.id, me], enabled: !!c, queryFn: () => myCommunityRole(c!.id) });
  const isMod = role.data === "owner" || role.data === "moderator";
  const isOwner = role.data === "owner";
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["community"] }); void qc.invalidateQueries({ queryKey: ["community-role"] }); void qc.invalidateQueries({ queryKey: ["community-members"] }); void qc.invalidateQueries({ queryKey: ["communities"] }); };
  const join = useMutation({ mutationFn: () => joinCommunity(c!.id), onSuccess: refresh });
  const leave = useMutation({ mutationFn: () => leaveCommunity(c!.id), onSuccess: () => { setLeaving(false); refresh(); } });
  const archive = useMutation({ mutationFn: () => archiveCommunity(c!.id, c!.status === "active"), onSuccess: refresh });

  if (community.isLoading) return <p role="status">Loading…</p>;
  if (community.isError) return <p role="alert" className="err">Could not load this community.</p>;
  if (!c) return <div className="card">This community does not exist or is not available. <Link className="underline" to="/app/communities">Back to communities</Link></div>;
  const isMember = !!role.data;
  const err = (join.error ?? leave.error ?? archive.error) as Error | null;

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <Link to="/app/communities" className="text-sm underline">← Communities</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">{c.name}</h1>
            <p className="text-sm text-muted">{COMMUNITY_CATEGORIES.find(([v]) => v === c.category)?.[1]} · {c.member_count} member{c.member_count === 1 ? "" : "s"}{c.status !== "active" ? ` · ${c.status}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">
            {!isMember && c.status === "active" && <button className="btn-primary" disabled={join.isPending} onClick={() => join.mutate()}>Join</button>}
            {isMember && !isOwner && <button className="btn" onClick={() => setLeaving(true)}>Leave</button>}
            {isOwner && c.status !== "disabled" && <button className="btn" disabled={archive.isPending} onClick={() => archive.mutate()}>{c.status === "active" ? "Archive" : "Unarchive"}</button>}
            {!isOwner && <button className="btn" onClick={() => setReporting(true)}>Report</button>}
          </div>
        </div>
        {c.description && <p className="whitespace-pre-wrap">{c.description}</p>}
        {c.status === "archived" && <p className="text-sm text-muted">This community is archived: it is read-only.</p>}
        {c.status === "disabled" && <p role="alert" className="err">This community has been disabled by platform moderators.</p>}
        {err && <p role="alert" className="err">{socialErrorMessage(err.message)}</p>}
        {isOwner && <EditDescription id={c.id} initial={c.description ?? ""} onSaved={refresh} />}
      </section>
      <div role="tablist" aria-label="Community" className="flex gap-2">
        {(["posts", "members", ...(isMod ? ["moderation"] : [])] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "btn-primary" : "btn"} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
      </div>
      {tab === "posts" && <CommunityPosts community={c} isMember={isMember} isMod={isMod} me={me} />}
      {tab === "members" && <Members id={c.id} me={me} role={role.data ?? null} />}
      {tab === "moderation" && isMod && <ModerationTab id={c.id} />}
      {reporting && <ReportDialog type="community" targetId={c.id} onClose={() => setReporting(false)} />}
      {leaving && <ConfirmDialog title="Leave this community?" confirmLabel="Leave" busy={leave.isPending} onConfirm={() => leave.mutate()} onCancel={() => setLeaving(false)} />}
    </div>
  );
}

function EditDescription({ id, initial, onSaved }: { id: string; initial: string; onSaved: () => void }) {
  const [v, setV] = useState(initial); const [open, setOpen] = useState(false);
  const m = useMutation({ mutationFn: () => updateCommunity(id, v), onSuccess: () => { setOpen(false); onSaved(); } });
  if (!open) return <button className="text-sm underline" onClick={() => setOpen(true)}>Edit description</button>;
  return <div className="space-y-2"><textarea aria-label="Description" className="input" rows={3} maxLength={500} value={v} onChange={(e) => setV(e.target.value)} /><div className="flex gap-2"><button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>Save</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button></div></div>;
}

function CommunityPosts({ community, isMember, isMod, me }: { community: { id: string; status: string }; isMember: boolean; isMod: boolean; me: string }) {
  const qc = useQueryClient();
  const [hiding, setHiding] = useState<string | null>(null); const [reason, setReason] = useState("");
  const feed = useInfiniteQuery({
    queryKey: ["community-posts", community.id], initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("community_posts", { p_comm: community.id, p_before: pageParam?.created_at ?? null, p_before_id: pageParam?.id ?? null, p_limit: FEED_PAGE });
      if (error) throw error; return (data ?? []) as FeedPost[]; },
    getNextPageParam: (last): Cursor | undefined => { const t = last[last.length - 1]; return last.length === FEED_PAGE && t ? { created_at: t.activity_at, id: t.id } : undefined; },
  });
  const posts = feed.data?.pages.flat() ?? []; const ids = posts.map((p) => p.id);
  const media = useQuery({ queryKey: ["media", ids.join(",")], enabled: ids.length > 0, queryFn: () => fetchMediaUrls(ids) });
  const hide = useMutation({ mutationFn: () => setPostState(hiding!, true, reason), onSuccess: () => { setHiding(null); setReason(""); void qc.invalidateQueries({ queryKey: ["community-posts"] }); void qc.invalidateQueries({ queryKey: ["community-hidden"] }); } });
  return (
    <div className="space-y-3">
      {isMember && community.status === "active" && <Composer communityId={community.id} />}
      {!isMember && community.status === "active" && <p className="card text-sm text-muted">Join this community to post.</p>}
      {feed.isLoading && <p role="status">Loading posts…</p>}
      {posts.length === 0 && !feed.isLoading && <p className="card text-center text-muted">No posts yet.</p>}
      {posts.map((p) => (
        <div key={p.id} className="space-y-1">
          <PostCard post={p} images={media.data?.[p.id]} me={me} inCommunity />
          {isMod && p.author_id !== me && <button className="text-xs underline text-muted" onClick={() => setHiding(p.id)}>Hide as community moderator</button>}
        </div>))}
      {feed.hasNextPage && <button className="btn w-full" onClick={() => void feed.fetchNextPage()}>Load more</button>}
      {hiding && (
        <div role="dialog" aria-modal="true" aria-label="Hide post" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card w-full max-w-sm space-y-3"><h2 className="font-semibold">Hide this post</h2>
            <label className="label" htmlFor="hr">Reason (min 5 characters, recorded in the community log)</label><textarea id="hr" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {hide.isError && <p role="alert" className="err">{socialErrorMessage(String((hide.error as Error).message))}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setHiding(null)}>Cancel</button><button className="btn-danger" disabled={reason.trim().length < 5 || hide.isPending} onClick={() => hide.mutate()}>Hide</button></div></div></div>)}
    </div>
  );
}

function Members({ id, me, role }: { id: string; me: string; role: string | null }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ user: string; action: string } | null>(null); const [reason, setReason] = useState("");
  const members = useQuery({ queryKey: ["community-members", id], queryFn: () => listMembers(id) });
  const act = useMutation({ mutationFn: () => setMember(id, pending!.user, pending!.action, reason), onSuccess: () => { setPending(null); setReason(""); void qc.invalidateQueries({ queryKey: ["community-members"] }); void qc.invalidateQueries({ queryKey: ["community-banned"] }); void qc.invalidateQueries({ queryKey: ["community"] }); } });
  const needsReason = pending && ["ban", "unban", "remove"].includes(pending.action);
  const isMod = role === "owner" || role === "moderator";
  const run = (user: string, action: string) => (action === "make_moderator" || action === "remove_moderator") ? setPending({ user, action }) : setPending({ user, action });
  return (
    <div className="space-y-2">
      {members.isLoading && <p role="status">Loading…</p>}
      <ul className="space-y-2">{members.data?.filter((m) => m.status === "active").map((m) => (
        <li key={m.user_id} className="card flex items-center gap-3">
          <Avatar name={m.profile?.display_name ?? "?"} path={m.profile?.avatar_path ?? null} />
          <div className="min-w-0 flex-1"><Link to={`/app/u/${m.profile?.username ?? ""}`} className="font-medium hover:underline">{m.profile?.display_name ?? "Student"}</Link><p className="text-xs text-muted">@{m.profile?.username} · {m.role} · joined {timeAgo(m.joined_at)}</p></div>
          {isMod && m.user_id !== me && m.role !== "owner" && (
            <div className="flex flex-wrap gap-1 text-xs">
              {(role === "owner" || m.role === "member") && <button className="btn" onClick={() => run(m.user_id, "ban")}>Ban</button>}
              {(role === "owner" || m.role === "member") && <button className="btn" onClick={() => run(m.user_id, "remove")}>Remove</button>}
              {role === "owner" && <button className="btn" onClick={() => run(m.user_id, m.role === "moderator" ? "remove_moderator" : "make_moderator")}>{m.role === "moderator" ? "Remove mod" : "Make mod"}</button>}
            </div>)}
        </li>))}</ul>
      {isMod && <BannedList id={id} onUnban={(user) => setPending({ user, action: "unban" })} />}
      {pending && (
        <div role="dialog" aria-modal="true" aria-label="Confirm action" className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className="card w-full max-w-sm space-y-3"><h2 className="font-semibold">Confirm: {pending.action.replace("_", " ")}</h2>
            {needsReason && <><label className="label" htmlFor="mr">Reason (min 5 characters)</label><textarea id="mr" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></>}
            {act.isError && <p role="alert" className="err">{socialErrorMessage(String((act.error as Error).message))}</p>}
            <div className="flex justify-end gap-2"><button className="btn" onClick={() => setPending(null)}>Cancel</button><button className="btn-danger" disabled={act.isPending || (!!needsReason && reason.trim().length < 5)} onClick={() => act.mutate()}>Confirm</button></div></div></div>)}
    </div>
  );
}

function ModerationTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const hidden = useQuery({ queryKey: ["community-hidden", id], queryFn: async () => {
    const { data, error } = await supabase.from("posts").select("id,body,created_at,hidden_scope").eq("community_id", id).eq("status", "hidden").order("created_at", { ascending: false }).limit(50);
    if (error) throw error; return (data ?? []) as { id: string; body: string; created_at: string; hidden_scope: string | null }[]; } });
  const log = useQuery({ queryKey: ["community-log", id], queryFn: async () => {
    const { data, error } = await supabase.from("community_mod_actions").select("id,action,reason,created_at").eq("community_id", id).order("created_at", { ascending: false }).limit(50);
    if (error) throw error; return (data ?? []) as { id: number; action: string; reason: string | null; created_at: string }[]; } });
  const restore = useMutation({ mutationFn: (post: string) => setPostState(post, false, reason), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["community-hidden"] }); void qc.invalidateQueries({ queryKey: ["community-posts"] }); void qc.invalidateQueries({ queryKey: ["community-log"] }); } });
  return (
    <div className="space-y-4">
      <section className="card space-y-2"><h2 className="font-medium">Hidden posts</h2>
        <label className="label" htmlFor="rr">Reason for restoring (min 5 characters)</label><input id="rr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        {hidden.data?.length === 0 && <p className="text-sm text-muted">No hidden posts.</p>}
        <ul className="space-y-2">{hidden.data?.map((p) => (<li key={p.id} className="rounded border border-line p-2 text-sm"><p className="line-clamp-3 whitespace-pre-wrap">{p.body}</p>
          {p.hidden_scope === "platform" ? <p className="text-xs text-muted">Removed by platform moderators; cannot be restored here.</p> : <button className="btn mt-1" disabled={reason.trim().length < 5 || restore.isPending} onClick={() => restore.mutate(p.id)}>Restore</button>}</li>))}</ul>
        {restore.isError && <p role="alert" className="err">{socialErrorMessage(String((restore.error as Error).message))}</p>}</section>
      <section className="card space-y-2"><h2 className="font-medium">Moderation log</h2>
        {log.data?.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
        <ul className="space-y-1 text-sm">{log.data?.map((a) => <li key={a.id}><span className="font-medium">{a.action.replace("_", " ")}</span>{a.reason ? ` — ${a.reason}` : ""} <span className="text-xs text-muted">{timeAgo(a.created_at)}</span></li>)}</ul></section>
    </div>
  );
}

function BannedList({ id, onUnban }: { id: string; onUnban: (user: string) => void }) {
  const banned = useQuery({ queryKey: ["community-banned", id], queryFn: async () => {
    const { data, error } = await supabase.rpc("community_banned_list", { p_comm: id }); if (error) throw error;
    return (data ?? []) as { user_id: string; username: string; display_name: string; joined_at: string }[]; } });
  if (!banned.data?.length) return null;
  return (
    <section className="card space-y-2"><h2 className="font-medium">Banned members</h2>
      <ul className="space-y-1 text-sm">{banned.data.map((b) => <li key={b.user_id} className="flex items-center justify-between gap-2"><span>{b.display_name} <span className="text-muted">@{b.username}</span></span><button className="btn" onClick={() => onUnban(b.user_id)}>Unban</button></li>)}</ul></section>
  );
}
