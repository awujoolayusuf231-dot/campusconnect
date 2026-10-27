import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Repeat2, Share2 } from "lucide-react";
import { blockUser, deletePost, likePost, postShareUrl, repostPost, unlikePost, unrepostPost, type FeedPost } from "../api";
import { socialErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { CommentSection } from "./CommentSection";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReportDialog } from "./ReportDialog";

export function PostCard({ post, images, me, defaultOpenComments = false, inCommunity = false }: { post: FeedPost; images?: string[]; me: string; defaultOpenComments?: boolean; inCommunity?: boolean }) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [dialog, setDialog] = useState<"report" | "delete" | "block" | null>(null);
  const [shareNote, setShareNote] = useState("");
  const mine = post.author_id === me;
  const refresh = () => { for (const k of ["feed", "author-posts", "community-posts", "profile-reposts", "profile-stats", "post"]) void qc.invalidateQueries({ queryKey: [k] }); };

  const like = useMutation({ mutationFn: () => (post.liked_by_me ? unlikePost(post.id) : likePost(post.id)), onSuccess: refresh });
  const repost = useMutation({ mutationFn: () => (post.reposted_by_me ? unrepostPost(post.id) : repostPost(post.id)), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => deletePost(post.id), onSuccess: () => { setDialog(null); refresh(); } });
  const block = useMutation({ mutationFn: () => blockUser(post.author_id), onSuccess: () => { setDialog(null); refresh(); void qc.invalidateQueries({ queryKey: ["discover"] }); } });

  // Share = send the link elsewhere (phone share sheet, or copy). Repost = put the post on your own profile and your followers' feed.
  async function share() {
    const url = postShareUrl(post.id);
    setShareNote("");
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title: `${post.display_name} on CampusConnect`, text: post.body.slice(0, 100), url }); return; }
      await navigator.clipboard.writeText(url); setShareNote("Link copied");
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      setShareNote("Could not share. Copy the address from your browser instead.");
    }
  }
  const canRepost = !mine && !inCommunity;
  const actionError = (like.error ?? repost.error ?? del.error ?? block.error) as Error | null;

  return (
    <article className="card space-y-3 transition-shadow hover:shadow-sm" aria-label={`Post by ${post.display_name}`}>
      {post.reposter_name && (
        <p className="flex items-center gap-1 text-xs text-muted"><Repeat2 size={14} aria-hidden="true" /> <Link className="hover:underline" to={`/app/u/${post.reposter_username ?? ""}`}>{post.reposter_name}</Link> reposted</p>)}
      <header className="flex items-center gap-3">
        <Avatar name={post.display_name} path={post.avatar_path} />
        <div className="min-w-0 flex-1">
          <Link to={`/app/u/${post.username}`} className="font-medium hover:underline">{post.display_name}</Link>
          <p className="text-xs text-muted">@{post.username} · <Link to={`/app/p/${post.id}`} className="hover:underline">{timeAgo(post.created_at)}</Link>{post.edited_at ? " · edited" : ""}</p>
        </div>
        <div className="flex gap-2 text-xs">
          {mine ? <button className="underline text-muted" onClick={() => setDialog("delete")}>Delete</button> : (
            <>
              <button className="underline text-muted" onClick={() => setDialog("report")}>Report</button>
              <button className="underline text-muted" onClick={() => setDialog("block")}>Block</button>
            </>)}
        </div>
      </header>
      <p className="whitespace-pre-wrap break-words">{post.body}</p>
      {images && images.length > 0 && (
        <div className={`grid gap-2 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {images.map((u) => <img key={u} src={u} alt="Attached to post" loading="lazy" className="max-h-96 w-full rounded-lg object-cover" />)}
        </div>)}
      <footer className="flex flex-wrap items-center gap-1 text-sm">
        <button className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 hover:bg-bg ${post.liked_by_me ? "font-semibold text-primary" : "text-muted"}`} aria-pressed={post.liked_by_me} disabled={like.isPending} onClick={() => like.mutate()}>
          <Heart size={16} fill={post.liked_by_me ? "currentColor" : "none"} aria-hidden="true" /> {formatCount(post.like_count)}<span className="sr-only"> likes</span></button>
        <button className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-muted hover:bg-bg" aria-expanded={showComments} onClick={() => setShowComments((v) => !v)}>
          <MessageCircle size={16} aria-hidden="true" /> {formatCount(post.comment_count)}<span className="sr-only"> comments</span></button>
        <button className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 hover:bg-bg disabled:opacity-40 ${post.reposted_by_me ? "font-semibold text-primary" : "text-muted"}`}
          aria-pressed={post.reposted_by_me} disabled={!canRepost || repost.isPending}
          title={mine ? "You cannot repost your own post" : inCommunity ? "Community posts cannot be reposted" : post.reposted_by_me ? "Undo repost" : "Repost to your profile and followers"}
          onClick={() => repost.mutate()}>
          <Repeat2 size={16} aria-hidden="true" /> {formatCount(post.repost_count)}<span className="sr-only"> reposts. {post.reposted_by_me ? "Undo repost" : "Repost"}</span></button>
        <button className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-muted hover:bg-bg" onClick={() => void share()}>
          <Share2 size={16} aria-hidden="true" /> Share</button>
      </footer>
      {shareNote && <p role="status" className="text-xs text-muted">{shareNote}</p>}
      {actionError && <p role="alert" className="err">{socialErrorMessage(String(actionError.message))}</p>}
      {showComments && <CommentSection postId={post.id} me={me} />}
      {dialog === "report" && <ReportDialog type="post" targetId={post.id} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <ConfirmDialog title="Delete this post?" confirmLabel="Delete" busy={del.isPending} onConfirm={() => del.mutate()} onCancel={() => setDialog(null)}>This cannot be undone.</ConfirmDialog>}
      {dialog === "block" && <ConfirmDialog title={`Block @${post.username}?`} confirmLabel="Block" busy={block.isPending} onConfirm={() => block.mutate()} onCancel={() => setDialog(null)}>You will no longer see their posts, and they will not be able to interact with you.</ConfirmDialog>}
    </article>
  );
}
