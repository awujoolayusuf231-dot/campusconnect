import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, FileText, Flag, MessagesSquare, Paperclip, Pencil, Send, Trash2 } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import { timeAgo } from "@/lib/time";
import { useAuth } from "@/features/auth/AuthProvider";
import { getCourse, listCourses, listDepartments, listInstitutions, type Course } from "@/features/past-questions/api";
import { ReportDialog } from "@/features/social/components/ReportDialog";
import type { ReportTarget } from "@/features/social/api";
import {
  ASSIGNMENT_DISCUSSIONS_PAGE_SIZE,
  createAssignmentDiscussion,
  createAssignmentDiscussionReply,
  createDiscussionAttachmentUrl,
  deleteAssignmentDiscussion,
  deleteAssignmentDiscussionAttachment,
  deleteAssignmentDiscussionReply,
  listAssignmentDiscussions,
  MAX_ASSIGNMENT_DISCUSSION_ATTACHMENT_BYTES,
  updateAssignmentDiscussion,
  updateAssignmentDiscussionReply,
  validateDiscussionAttachment,
  type AssignmentDiscussion,
  type AssignmentDiscussionReply,
  type CreateDiscussionInput,
  type DiscussionAttachment,
  type DiscussionCategory,
} from "./api";

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function ErrorState({ error, retry, title = "Could not load the course catalog" }: { error: unknown; retry: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return (
    <section role="alert" className="rounded-2xl border border-red-200 bg-white p-5">
      <h2 className="font-extrabold text-fg">{title}</h2>
      <p className="mt-1 break-words text-sm text-muted">{message}</p>
      <button type="button" className="btn mt-3 min-h-9" onClick={retry}>Try again</button>
    </section>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <li>
      <Link to={`/app/assignment-discussions/courses/${course.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
        <span className="w-fit rounded-lg bg-[#fff1ef] px-2.5 py-1 text-xs font-black text-primary">{course.code}</span>
        <h3 className="mt-4 font-extrabold leading-6 text-fg group-hover:text-primary">{course.title}</h3>
        <p className="mt-1 text-sm text-muted">{course.department?.name ?? "Department unavailable"} · {course.department?.institution?.name ?? "Institution unavailable"}</p>
        <span className="mt-4 inline-flex min-h-9 items-center justify-between gap-2 border-t border-line pt-3 text-xs font-extrabold text-primary">
          Open course room <ArrowRight size={13} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export function AssignmentDiscussionsPage() {
  const [institutionId, setInstitutionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const institutions = useQuery({ queryKey: ["past-questions", "institutions"], queryFn: listInstitutions });
  const departments = useQuery({
    queryKey: ["past-questions", "departments", institutionId],
    queryFn: () => listDepartments(institutionId || undefined),
  });
  const courses = useQuery({ queryKey: ["past-questions", "courses"], queryFn: () => listCourses() });

  const filteredCourses = useMemo(() => {
    const departmentIds = new Set(departments.data?.map((department) => department.id) ?? []);
    const term = search.trim().toLocaleLowerCase();
    return (courses.data ?? []).filter((course) =>
      (!institutionId || departmentIds.has(course.department_id))
      && (!departmentId || course.department_id === departmentId)
      && (!term || `${course.code} ${course.title}`.toLocaleLowerCase().includes(term)),
    );
  }, [courses.data, departmentId, departments.data, institutionId, search]);

  const error = institutions.error ?? departments.error ?? courses.error;
  if (institutions.isLoading || courses.isLoading) {
    return <LoadingState label="Loading assignment discussion rooms" variant="panel" />;
  }
  if (error) {
    return <ErrorState error={error} retry={() => {
      void institutions.refetch();
      void departments.refetch();
      void courses.refetch();
    }} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="relative overflow-hidden rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff0ef] p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-primary/10 sm:h-72 sm:w-72" />
        <div className="relative flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm sm:flex"><MessagesSquare size={23} aria-hidden="true" /></span>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#efd9db] bg-white/80 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary shadow-sm">Learn together</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-fg sm:text-3xl">Assignment Discussion Rooms</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Find a course room to ask questions, share assignment ideas and study alongside classmates.</p>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <PageTitle eyebrow="Find your course" title="Course rooms" description="Browse the real academic catalog to find a room for your course." />
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="label">Institution</span>
              <select className="input" value={institutionId} onChange={(event) => {
                setInstitutionId(event.target.value);
                setDepartmentId("");
              }}>
                <option value="">All institutions</option>
                {(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Department</span>
              <select className="input" value={departmentId} disabled={departments.isLoading} onChange={(event) => setDepartmentId(event.target.value)}>
                <option value="">All departments</option>
                {(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Search courses</span>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Course code or title" />
            </label>
          </div>
        </div>
        {filteredCourses.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredCourses.map((course) => <CourseCard key={course.id} course={course} />)}</ul>
        ) : (
          <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-9 text-center">
            <BookOpen size={22} className="mx-auto text-primary" aria-hidden="true" />
            <h3 className="mt-3 font-extrabold text-fg">No courses found</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">Try another search or check whether courses have been added to the academic catalog.</p>
          </section>
        )}
      </section>
    </div>
  );
}

export function AssignmentDiscussionRoomPage() {
  const { courseId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showComposer, setShowComposer] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTarget; id: string } | null>(null);
  const { session } = useAuth();
  const course = useQuery({
    queryKey: ["assignment-discussions", "course", courseId],
    queryFn: () => getCourse(courseId),
    enabled: !!courseId,
  });
  const discussions = useQuery({
    queryKey: ["assignment-discussions", "list", courseId],
    queryFn: () => listAssignmentDiscussions(courseId),
    enabled: !!courseId,
  });
  const queryClient = useQueryClient();
  const refreshDiscussions = () => queryClient.invalidateQueries({ queryKey: ["assignment-discussions", "list", courseId] });
  const threadLinkId = searchParams.get("discussion");

  useEffect(() => {
    if (!threadLinkId || !discussions.data) return;
    document.getElementById(`discussion-${threadLinkId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [discussions.data, threadLinkId]);

  if (course.isLoading || discussions.isLoading) return <LoadingState label="Loading course room" variant="panel" />;
  if (course.isError) return <ErrorState error={course.error} retry={() => void course.refetch()} />;
  if (discussions.isError) return <ErrorState error={discussions.error} retry={() => void discussions.refetch()} title="Could not load course discussions" />;
  if (!course.data) {
    return (
      <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-9 text-center">
        <h2 className="font-extrabold text-fg">Course not found</h2>
        <p className="mt-1 text-sm text-muted">This course is unavailable or inactive in the academic catalog.</p>
        <Link to="/app/assignment-discussions" className="btn mt-4 min-h-9">Browse courses</Link>
      </section>
    );
  }

  const { data: selectedCourse } = course;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link to="/app/assignment-discussions" className="inline-flex min-h-9 items-center gap-2 text-sm font-bold text-primary hover:underline">
        <ArrowRight size={14} className="rotate-180" aria-hidden="true" /> Browse courses
      </Link>
      <header className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
        <PageTitle
          eyebrow="Course discussion room"
          title={`${selectedCourse.code} · ${selectedCourse.title}`}
          description={`${selectedCourse.department?.name ?? "Department unavailable"} · ${selectedCourse.department?.institution?.name ?? "Institution unavailable"}`}
        />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <h2 className="font-extrabold text-fg">Course discussions</h2>
            <p className="mt-1 text-xs text-muted">Questions and study conversations for this course</p>
          </div>
          <button type="button" className="btn-primary min-h-10 gap-2" onClick={() => setShowComposer((visible) => !visible)}>
            <MessagesSquare size={15} aria-hidden="true" />{showComposer ? "Close form" : "Start a discussion"}
          </button>
        </div>
      </header>

      {showComposer && <DiscussionComposer
        key="new-discussion"
        courseId={courseId}
        mode="discussion"
        onCancel={() => setShowComposer(false)}
        onSaved={async () => {
          setShowComposer(false);
          await refreshDiscussions();
        }}
      />}

      {discussions.data?.length ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Latest activity</p>
              <h2 className="mt-1 text-lg font-extrabold text-fg">Discussions <span className="text-sm font-semibold text-muted">({discussions.data.length}{discussions.data.length === ASSIGNMENT_DISCUSSIONS_PAGE_SIZE ? "+" : ""})</span></h2>
            </div>
            <label className="w-full sm:max-w-xs">
              <span className="sr-only">Search discussions</span>
              <input className="input" value={searchParams.get("q") ?? ""} onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.value) next.set("q", event.target.value);
                else next.delete("q");
                setSearchParams(next, { replace: true });
              }} placeholder="Search discussions" />
            </label>
          </div>
          <DiscussionList
            discussions={discussions.data.filter((discussion) => {
              const term = (searchParams.get("q") ?? "").trim().toLocaleLowerCase();
              return !term || `${discussion.title} ${discussion.body} ${discussion.replies.map((reply) => reply.body).join(" ")}`.toLocaleLowerCase().includes(term);
            })}
            userId={session?.user.id}
            targetDiscussionId={threadLinkId}
            onReport={(type, id) => setReportTarget({ type, id })}
            onRefresh={refreshDiscussions}
          />
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-9 text-center">
          <MessagesSquare size={22} className="mx-auto text-primary" aria-hidden="true" />
          <h2 className="mt-3 font-extrabold text-fg">No discussions yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">Start a course discussion to ask a question or invite classmates to study together.</p>
        </section>
      )}
      {reportTarget && <ReportDialog type={reportTarget.type} targetId={reportTarget.id} onClose={() => setReportTarget(null)} />}
    </div>
  );
}

