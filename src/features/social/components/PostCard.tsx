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
import { ProtectedPostImage } from "./ProtectedPostImage";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReportDialog } from "./ReportDialog";
import { usePostImpression } from "../usePostImpression";

const POST_PREVIEW_LIMIT = 280;

export function PostCard({ post, images, me, defaultOpenComments = false, inCommunity = false, fullPost = false, trackImpression = false }: {
  post: FeedPost;
  images?: string[];
  me: string;
  defaultOpenComments?: boolean;
  inCommunity?: boolean;
  fullPost?: boolean;
  trackImpression?: boolean;
}) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [dialog, setDialog] = useState<"report" | "delete" | "block" | null>(null);
  const [shareNote, setShareNote] = useState("");
  const impressionRef = usePostImpression(trackImpression, post.id);
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
    <article ref={impressionRef} className={`group min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(35,24,20,0.035)] ${fullPost ? "shadow-[0_12px_36px_rgba(35,24,20,0.06)]" : "transition-shadow hover:shadow-[0_14px_34px_rgba(35,24,20,0.07)]"}`} aria-label={`Post by ${post.display_name}`}>
      <div className="space-y-4 p-4 sm:p-5">
      {post.reposter_name && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Repeat2 size={14} aria-hidden="true" /> <Link className="font-semibold hover:text-primary hover:underline" to={`/app/u/${post.reposter_username ?? ""}`}>{post.reposter_name}</Link> reposted</p>)}
      <header className="flex items-start gap-3">
        <Avatar name={post.display_name} path={post.avatar_path} />
        <div className="min-w-0 flex-1">
          <Link to={`/app/u/${post.username}`} className="text-sm font-extrabold tracking-tight text-fg hover:text-primary hover:underline">{post.display_name}</Link>
          <p className="mt-0.5 min-w-0 break-words text-xs text-muted">@{post.username} <span aria-hidden="true">·</span> <Link to={`/app/p/${post.id}`} className="hover:text-primary hover:underline" title={new Date(post.created_at).toLocaleString()}>
            {fullPost ? <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time> : timeAgo(post.created_at)}
          </Link>{post.edited_at ? " · edited" : ""}</p>
        </div>
        <div className="flex shrink-0 gap-1 text-xs">
          {mine ? <button className="rounded-lg px-2 py-1.5 font-semibold text-muted hover:bg-[#fff1f2] hover:text-primary" onClick={() => setDialog("delete")}>Delete</button> : (
            <>
              <button className="rounded-lg px-2 py-1.5 font-semibold text-muted hover:bg-[#fff1f2] hover:text-primary" onClick={() => setDialog("report")}>Report</button>
              <button className="rounded-lg px-2 py-1.5 font-semibold text-muted hover:bg-[#fff1f2] hover:text-primary" onClick={() => setDialog("block")}>Block</button>
            </>)}
        </div>
      </header>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[15px] leading-7 text-[#393433]"
          style={!fullPost && post.body.length > POST_PREVIEW_LIMIT ? {
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 6,
            overflow: "hidden",
          } : undefined}>
          {post.body}
        </p>
        {!fullPost && post.body.length > POST_PREVIEW_LIMIT && <Link to={`/app/p/${post.id}`} className="mt-1 inline-flex min-h-8 items-center rounded-lg px-2 text-sm font-bold text-primary hover:bg-[#fff1f2] hover:underline">
          Show more
        </Link>}
      </div>
      {images && images.length > 0 && (
        <div className={`grid gap-2 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {images.map((path) => <ProtectedPostImage key={path} path={path} />)}
        </div>)}
      </div>
      <footer className="flex items-center justify-between gap-1 border-t border-line/80 px-2 py-2 sm:px-3">
        <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition-colors hover:bg-[#fff1f2] sm:px-3 sm:text-sm ${post.liked_by_me ? "text-primary" : "text-muted hover:text-primary"}`} aria-pressed={post.liked_by_me} disabled={like.isPending} onClick={() => like.mutate()}>
          <Heart size={17} fill={post.liked_by_me ? "currentColor" : "none"} aria-hidden="true" /> {formatCount(post.like_count)}<span className="sr-only"> likes</span></button>
        <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-[#fff1f2] hover:text-primary sm:px-3 sm:text-sm" aria-expanded={showComments} onClick={() => setShowComments((v) => !v)}>
          <MessageCircle size={17} aria-hidden="true" /> {formatCount(post.comment_count)}<span className="sr-only"> comments</span></button>
        <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition-colors hover:bg-[#fff1f2] disabled:opacity-40 sm:px-3 sm:text-sm ${post.reposted_by_me ? "text-primary" : "text-muted hover:text-primary"}`}
          aria-pressed={post.reposted_by_me} disabled={!canRepost || repost.isPending}
          title={mine ? "You cannot repost your own post" : inCommunity ? "Community posts cannot be reposted" : post.reposted_by_me ? "Undo repost" : "Repost to your profile and followers"}
          onClick={() => repost.mutate()}>
          <Repeat2 size={17} aria-hidden="true" /> <span className="hidden sm:inline">{formatCount(post.repost_count)}</span><span className="sr-only">{formatCount(post.repost_count)} reposts. {post.reposted_by_me ? "Undo repost" : "Repost"}</span></button>
        <button className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-[#fff1f2] hover:text-primary sm:px-3 sm:text-sm" onClick={() => void share()}>
          <Share2 size={17} aria-hidden="true" /> Share</button>
      </footer>
      {(shareNote || actionError || showComments) && (
        <div className="px-4 pb-4 sm:px-5">
          {shareNote && <p role="status" className="text-xs text-muted">{shareNote}</p>}
          {actionError && <p role="alert" className="err">{socialErrorMessage(String(actionError.message))}</p>}
          {showComments && <CommentSection postId={post.id} me={me} />}
        </div>
      )}
      {dialog === "report" && <ReportDialog type="post" targetId={post.id} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <ConfirmDialog title="Delete this post?" confirmLabel="Delete" busy={del.isPending} onConfirm={() => del.mutate()} onCancel={() => setDialog(null)}>This cannot be undone.</ConfirmDialog>}
      {dialog === "block" && <ConfirmDialog title={`Block @${post.username}?`} confirmLabel="Block" busy={block.isPending} onConfirm={() => block.mutate()} onCancel={() => setDialog(null)}>You will no longer see their posts, and they will not be able to interact with you.</ConfirmDialog>}
    </article>
  );
}
