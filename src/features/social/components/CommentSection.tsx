import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addComment, deleteComment, fetchComments } from "../api";
import { socialErrorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { ReportDialog } from "./ReportDialog";
import { LoadingState } from "@/app/LoadingState";

export function CommentSection({ postId, me }: { postId: string; me: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const comments = useQuery({ queryKey: ["comments", postId], queryFn: () => fetchComments(postId) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["comments", postId] }); void qc.invalidateQueries({ queryKey: ["feed"] }); };
  const add = useMutation({ mutationFn: () => addComment(postId, text), onSuccess: () => { setText(""); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => deleteComment(id), onSuccess: refresh });

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {comments.isLoading && <LoadingState label="Gathering comments" />}
      {comments.isError && <p role="alert" className="err">Could not load comments.</p>}
      {comments.data?.length === 0 && <p className="text-sm text-muted">No comments yet. Be the first.</p>}
      <ul className="space-y-2">
        {comments.data?.map((c) => (
          <li key={c.id} className="text-sm">
            <Link className="font-medium hover:underline" to={`/app/u/${c.author?.username ?? ""}`}>{c.author?.display_name ?? "Student"}</Link>{" "}
            <span className="whitespace-pre-wrap break-words">{c.body}</span>
            <span className="ml-2 text-xs text-muted">{timeAgo(c.created_at)}{c.edited_at ? " · edited" : ""}</span>
            {c.author_id === me
              ? <button className="ml-2 text-xs text-muted underline" onClick={() => del.mutate(c.id)}>Delete</button>
              : <button className="ml-2 text-xs text-muted underline" onClick={() => setReporting(c.id)}>Report</button>}
          </li>))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <input className="input" aria-label="Write a comment" maxLength={1000} placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary" disabled={add.isPending || !text.trim()}>Post</button>
      </form>
      {add.isError && <p role="alert" className="err">{socialErrorMessage((add.error as Error).message)}</p>}
      {reporting && <ReportDialog type="comment" targetId={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}