type DiscussionComposerProps = {
  courseId: string;
  discussionId?: string;
  mode: "discussion" | "reply";
  onCancel: () => void;
  onSaved: () => Promise<unknown> | unknown;
};

function DiscussionComposer({ courseId, discussionId, mode, onCancel, onSaved }: DiscussionComposerProps) {
  const [category, setCategory] = useState<DiscussionCategory>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      if (mode === "discussion") return createAssignmentDiscussion({ courseId, category, title, body, file });
      if (!discussionId) throw new Error("The discussion could not be found.");
      return createAssignmentDiscussionReply({ discussionId, body, file });
    },
    onSuccess: async () => {
      setTitle("");
      setBody("");
      setFile(null);
      setFileError("");
      await onSaved();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file) {
      const error = validateDiscussionAttachment(file);
      setFileError(error ?? "");
      if (error) return;
    }
    mutation.mutate();
  }
  return (
    <form className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5" onSubmit={submit}>
      <h2 className="font-extrabold text-fg">{mode === "discussion" ? "Start a discussion" : "Write a reply"}</h2>
      {mode === "discussion" && <>
        <label className="block">
          <span className="label">Discussion type</span>
          <select className="input" value={category} onChange={(event) => setCategory(event.target.value as DiscussionCategory)}>
            <option value="question">Question</option>
            <option value="assignment_help">Assignment help</option>
            <option value="study_group">Study group</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Title</span>
          <input className="input" required minLength={5} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What would you like to discuss?" />
        </label>
      </>}
      <label className="block">
        <span className="label">{mode === "discussion" ? "Details" : "Reply"}</span>
        <textarea className="input min-h-28" required minLength={mode === "discussion" ? 10 : 1} maxLength={mode === "discussion" ? 5000 : 3000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={mode === "discussion" ? "Share enough context for classmates to help." : "Share a helpful response."} />
      </label>
      <label className="block">
        <span className="label">Attach a PDF (optional, up to {MAX_ASSIGNMENT_DISCUSSION_ATTACHMENT_BYTES / 1024 / 1024} MB)</span>
        <input className="input" type="file" accept="application/pdf,.pdf" onChange={(event) => {
          const nextFile = event.target.files?.[0] ?? null;
          setFile(nextFile);
          setFileError(nextFile ? validateDiscussionAttachment(nextFile) ?? "" : "");
        }} />
      </label>
      {file && <p className="text-xs text-muted">{file.name}</p>}
      {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
      {mutation.isError && <p role="alert" className="break-words text-sm text-danger">{mutation.error.message}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn min-h-10" disabled={mutation.isPending} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary min-h-10 gap-2" disabled={mutation.isPending || !!fileError}>
          <Send size={14} aria-hidden="true" />{mutation.isPending ? "Posting…" : mode === "discussion" ? "Post discussion" : "Post reply"}
        </button>
      </div>
    </form>
  );
}

function DiscussionList({
  discussions,
  userId,
  targetDiscussionId,
  onReport,
  onRefresh,
}: {
  discussions: AssignmentDiscussion[];
  userId: string | undefined;
  targetDiscussionId: string | null;
  onReport: (type: ReportTarget, id: string) => void;
  onRefresh: () => Promise<unknown>;
}) {
  if (!discussions.length) {
    return <p className="rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted">No discussions match your search.</p>;
  }
  return (
    <ul className="space-y-3">
      {discussions.map((discussion) => (
        <DiscussionCard
          key={discussion.id}
          discussion={discussion}
          userId={userId}
          highlighted={discussion.id === targetDiscussionId}
          onReport={onReport}
          onRefresh={onRefresh}
        />
      ))}
    </ul>
  );
}

function DiscussionCard({
  discussion,
  userId,
  highlighted,
  onReport,
  onRefresh,
}: {
  discussion: AssignmentDiscussion;
  userId: string | undefined;
  highlighted: boolean;
  onReport: (type: ReportTarget, id: string) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const edit = useMutation({
    mutationFn: (input: Pick<CreateDiscussionInput, "category" | "title" | "body">) => updateAssignmentDiscussion(discussion.id, input),
    onSuccess: async () => {
      setEditing(false);
      await onRefresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteAssignmentDiscussion(discussion.id),
    onSuccess: onRefresh,
  });
  const own = !!userId && discussion.author_id === userId;
  if (editing) {
    return <li id={`discussion-${discussion.id}`}><EditDiscussionForm discussion={discussion} pending={edit.isPending} error={edit.error} onCancel={() => setEditing(false)} onSave={(input) => edit.mutate(input)} /></li>;
  }
  return (
    <li id={`discussion-${discussion.id}`} className={`rounded-2xl border bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5 ${highlighted ? "border-primary ring-2 ring-primary/20" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full bg-[#fff1ef] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">{categoryLabel(discussion.category)}</span>
          <h3 className="mt-3 break-words font-extrabold leading-6 text-fg">{discussion.title}</h3>
          <p className="mt-1 text-xs text-muted">{discussion.author?.display_name ?? "CampusConnect user"} · {timeAgo(discussion.created_at)}{discussion.updated_at !== discussion.created_at ? " · edited" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {own && <button type="button" className="btn min-h-9 gap-1.5 px-2.5" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden="true" />Edit</button>}
          {own && <button type="button" className="btn min-h-9 gap-1.5 px-2.5 text-danger" disabled={remove.isPending} onClick={() => {
            if (window.confirm("Delete this discussion? Its replies will no longer be visible.")) remove.mutate();
          }}><Trash2 size={13} aria-hidden="true" />Delete</button>}
          {!own && <button type="button" className="btn min-h-9 gap-1.5 px-2.5" onClick={() => onReport("assignment_discussion", discussion.id)}><Flag size={13} aria-hidden="true" />Report</button>}
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-fg">{discussion.body}</p>
      {!!discussion.attachments.length && <ul className="mt-4 space-y-2">{discussion.attachments.map((attachment) => <li key={attachment.id}><DiscussionAttachmentItem attachment={attachment} onRemove={onRefresh} /></li>)}</ul>}
      {(edit.isError || remove.isError) && <p role="alert" className="mt-3 break-words text-sm text-danger">{edit.error?.message ?? remove.error?.message}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-xs font-semibold text-muted">{discussion.replies.length} {discussion.replies.length === 1 ? "reply" : "replies"}</span>
        <button type="button" className="btn min-h-9 gap-1.5" onClick={() => setReplying((visible) => !visible)}><MessagesSquare size={14} aria-hidden="true" />{replying ? "Close reply" : "Reply"}</button>
      </div>
      {replying && <div className="mt-3"><DiscussionComposer
        key={`reply-${discussion.id}`}
        courseId={discussion.course_id}
        discussionId={discussion.id}
        mode="reply"
        onCancel={() => setReplying(false)}
        onSaved={async () => {
          setReplying(false);
          await onRefresh();
        }}
      /></div>}
      {!!discussion.replies.length && <ul className="mt-4 space-y-3 border-l-2 border-[#f0dadd] pl-3 sm:pl-5">{discussion.replies.map((reply) => <DiscussionReplyItem key={reply.id} discussionId={discussion.id} reply={reply} userId={userId} onReport={onReport} onRefresh={onRefresh} />)}</ul>}
    </li>
  );
}

function DiscussionReplyItem({
  discussionId,
  reply,
  userId,
  onReport,
  onRefresh,
}: {
  discussionId: string;
  reply: AssignmentDiscussionReply;
  userId: string | undefined;
  onReport: (type: ReportTarget, id: string) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const edit = useMutation({
    mutationFn: (body: string) => updateAssignmentDiscussionReply(reply.id, body),
    onSuccess: async () => {
      setEditing(false);
      await onRefresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteAssignmentDiscussionReply(reply.id, discussionId),
    onSuccess: onRefresh,
  });
  const own = !!userId && reply.author_id === userId;
  return (
    <li className="rounded-xl bg-[#fbfaf9] p-3 sm:p-4">
      {editing ? <EditReplyForm reply={reply} pending={edit.isPending} error={edit.error} onCancel={() => setEditing(false)} onSave={(body) => edit.mutate(body)} /> : <>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs font-semibold text-fg">{reply.author?.display_name ?? "CampusConnect user"} <span className="font-normal text-muted">· {timeAgo(reply.created_at)}</span></p>
          <div className="flex flex-wrap gap-1">
            {own && <button type="button" className="btn min-h-8 gap-1 px-2 text-xs" onClick={() => setEditing(true)}><Pencil size={12} aria-hidden="true" />Edit</button>}
            {own && <button type="button" className="btn min-h-8 gap-1 px-2 text-xs text-danger" disabled={remove.isPending} onClick={() => {
              if (window.confirm("Delete your reply?")) remove.mutate();
            }}><Trash2 size={12} aria-hidden="true" />Delete</button>}
            {!own && <button type="button" className="btn min-h-8 gap-1 px-2 text-xs" onClick={() => onReport("assignment_discussion_reply", reply.id)}><Flag size={12} aria-hidden="true" />Report</button>}
          </div>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-fg">{reply.body}</p>
        {!!reply.attachments.length && <ul className="mt-3 space-y-2">{reply.attachments.map((attachment) => <li key={attachment.id}><DiscussionAttachmentItem attachment={attachment} onRemove={onRefresh} /></li>)}</ul>}
        {(edit.isError || remove.isError) && <p role="alert" className="mt-2 text-xs text-danger">{edit.error?.message ?? remove.error?.message}</p>}
      </>}
    </li>
  );
}

function EditDiscussionForm({
  discussion,
  pending,
  error,
  onCancel,
  onSave,
}: {
  discussion: AssignmentDiscussion;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onSave: (input: Pick<CreateDiscussionInput, "category" | "title" | "body">) => void;
}) {
  const [category, setCategory] = useState(discussion.category);
  const [title, setTitle] = useState(discussion.title);
  const [body, setBody] = useState(discussion.body);
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-white p-4" onSubmit={(event) => {
      event.preventDefault();
      onSave({ category, title, body });
    }}>
      <h3 className="font-extrabold">Edit discussion</h3>
      <label className="block"><span className="label">Discussion type</span><select className="input" value={category} onChange={(event) => setCategory(event.target.value as DiscussionCategory)}><option value="question">Question</option><option value="assignment_help">Assignment help</option><option value="study_group">Study group</option></select></label>
      <label className="block"><span className="label">Title</span><input className="input" required minLength={5} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="block"><span className="label">Details</span><textarea className="input min-h-28" required minLength={10} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn" disabled={pending} onClick={onCancel}>Cancel</button><button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
    </form>
  );
}

function EditReplyForm({
  reply,
  pending,
  error,
  onCancel,
  onSave,
}: {
  reply: AssignmentDiscussionReply;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onSave: (body: string) => void;
}) {
  const [body, setBody] = useState(reply.body);
  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      onSave(body);
    }}>
      <label className="block"><span className="label">Edit reply</span><textarea className="input min-h-24" required minLength={1} maxLength={3000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      {error && <p role="alert" className="text-xs text-danger">{error.message}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn min-h-9" disabled={pending} onClick={onCancel}>Cancel</button><button type="submit" className="btn-primary min-h-9" disabled={pending}>{pending ? "Saving…" : "Save reply"}</button></div>
    </form>
  );
}

function DiscussionAttachmentItem({ attachment, onRemove }: { attachment: DiscussionAttachment; onRemove: () => void }) {
  const { session } = useAuth();
  const [url, setUrl] = useState("");
  const preview = useMutation({ mutationFn: () => createDiscussionAttachmentUrl(attachment.object_path), onSuccess: setUrl });
  const remove = useMutation({ mutationFn: deleteAssignmentDiscussionAttachment, onSuccess: onRemove });
  const own = session?.user.id === attachment.uploaded_by;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white p-3">
      <span className="flex min-w-0 items-center gap-2 text-sm"><FileText size={16} className="shrink-0 text-primary" aria-hidden="true" /><span className="truncate">{attachment.file_name}</span><span className="shrink-0 text-xs text-muted">{formatFileSize(attachment.file_size)}</span></span>
      <span className="flex items-center gap-2">
        {url ? <a className="text-xs font-bold text-primary underline" href={url} target="_blank" rel="noreferrer">Open PDF</a> : <button type="button" className="btn min-h-8 gap-1 px-2.5 text-xs" disabled={preview.isPending} onClick={() => preview.mutate()}><Paperclip size={12} aria-hidden="true" />{preview.isPending ? "Preparing…" : "View PDF"}</button>}
        {own && <button type="button" className="btn min-h-8 px-2 text-xs text-danger" disabled={remove.isPending} onClick={() => {
          if (window.confirm("Remove this PDF attachment?")) remove.mutate(attachment);
        }}>Remove</button>}
      </span>
      {(preview.isError || remove.isError) && <span role="alert" className="w-full text-xs text-danger">{preview.error?.message ?? remove.error?.message}</span>}
    </div>
  );
}

function categoryLabel(category: DiscussionCategory): string {
  switch (category) {
    case "assignment_help": return "Assignment help";
    case "study_group": return "Study group";
    default: return "Question";
  }
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
