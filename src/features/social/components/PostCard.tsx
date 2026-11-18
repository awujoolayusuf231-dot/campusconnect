import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bookmark, Eye, Heart, MessageCircle, Repeat2, Share2 } from "lucide-react";
import { blockUser, deletePost, likePost, muteUser, postShareUrl, repostPost, savePost, unlikePost, unsavePost, unrepostPost, type FeedPost, type PublicPostMetrics } from "../api";
import { socialErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { CommentSection } from "./CommentSection";
import { ProtectedPostImage } from "./ProtectedPostImage";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReportDialog } from "./ReportDialog";
import { usePostImpression } from "../usePostImpression";
import { PostBody } from "./PostBody";

const POST_PREVIEW_LIMIT = 280;

export function PostCard({ post, images, me, metrics, defaultOpenComments = false, inCommunity = false, fullPost = false, trackImpression = false }: {
  post: FeedPost;
  images?: string[];
  me: string;
  metrics?: PublicPostMetrics;
  defaultOpenComments?: boolean;
  inCommunity?: boolean;
  fullPost?: boolean;
  trackImpression?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [dialog, setDialog] = useState<"report" | "delete" | "block" | "mute" | null>(null);
  const [shareNote, setShareNote] = useState("");
  const [likedByMe, setLikedByMe] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [repostedByMe, setRepostedByMe] = useState(post.reposted_by_me);
  const [repostCount, setRepostCount] = useState(post.repost_count);
  const impressionRef = usePostImpression(trackImpression, post.id);
  const mine = post.author_id === me;
  const refresh = () => { for (const k of ["feed", "author-posts", "community-posts", "profile-reposts", "profile-stats", "post"]) void qc.invalidateQueries({ queryKey: [k] }); };

  useEffect(() => {
    setLikedByMe(post.liked_by_me);
    setLikeCount(post.like_count);
    setRepostedByMe(post.reposted_by_me);
    setRepostCount(post.repost_count);
  }, [post.id, post.liked_by_me, post.like_count, post.reposted_by_me, post.repost_count]);

  const like = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean; previousLiked: boolean; previousCount: number }) => enabled ? likePost(post.id) : unlikePost(post.id),
    onError: (_error, variables) => {
      setLikedByMe(variables.previousLiked);
      setLikeCount(variables.previousCount);
    },
    onSuccess: refresh,
  });
  const repost = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean; previousReposted: boolean; previousCount: number }) => enabled ? repostPost(post.id) : unrepostPost(post.id),
    onError: (_error, variables) => {
      setRepostedByMe(variables.previousReposted);
      setRepostCount(variables.previousCount);
    },
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: () => (metrics?.saved_by_me ? unsavePost(post.id) : savePost(post.id)),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["post-public-metrics"] });
      void qc.invalidateQueries({ queryKey: ["saved-posts"] });
    },
  });
  const del = useMutation({ mutationFn: () => deletePost(post.id), onSuccess: () => {
    setDialog(null);
    refresh();
    void qc.invalidateQueries({ queryKey: ["saved-posts"] });
  } });
  const block = useMutation({ mutationFn: () => blockUser(post.author_id), onSuccess: () => { setDialog(null); refresh(); void qc.invalidateQueries({ queryKey: ["discover"] }); } });
  const mute = useMutation({ mutationFn: () => muteUser(post.author_id), onSuccess: () => { setDialog(null); refresh(); } });

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
  const actionError = (like.error ?? repost.error ?? save.error ?? del.error ?? block.error ?? mute.error) as Error | null;

  function openPostFromCard(event: MouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [role='button']")) return;
    navigate(`/app/p/${post.id}`);
  }

  function toggleLike() {
    const previousLiked = likedByMe;
    const previousCount = likeCount;
    const enabled = !likedByMe;
    setLikedByMe(enabled);
    setLikeCount((count) => Math.max(0, count + (enabled ? 1 : -1)));
    like.mutate({ enabled, previousLiked, previousCount });
  }

  function toggleRepost() {
    const previousReposted = repostedByMe;
    const previousCount = repostCount;
    const enabled = !repostedByMe;
    setRepostedByMe(enabled);
    setRepostCount((count) => Math.max(0, count + (enabled ? 1 : -1)));
    repost.mutate({ enabled, previousReposted, previousCount });
  }

  return (
    <article ref={impressionRef} onClick={fullPost ? undefined : openPostFromCard} className={`group min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(35,24,20,0.035)] ${fullPost ? "shadow-[0_12px_36px_rgba(35,24,20,0.06)]" : "cursor-pointer transition-shadow hover:shadow-[0_14px_34px_rgba(35,24,20,0.07)]"}`} aria-label={`Post by ${post.display_name}`}>
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
              <button className="rounded-lg px-2 py-1.5 font-semibold text-muted hover:bg-[#fff1f2] hover:text-primary" onClick={() => setDialog("mute")}>Mute</button>
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
          <PostBody body={post.body} />
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
      {metrics && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-xs font-semibold text-muted sm:px-5" aria-label="Public post metrics">
        <span className="inline-flex items-center gap-1.5"><Eye size={14} aria-hidden="true" />{formatCount(metrics.views)} views</span>
        <span className="inline-flex items-center gap-1.5"><BarChart3 size={14} aria-hidden="true" />{formatCount(metrics.impressions)} impressions</span>
      </div>}
      <footer className="flex flex-wrap items-center justify-between gap-1 border-t border-line/80 px-2 py-2 sm:px-3">
        <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition-colors hover:bg-[#fff1f2] sm:px-3 sm:text-sm ${likedByMe ? "text-primary" : "text-muted hover:text-primary"}`} aria-pressed={likedByMe} disabled={like.isPending} onClick={toggleLike}>
          <Heart size={17} fill={likedByMe ? "currentColor" : "none"} aria-hidden="true" /> {formatCount(likeCount)}<span className="sr-only"> likes</span></button>
        <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-[#fff1f2] hover:text-primary sm:px-3 sm:text-sm" aria-expanded={showComments} onClick={() => setShowComments((v) => !v)}>
          <MessageCircle size={17} aria-hidden="true" /> {formatCount(post.comment_count)}<span className="sr-only"> comments</span></button>
        <button className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition-colors hover:bg-[#fff1f2] disabled:opacity-40 sm:px-3 sm:text-sm ${repostedByMe ? "text-primary" : "text-muted hover:text-primary"}`}
          aria-pressed={repostedByMe} disabled={!canRepost || repost.isPending}
          title={mine ? "You cannot repost your own post" : inCommunity ? "Community posts cannot be reposted" : repostedByMe ? "Undo repost" : "Repost to your profile and followers"}
          onClick={toggleRepost}>
          <Repeat2 size={17} aria-hidden="true" /> <span className="hidden sm:inline">{formatCount(repostCount)}</span><span className="sr-only">{formatCount(repostCount)} reposts. {repostedByMe ? "Undo repost" : "Repost"}</span></button>
        <button type="button" className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition-colors hover:bg-[#fff1f2] sm:px-3 sm:text-sm ${metrics?.saved_by_me ? "text-primary" : "text-muted hover:text-primary"}`}
          aria-pressed={metrics?.saved_by_me ?? false} disabled={save.isPending} onClick={() => save.mutate()}>
          <Bookmark size={17} fill={metrics?.saved_by_me ? "currentColor" : "none"} aria-hidden="true" />
          <span>{metrics?.saved_by_me ? "Saved" : "Save"}</span>
        </button>
        <button className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-[#fff1f2] hover:text-primary sm:px-3 sm:text-sm" onClick={() => void share()}>
          <Share2 size={17} aria-hidden="true" /> Share</button>
      </footer>
      {(shareNote || actionError || showComments) && (
        <div className="px-4 pb-4 sm:px-5">
          {shareNote && <p role="status" className="text-xs text-muted">{shareNote}</p>}
          {actionError && <p role="alert" className="err">{socialErrorMessage(String(actionError.message))}</p>}
          {showComments && <CommentSection postId={post.id} me={me} canReshare={!inCommunity} />}
        </div>
      )}
      {dialog === "report" && <ReportDialog type="post" targetId={post.id} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <ConfirmDialog title="Delete this post?" confirmLabel="Delete" busy={del.isPending} onConfirm={() => del.mutate()} onCancel={() => setDialog(null)}>This cannot be undone.</ConfirmDialog>}
      {dialog === "block" && <ConfirmDialog title={`Block @${post.username}?`} confirmLabel="Block" busy={block.isPending} onConfirm={() => block.mutate()} onCancel={() => setDialog(null)}>You will no longer see their posts, and they will not be able to interact with you.</ConfirmDialog>}
      {dialog === "mute" && <ConfirmDialog title={`Mute @${post.username}?`} confirmLabel="Mute" busy={mute.isPending} onConfirm={() => mute.mutate()} onCancel={() => setDialog(null)}>Their posts will no longer appear in your feeds.</ConfirmDialog>}
    </article>
  );
}
