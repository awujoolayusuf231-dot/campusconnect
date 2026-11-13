import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Send } from "lucide-react";
import { addComment, COMMENT_PAGE_SIZE, deleteComment, fetchComments } from "../api";
import { socialErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { ReportDialog } from "./ReportDialog";
import { LoadingState } from "@/app/LoadingState";
import { Avatar } from "./Avatar";

export function CommentSection({ postId, me }: { postId: string; me: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const comments = useInfiniteQuery({
    queryKey: ["comments", postId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchComments(postId, pageParam),
    getNextPageParam: (lastPage, pages) => lastPage.length === COMMENT_PAGE_SIZE ? pages.length : undefined,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["comments", postId] });
    void qc.invalidateQueries({ queryKey: ["feed"] });
    void qc.invalidateQueries({ queryKey: ["post", postId] });
  };
  const add = useMutation({ mutationFn: () => addComment(postId, text), onSuccess: () => { setText(""); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => deleteComment(id), onSuccess: refresh });
  const visibleComments = comments.data?.pages.flat().filter((comment) => comment.author !== null) ?? [];

  return (
    <section aria-label="Comments" className="mt-3 space-y-4 border-t border-line pt-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-fg">Comments</h2>
        <span className="text-xs font-medium text-muted">{visibleComments.length} shown</span>
      </header>
      {comments.isLoading && <LoadingState label="Gathering comments" />}
      {comments.isError && <p role="alert" className="err">Could not load comments.</p>}
      {visibleComments.length === 0 && !comments.isLoading && !comments.isError && <div className="rounded-xl border border-dashed border-line bg-[#fffaf9] px-4 py-6 text-center">
        <p className="text-sm font-semibold text-fg">Start the conversation</p>
        <p className="mt-1 text-xs text-muted">Be the first to share a thoughtful comment.</p>
      </div>}
      <ul className="space-y-3">
        {visibleComments.map((c) => (
          <li key={c.id} className="flex min-w-0 gap-3 rounded-xl border border-line/80 bg-white p-3 sm:p-4">
            <Link to={`/app/u/${c.author?.username ?? ""}`} aria-label={`View ${c.author?.display_name ?? "Student"}'s profile`} className="shrink-0">
              <Avatar name={c.author?.display_name ?? "Student"} path={c.author?.avatar_path ?? null} size={36} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link className="max-w-full break-words text-sm font-bold text-fg hover:text-primary hover:underline" to={`/app/u/${c.author?.username ?? ""}`}>{c.author?.display_name ?? "Student"}</Link>
                <span className="break-all text-xs text-muted">@{c.author?.username ?? "student"}</span>
                <span aria-hidden="true" className="text-xs text-muted">·</span>
                <time dateTime={c.created_at} title={new Date(c.created_at).toLocaleString()} className="text-xs text-muted">{timeAgo(c.created_at)}{c.edited_at ? " · edited" : ""}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-[#393433]">{c.body}</p>
              <div className="mt-2 flex min-h-7 items-center gap-3">
                {c.author_id === me
                  ? <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:text-primary hover:underline disabled:opacity-50" disabled={del.isPending} onClick={() => del.mutate(c.id)}>Delete</button>
                  : <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:text-primary hover:underline" onClick={() => setReporting(c.id)}>Report</button>}
              </div>
            </div>
          </li>))}
      </ul>
      {comments.hasNextPage && <button type="button" className="btn min-h-10 w-full rounded-xl bg-white text-sm font-semibold" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
        {comments.isFetchingNextPage ? <><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading comments…</> : "Load earlier comments"}
      </button>}
      {comments.isFetchNextPageError && <p role="alert" className="err">Could not load more comments.</p>}
      {del.isError && <p role="alert" className="err">{socialErrorMessage((del.error as Error).message)}</p>}
      <form className="rounded-xl border border-line bg-[#fffaf9] p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <label htmlFor={`comment-${postId}`} className="mb-2 block text-xs font-bold text-fg">Add a comment</label>
        <textarea id={`comment-${postId}`} className="input min-h-20 w-full resize-y bg-white" aria-label="Write a comment" maxLength={1000} placeholder="Share your thoughts…" value={text} onChange={(e) => setText(e.target.value)} />
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
