import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Eye, Heart, LoaderCircle, Repeat2, Send } from "lucide-react";
import { addComment, COMMENT_PAGE_SIZE, deleteComment, fetchComments, likeComment, recordCommentImpressions, repostComment, replyToComment, unlikeComment, unrepostComment, type CommentRow } from "../api";
import { socialErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { ReportDialog } from "./ReportDialog";
import { LoadingState } from "@/app/LoadingState";
import { Avatar } from "./Avatar";
import { formatCount } from "@/lib/format";
import { MentionTextarea } from "./MentionTextarea";
import { PostBody } from "./PostBody";

type CommentMutation = {
  id: string;
  enabled: boolean;
  previousEnabled: boolean;
  previousCount: number;
};

type CommentInteractionOverrides = Partial<Pick<CommentRow, "liked_by_me" | "like_count" | "reposted_by_me" | "repost_count">>;

export function CommentSection({ postId, me, canReshare = true }: { postId: string; me: string; canReshare?: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [interactionOverrides, setInteractionOverrides] = useState<Record<string, CommentInteractionOverrides>>({});
  const observer = useRef<IntersectionObserver | null>(null);
  const commentElements = useRef(new Map<string, HTMLLIElement>());
  const commentRefs = useRef(new Map<string, (element: HTMLLIElement | null) => void>());
  const impressionTimers = useRef(new Map<string, number>());
  const recordedImpressions = useRef(new Set<string>());
  const comments = useInfiniteQuery({
    queryKey: ["comments", postId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchComments(postId, pageParam),
    getNextPageParam: (lastPage, pages) => lastPage.length === COMMENT_PAGE_SIZE ? pages.length : undefined,
  });
  const refreshComments = () => qc.invalidateQueries({ queryKey: ["comments", postId] });
  const refreshPostCounts = () => {
    refreshComments();
    void qc.invalidateQueries({ queryKey: ["feed"] });
    void qc.invalidateQueries({ queryKey: ["author-posts"] });
    void qc.invalidateQueries({ queryKey: ["community-posts"] });
    void qc.invalidateQueries({ queryKey: ["post", postId] });
  };
  const refreshReshares = async () => {
    await Promise.all([refreshComments(), qc.invalidateQueries({ queryKey: ["feed"] })]);
  };
  const add = useMutation({ mutationFn: () => addComment(postId, text), onSuccess: () => { setText(""); refreshPostCounts(); } });
  const reply = useMutation({
    mutationFn: (parentId: string) => replyToComment(postId, replyText, parentId),
    onSuccess: () => { setReplyText(""); setReplyingTo(null); refreshPostCounts(); },
  });
  const del = useMutation({ mutationFn: (id: string) => deleteComment(id), onSuccess: refreshPostCounts });
  const like = useMutation({
    mutationFn: ({ id, enabled }: CommentMutation) => enabled ? likeComment(id) : unlikeComment(id),
    onError: (_error, variables) => setInteractionOverrides((current) => ({
      ...current,
      [variables.id]: { ...current[variables.id], liked_by_me: variables.previousEnabled, like_count: variables.previousCount },
    })),
    onSuccess: async (_data, variables) => {
      await refreshComments();
      clearInteractionOverride(variables.id, "liked_by_me", "like_count");
    },
  });
  const repost = useMutation({
    mutationFn: ({ id, enabled }: CommentMutation) => enabled ? repostComment(id) : unrepostComment(id),
    onError: (_error, variables) => setInteractionOverrides((current) => ({
      ...current,
      [variables.id]: { ...current[variables.id], reposted_by_me: variables.previousEnabled, repost_count: variables.previousCount },
    })),
    onSuccess: async (_data, variables) => {
      await refreshReshares();
      clearInteractionOverride(variables.id, "reposted_by_me", "repost_count");
    },
  });
  function clearInteractionOverride(id: string, ...keys: (keyof CommentInteractionOverrides)[]) {
    setInteractionOverrides((current) => {
      const next = { ...current };
      const override = { ...next[id] };
      keys.forEach((key) => { delete override[key]; });
      if (Object.keys(override).length === 0) delete next[id];
      else next[id] = override;
      return next;
    });
  }
  function toggleCommentLike(comment: CommentRow, liked: boolean, likeCount: number) {
    const enabled = !liked;
    setInteractionOverrides((current) => ({
      ...current,
      [comment.id]: {
        ...current[comment.id],
        liked_by_me: enabled,
        like_count: Math.max(0, likeCount + (enabled ? 1 : -1)),
      },
    }));
    like.mutate({
      id: comment.id,
      enabled,
      previousEnabled: liked,
      previousCount: likeCount,
    });
  }
  function toggleCommentReshare(comment: CommentRow, reposted: boolean, repostCount: number) {
    const enabled = !reposted;
    setInteractionOverrides((current) => ({
      ...current,
      [comment.id]: {
        ...current[comment.id],
        reposted_by_me: enabled,
        repost_count: Math.max(0, repostCount + (enabled ? 1 : -1)),
      },
    }));
    repost.mutate({
      id: comment.id,
      enabled,
      previousEnabled: reposted,
      previousCount: repostCount,
    });
  }
  const visibleComments = comments.data?.pages.flat().filter((comment) => comment.author !== null) ?? [];
  const shownCount = visibleComments.reduce((count, comment) => count + 1 + (comment.replies ?? []).filter((replyRow) => replyRow.author !== null).length, 0);
  const interactionError = (like.error ?? repost.error ?? reply.error) as Error | null;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const currentObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLLIElement).dataset.commentId;
        if (!id || recordedImpressions.current.has(id)) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!impressionTimers.current.has(id)) {
            const timer = window.setTimeout(() => {
              impressionTimers.current.delete(id);
              recordedImpressions.current.add(id);
              void recordCommentImpressions([id]).catch((error: unknown) => {
                recordedImpressions.current.delete(id);
                console.error("CampusConnect could not record this comment impression.", error);
              });
            }, 1000);
            impressionTimers.current.set(id, timer);
          }
        } else {
          const timer = impressionTimers.current.get(id);
          if (timer !== undefined) window.clearTimeout(timer);
          impressionTimers.current.delete(id);
        }
      }
    }, { threshold: [0.5] });
    observer.current = currentObserver;
    commentElements.current.forEach((element) => currentObserver.observe(element));
    return () => {
      currentObserver.disconnect();
      observer.current = null;
      impressionTimers.current.forEach((timer) => window.clearTimeout(timer));
      impressionTimers.current.clear();
      commentElements.current.clear();
      commentRefs.current.clear();
    };
  }, [postId]);

  function commentRef(id: string) {
    let ref = commentRefs.current.get(id);
    if (!ref) {
      ref = (element) => {
        const previous = commentElements.current.get(id);
        if (previous) observer.current?.unobserve(previous);
        if (element) {
          element.dataset.commentId = id;
          commentElements.current.set(id, element);
          observer.current?.observe(element);
        } else {
          commentElements.current.delete(id);
          const timer = impressionTimers.current.get(id);
          if (timer !== undefined) window.clearTimeout(timer);
          impressionTimers.current.delete(id);
        }
      };
      commentRefs.current.set(id, ref);
    }
    return ref;
  }

  function renderComment(comment: CommentRow, isReply = false): ReactNode {
    if (!comment.author) return null;
    const replies = comment.replies ?? [];
    const likedByMe = interactionOverrides[comment.id]?.liked_by_me ?? comment.liked_by_me;
    const likeCount = interactionOverrides[comment.id]?.like_count ?? comment.like_count;
    const repostedByMe = interactionOverrides[comment.id]?.reposted_by_me ?? comment.reposted_by_me;
    const repostCount = interactionOverrides[comment.id]?.repost_count ?? comment.repost_count;
    return (
      <li ref={commentRef(comment.id)} key={comment.id} id={`comment-${comment.id}`} className={`flex min-w-0 gap-3 rounded-xl border border-line/80 bg-white p-3 sm:p-4 ${isReply ? "ml-8 border-dashed sm:ml-12" : ""}`}>
        <Link to={`/app/u/${comment.author.username}`} aria-label={`View ${comment.author.display_name}'s profile`} className="shrink-0">
          <Avatar name={comment.author.display_name} path={comment.author.avatar_path} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link className="max-w-full break-words text-sm font-bold text-fg hover:text-primary hover:underline" to={`/app/u/${comment.author.username}`}>{comment.author.display_name}</Link>
            <span className="break-all text-xs text-muted">@{comment.author.username}</span>
            <span aria-hidden="true" className="text-xs text-muted">·</span>
            <time dateTime={comment.created_at} title={new Date(comment.created_at).toLocaleString()} className="text-xs text-muted">{timeAgo(comment.created_at)}{comment.edited_at ? " · edited" : ""}</time>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-[#393433]"><PostBody body={comment.body} /></p>
          {comment.metrics && <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted" aria-label="Your private comment analytics">
            <span className="inline-flex items-center gap-1"><Eye size={12} aria-hidden="true" />{formatCount(comment.metrics.views)} views</span>
            <span className="inline-flex items-center gap-1"><BarChart3 size={12} aria-hidden="true" />{formatCount(comment.metrics.impressions)} impressions</span>
          </p>}
          <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className={`inline-flex items-center gap-1 text-xs font-semibold ${likedByMe ? "text-primary" : "text-muted hover:text-primary"}`}
              aria-label={likedByMe ? "Unlike comment" : "Like comment"} aria-pressed={likedByMe} disabled={like.isPending} onClick={() => toggleCommentLike(comment, likedByMe, likeCount)}>
              <Heart size={14} fill={likedByMe ? "currentColor" : "none"} aria-hidden="true" />{formatCount(likeCount)}<span className="sr-only"> likes</span>
            </button>
            {!isReply && <button type="button" className="text-xs font-semibold text-muted hover:text-primary hover:underline" onClick={() => {
              setReplyingTo((current) => current === comment.id ? null : comment.id);
              setReplyText("");
            }}>Reply{replies.length > 0 ? ` · ${formatCount(replies.length)}` : ""}</button>}
            <button type="button" className={`inline-flex items-center gap-1 text-xs font-semibold ${repostedByMe ? "text-primary" : "text-muted hover:text-primary"}`}
              aria-label={repostedByMe ? "Undo comment reshare" : "Reshare comment"} aria-pressed={repostedByMe} disabled={repost.isPending || !canReshare}
              title={canReshare ? "Share this comment as a public post" : "Community comments cannot be reshared"} onClick={() => toggleCommentReshare(comment, repostedByMe, repostCount)}>
              <Repeat2 size={14} aria-hidden="true" />{repostedByMe ? "Reposted" : "Reshare"}{repostCount > 0 ? ` · ${formatCount(repostCount)}` : ""}
            </button>
            {comment.author_id === me
              ? <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:text-primary hover:underline disabled:opacity-50" disabled={del.isPending} onClick={() => del.mutate(comment.id)}>Delete</button>
              : <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:text-primary hover:underline" onClick={() => setReporting(comment.id)}>Report</button>}
          </div>
          {replyingTo === comment.id && !isReply && <form className="mt-3 rounded-xl border border-line bg-[#fffaf9] p-3" onSubmit={(event) => {
            event.preventDefault();
            if (replyText.trim()) reply.mutate(comment.id);
          }}>
            <label htmlFor={`reply-${comment.id}`} className="mb-2 block text-xs font-bold text-fg">Reply to {comment.author.display_name}</label>
            <MentionTextarea id={`reply-${comment.id}`} className="input min-h-16 w-full resize-y bg-white" maxLength={1000} placeholder="Write a reply…" value={replyText} onValueChange={setReplyText} />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
              <button type="submit" className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold" disabled={reply.isPending || !replyText.trim()}>
                {reply.isPending ? <><LoaderCircle size={13} className="animate-spin" />Replying…</> : <><Send size={13} />Post reply</>}
              </button>
            </div>
          </form>}
          {replies.length > 0 && <ul className="mt-3 space-y-2">{replies.map((child) => renderComment(child, true))}</ul>}
        </div>
      </li>
    );
  }

  return (
    <section aria-label="Comments" className="mt-3 space-y-4 border-t border-line pt-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-fg">Comments</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted">{shownCount} shown</span>
        </div>
      </header>
      {comments.isLoading && <LoadingState label="Gathering comments" />}
      {comments.isError && <p role="alert" className="err">Could not load comments.</p>}
      {visibleComments.length === 0 && !comments.isLoading && !comments.isError && <div className="rounded-xl border border-dashed border-line bg-[#fffaf9] px-4 py-6 text-center">
        <p className="text-sm font-semibold text-fg">Start the conversation</p>
        <p className="mt-1 text-xs text-muted">Be the first to share a thoughtful comment.</p>
      </div>}
      <ul className="space-y-3">{visibleComments.map((comment) => renderComment(comment))}</ul>
      {comments.hasNextPage && <button type="button" className="btn min-h-10 w-full rounded-xl bg-white text-sm font-semibold" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
        {comments.isFetchingNextPage ? <><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading comments…</> : "Load earlier comments"}
      </button>}
      {comments.isFetchNextPageError && <p role="alert" className="err">Could not load more comments.</p>}
      {del.isError && <p role="alert" className="err">{socialErrorMessage((del.error as Error).message)}</p>}
      {interactionError && <p role="alert" className="err">{socialErrorMessage(interactionError.message)}</p>}
      <form className="rounded-xl border border-line bg-[#fffaf9] p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <label htmlFor={`comment-${postId}`} className="mb-2 block text-xs font-bold text-fg">Add a comment</label>
        <MentionTextarea id={`comment-${postId}`} className="input min-h-20 w-full resize-y bg-white" ariaLabel="Write a comment" maxLength={1000} placeholder="Share your thoughts…" value={text} onValueChange={setText} />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{text.length}/1000</span>
          <button type="submit" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold" disabled={add.isPending || !text.trim()}>
            {add.isPending ? <><LoaderCircle size={15} className="animate-spin" />Posting…</> : <><Send size={15} />Post comment</>}
          </button>
        </div>
      </form>
      {add.isError && <p role="alert" className="err">{socialErrorMessage((add.error as Error).message)}</p>}
      {add.isSuccess && <p role="status" className="text-xs font-semibold text-muted">Comment posted.</p>}
      {reporting && <ReportDialog type="comment" targetId={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
}
