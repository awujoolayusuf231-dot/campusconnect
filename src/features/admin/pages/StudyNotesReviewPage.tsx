import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowDownToLine, CircleAlert, ExternalLink } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { useMyPermissions } from "@/features/admin/useMyPermissions";
import { createStudyNoteDownloadUrl, listStudyNotes, reviewStudyNote, type StudyNote } from "@/features/study-notes/api";

export function StudyNotesReviewPage() {
  const queryClient = useQueryClient();
  const permissions = useMyPermissions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const canReview = permissions.data?.includes("study_notes.review") ?? false;
  const pending = useQuery({
    queryKey: ["admin", "study-notes", "pending"],
    queryFn: () => listStudyNotes({ status: "pending", limit: 100 }),
    enabled: canReview,
  });
  const review = useMutation({
    mutationFn: ({ noteId, decision }: { noteId: string; decision: "approved" | "rejected" }) =>
      reviewStudyNote(noteId, decision, decision === "rejected" ? reason : undefined),
    onSuccess: async () => {
      setSelectedId(null);
      setReason("");
      setDocumentUrl("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "study-notes"] }),
        queryClient.invalidateQueries({ queryKey: ["study-notes"] }),
      ]);
    },
  });
  const preview = useMutation({
    mutationFn: (path: string) => createStudyNoteDownloadUrl(path),
    onSuccess: setDocumentUrl,
  });
  const selected = pending.data?.find((note) => note.id === selectedId) ?? null;

  if (permissions.isLoading) return <LoadingState label="Checking Study Notes review access" variant="panel" />;
  if (permissions.isError) return <section role="alert" className="card">Could not verify Study Notes review access.</section>;
  if (!canReview) return <section role="alert" className="card">You do not have permission to review Study Notes.</section>;
  if (pending.isLoading) return <LoadingState label="Loading study-note submissions" variant="panel" />;
  if (pending.isError) return <section role="alert" className="card"><h1 className="font-semibold">Could not load study-note submissions</h1><p className="mt-1 break-words text-sm text-muted">{pending.error.message}</p><button className="btn mt-3" onClick={() => void pending.refetch()}>Try again</button></section>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Study Notes review</h1>
        <p className="mt-1 text-sm text-muted">Review submitted PDFs. Only approved notes are visible to students in discovery.</p>
      </header>
      {!pending.data?.length && <p className="card text-center text-muted">No study-note submissions are awaiting review.</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(20rem,1.1fr)]">
        <ul className="space-y-2">
          {pending.data?.map((note) => (
            <li key={note.id}>
              <button type="button" className={`card w-full text-left ${selectedId === note.id ? "ring-2 ring-primary" : ""}`} onClick={() => { setSelectedId(note.id); setReason(""); setDocumentUrl(""); review.reset(); preview.reset(); }}>
                <p className="font-semibold">{note.title}</p>
                <p className="mt-1 text-sm text-muted">{note.course?.code} · {note.course?.title}</p>
                <p className="mt-1 text-xs text-muted">{note.course?.department?.name} · {note.level} level · {note.semester} semester · {new Date(note.created_at).toLocaleDateString()}</p>
              </button>
            </li>
          ))}
        </ul>
        {selected && <ReviewDetail
          key={selected.id}
          note={selected}
          reason={reason}
          documentUrl={documentUrl}
          isReviewing={review.isPending}
          isPreparingPreview={preview.isPending}
          reviewError={review.error}
          previewError={preview.error}
          onReasonChange={setReason}
          onPreview={() => preview.mutate(selected.object_path)}
          onApprove={() => review.mutate({ noteId: selected.id, decision: "approved" })}
          onReject={() => review.mutate({ noteId: selected.id, decision: "rejected" })}
        />}
      </div>
    </div>
  );
}

function ReviewDetail({
  note,
  reason,
  documentUrl,
  isReviewing,
  isPreparingPreview,
  reviewError,
  previewError,
  onReasonChange,
  onPreview,
  onApprove,
  onReject,
}: {
  note: StudyNote;
  reason: string;
  documentUrl: string;
  isReviewing: boolean;
  isPreparingPreview: boolean;
  reviewError: Error | null;
  previewError: Error | null;
  onReasonChange: (value: string) => void;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <section className="card space-y-3" aria-label="Study-note submission detail">
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-lg font-semibold">{note.title}</h2><Link to={`/app/study-notes/notes/${note.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Open details <ExternalLink size={13} aria-hidden="true" /></Link></div>
      <p className="text-sm text-muted">{note.description}</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Course</dt><dd>{note.course?.code} · {note.course?.title}</dd>
        <dt className="text-muted">Department</dt><dd>{note.course?.department?.name ?? "Unavailable"}</dd>
        <dt className="text-muted">Institution</dt><dd>{note.course?.department?.institution?.name ?? "Unavailable"}</dd>
        <dt className="text-muted">Level / semester</dt><dd>{note.level} level · {note.semester}</dd>
        <dt className="text-muted">Submitted</dt><dd>{new Date(note.created_at).toLocaleString()}</dd>
      </dl>
      <button type="button" className="btn min-h-9 gap-2" disabled={isPreparingPreview} onClick={onPreview}><ArrowDownToLine size={14} aria-hidden="true" />{isPreparingPreview ? "Preparing secure PDF…" : "Preview submitted PDF"}</button>
      {previewError && <p role="alert" className="break-words text-sm text-danger">{previewError.message}</p>}
      {documentUrl && <div className="space-y-2"><iframe title={`${note.title} review preview`} src={documentUrl} className="h-[28rem] w-full rounded-xl border border-line" /><a href={documentUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary underline">Open PDF in a new tab</a></div>}
      <label className="block"><span className="label">Rejection feedback (required to reject)</span><textarea className="input min-h-20" maxLength={500} value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Explain what needs to be corrected" /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={isReviewing} onClick={onApprove}>Approve and publish</button>
        <button type="button" className="btn-danger" disabled={isReviewing || reason.trim().length < 5} onClick={onReject}>Reject submission</button>
      </div>
      {reviewError && <p role="alert" className="flex items-start gap-2 break-words text-sm text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{reviewError.message}</p>}
    </section>
  );
}
