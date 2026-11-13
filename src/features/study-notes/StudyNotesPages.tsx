import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRight, BookOpen, Bookmark, Building2, ChevronRight, CircleAlert, FileText, LockKeyhole, Search, Upload } from "lucide-react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import { useAuth } from "@/features/auth/AuthProvider";
import { createCourse, createDepartment, getCourse, getInstitution, listCourses, listDepartments, listInstitutionPage, listInstitutions, type Course, type Institution } from "@/features/past-questions/api";
import {
  createStudyNoteDownloadUrl,
  getStudyNote,
  isStudyNoteSaved,
  listSavedStudyNotes,
  listStudyNotes,
  MAX_STUDY_NOTE_FILE_BYTES,
  setStudyNoteSaved,
  uploadStudyNote,
  validateStudyNoteFile,
  type StudyNote,
  type StudyNoteLevel,
  type StudyNoteSemester,
} from "./api";

const LEVELS: StudyNoteLevel[] = ["100", "200", "300", "400", "500", "600", "700"];
const SEMESTERS: { value: StudyNoteSemester; label: string }[] = [
  { value: "first", label: "First semester" },
  { value: "second", label: "Second semester" },
  { value: "other", label: "Other" },
];

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return (
    <section role="alert" className="rounded-2xl border border-red-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div><h2 className="font-extrabold text-fg">Could not load Study Notes</h2><p className="mt-1 break-words text-sm text-muted">{message}</p>{retry && <button type="button" className="btn mt-3 min-h-9" onClick={retry}>Try again</button>}</div>
      </div>
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-9 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><BookOpen size={20} aria-hidden="true" /></span>
      <h3 className="mt-3 font-extrabold text-fg">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}

function NoteStatus({ status }: { status: StudyNote["status"] }) {
  const styles = status === "approved" ? "bg-emerald-100 text-emerald-800" : status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${styles}`}>{status}</span>;
}

function SaveNoteButton({ note }: { note: StudyNote }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const saved = useQuery({
    queryKey: ["study-notes", "saved-status", userId, note.id],
    queryFn: () => isStudyNoteSaved(note.id, userId!),
    enabled: !!userId && note.status === "approved",
  });
  const toggle = useMutation({
    mutationFn: (nextSaved: boolean) => {
      if (!userId) throw new Error("Sign in to save study notes.");
      return setStudyNoteSaved(note.id, userId, nextSaved);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["study-notes", "saved-status", userId, note.id] }),
        queryClient.invalidateQueries({ queryKey: ["study-notes", "saved", userId] }),
      ]);
    },
  });
  if (note.status !== "approved") return null;
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" className="btn min-h-9 gap-1.5" disabled={!userId || saved.isLoading || toggle.isPending} onClick={() => toggle.mutate(!saved.data)}>
        <Bookmark size={14} aria-hidden="true" />{toggle.isPending ? "Saving…" : saved.data ? "Saved" : "Save"}
      </button>
      {(saved.isError || toggle.isError) && <span role="alert" className="mt-1 max-w-48 text-xs text-danger">{saved.error?.message ?? toggle.error?.message}</span>}
    </span>
  );
}

function StudyNoteCard({ note }: { note: StudyNote }) {
  return (
    <li className="flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><FileText size={19} aria-hidden="true" /></span>
        <span className="rounded-full bg-bg px-2.5 py-1 text-[10px] font-bold text-muted">{note.level} level · {note.semester} semester</span>
      </div>
      <Link to={`/app/study-notes/notes/${note.id}`} className="mt-4 font-extrabold leading-6 text-fg hover:text-primary">{note.title}</Link>
      <p className="mt-1 text-xs font-semibold text-muted">{note.course?.code} · {note.course?.title}</p>
      <p className="mt-1 text-xs text-muted">{note.course?.department?.name ?? "Department"} · {note.course?.department?.institution?.name ?? "Institution"}</p>
      <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted">{note.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <Link to={`/app/study-notes/notes/${note.id}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-extrabold text-primary">View note <ArrowRight size={14} aria-hidden="true" /></Link>
        <SaveNoteButton note={note} />
      </div>
    </li>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <li>
      <Link to={`/app/study-notes/courses/${course.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
        <span className="w-fit rounded-lg bg-[#fff1ef] px-2.5 py-1 text-xs font-black text-primary">{course.code}</span>
        <h3 className="mt-4 font-extrabold leading-6 text-fg group-hover:text-primary">{course.title}</h3>
        <p className="mt-1 text-sm text-muted">{course.department?.name ?? "Department unavailable"} · {course.department?.institution?.name ?? "Institution unavailable"}</p>
        <span className="mt-4 inline-flex min-h-9 items-center justify-between gap-2 border-t border-line pt-3 text-xs font-extrabold text-primary">View course notes <ArrowRight size={13} aria-hidden="true" /></span>
      </Link>
    </li>
  );
}

export function StudyNotesLayout() {
  const sections = [
    { to: "/app/study-notes", label: "Discover", end: true },
    { to: "/app/study-notes/institutions", label: "Institutions" },
    { to: "/app/study-notes/courses", label: "Courses" },
    { to: "/app/study-notes/upload", label: "Upload" },
    { to: "/app/study-notes/my-uploads", label: "My uploads" },
    { to: "/app/study-notes/saved", label: "Saved" },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="relative overflow-hidden rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff0ef] p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-primary/10 sm:h-72 sm:w-72" />
        <div className="relative flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm sm:flex"><BookOpen size={23} aria-hidden="true" /></span>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#efd9db] bg-white/80 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary shadow-sm">Academic resources</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-fg sm:text-3xl">Study Notes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Browse, save and share approved course materials from your campus community.</p>
          </div>
        </div>
      </header>
      <nav aria-label="Study Notes" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-2 shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
        {sections.map((section) => <NavLink key={section.to} to={section.to} end={section.end} className={({ isActive }) => `min-h-10 shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:text-sm ${isActive ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:bg-[#fff4f2] hover:text-primary"}`}>{section.label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}

export function StudyNotesHome() {
  const [search, setSearch] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [level, setLevel] = useState<StudyNoteLevel | "">("");
  const [semester, setSemester] = useState<StudyNoteSemester | "">("");
  const institutions = useQuery({ queryKey: ["past-questions", "institutions"], queryFn: listInstitutions });
  const departments = useQuery({ queryKey: ["past-questions", "departments", institutionId], queryFn: () => listDepartments(institutionId || undefined) });
  const notes = useQuery({
    queryKey: ["study-notes", "discover", search, institutionId, departmentId, level, semester],
    queryFn: () => listStudyNotes({
      search,
      institutionId: institutionId || undefined,
      departmentId: departmentId || undefined,
      level: level || undefined,
      semester: semester || undefined,
      limit: 6,
    }),
  });
  const courses = useQuery({ queryKey: ["past-questions", "courses"], queryFn: () => listCourses() });
  const catalogError = institutions.error ?? departments.error;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Study smarter" title="Find your next study guide" description="Discover reviewed notes from students, organized by your institution, department and course." />
      {catalogError && <ErrorState error={catalogError} retry={() => { void institutions.refetch(); void departments.refetch(); }} />}
      <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
        <label className="block"><span className="label">Search approved notes</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, course code or course title" /></label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="label">Institution</span><select className="input" value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); }}><option value="">All institutions</option>{(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
          <label><span className="label">Department</span><select className="input" value={departmentId} disabled={departments.isLoading} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label><span className="label">Level</span><select className="input" value={level} onChange={(event) => setLevel(event.target.value as StudyNoteLevel | "")}><option value="">All levels</option>{LEVELS.map((value) => <option key={value} value={value}>{value} level</option>)}</select></label>
          <label><span className="label">Semester</span><select className="input" value={semester} onChange={(event) => setSemester(event.target.value as StudyNoteSemester | "")}><option value="">All semesters</option>{SEMESTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <p className="mt-2 text-xs text-muted">Only approved notes are shown. Filters use the real academic catalog.</p>
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Recently approved</p><h2 className="mt-1 text-lg font-extrabold text-fg">Study notes</h2></div><Link to="/app/study-notes/courses" className="text-sm font-bold text-primary hover:underline">Browse courses</Link></div>
        {notes.isLoading ? <LoadingState label="Loading approved study notes" variant="panel" /> : notes.isError ? <ErrorState error={notes.error} retry={() => void notes.refetch()} /> : notes.data?.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{notes.data.map((note) => <StudyNoteCard key={note.id} note={note} />)}</ul> : <EmptyState title="No approved notes yet" description={search ? "Try a different title or course search." : "Student submissions appear here after an administrator approves them."} />}
      </section>
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Academic catalog</p><h2 className="mt-1 text-lg font-extrabold text-fg">Browse courses</h2></div><Link to="/app/study-notes/courses" className="text-sm font-bold text-primary hover:underline">View all</Link></div>
        {courses.isLoading ? <LoadingState label="Loading the course catalog" variant="panel" /> : courses.isError ? <ErrorState error={courses.error} retry={() => void courses.refetch()} /> : courses.data?.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{courses.data.slice(0, 6).map((course) => <CourseCard key={course.id} course={course} />)}</ul> : <EmptyState title="No courses in the catalog yet" description="Courses will appear here after they have been added to the CampusConnect academic catalog." />}
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/app/study-notes/institutions" className="rounded-2xl border border-line bg-white p-4 hover:border-[#edc9cd]"><Building2 size={19} className="text-primary" aria-hidden="true" /><h3 className="mt-3 font-extrabold">Browse institutions</h3><p className="mt-1 text-xs text-muted">Explore active institutions in the academic catalog.</p></Link>
        <Link to="/app/study-notes/upload" className="rounded-2xl border border-line bg-white p-4 hover:border-[#edc9cd]"><Upload size={19} className="text-primary" aria-hidden="true" /><h3 className="mt-3 font-extrabold">Share your notes</h3><p className="mt-1 text-xs text-muted">Submit course notes for administrator review.</p></Link>
        <Link to="/app/study-notes/saved" className="rounded-2xl border border-line bg-white p-4 hover:border-[#edc9cd]"><Bookmark size={19} className="text-primary" aria-hidden="true" /><h3 className="mt-3 font-extrabold">Saved notes</h3><p className="mt-1 text-xs text-muted">Return to study materials you bookmarked.</p></Link>
      </section>
    </div>
  );
}

export function StudyNotesInstitutions() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const query = useQuery({
    queryKey: ["study-notes", "institutions", submittedSearch, page],
    queryFn: () => listInstitutionPage(submittedSearch, (page - 1) * pageSize, pageSize),
  });
  if (query.isLoading) return <LoadingState label="Loading institutions" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const result = query.data ?? { items: [], total: 0 };
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  }
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Explore campuses" title="Browse institutions" description="Choose an institution to explore its real departments, courses and approved notes." />
      <form className="rounded-2xl border border-line bg-white p-4 sm:p-5" onSubmit={submitSearch} aria-label="Search institutions">
        <label className="block"><span className="label">Search institutions</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Enter an institution name" /></label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs text-muted">{result.total} active institutions · page {page} of {totalPages}</p><button type="submit" className="btn-primary min-h-9 gap-2"><Search size={14} aria-hidden="true" />Search</button></div>
      </form>
      {result.items.length ? <>
        <ul className="grid gap-3 sm:grid-cols-2">{result.items.map((institution) => <li key={institution.id} className="flex flex-col rounded-2xl border border-line bg-white p-4 sm:p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><Building2 size={19} aria-hidden="true" /></span><div><h3 className="font-extrabold text-fg">{institution.name}</h3><p className="mt-1 text-xs text-muted">{[institution.short_name, institution.state].filter(Boolean).join(" · ") || "Institution"}</p></div></div><Link to={`/app/study-notes/institutions/${institution.id}`} className="btn mt-4 min-h-9 self-start gap-2 text-primary">Explore departments <ArrowRight size={14} aria-hidden="true" /></Link></li>)}</ul>
        <div className="flex items-center justify-between gap-3"><button type="button" className="btn min-h-10" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span className="text-xs text-muted">Page {page} of {totalPages}</span><button type="button" className="btn min-h-10" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
      </> : <EmptyState title="No institutions found" description={submittedSearch ? "Try a different institution name." : "Active institutions will appear here when available."} />}
    </div>
  );
}

export function StudyNotesInstitutionDetails() {
  const { institutionId = "" } = useParams();
  const query = useQuery({
    queryKey: ["study-notes", "institution", institutionId],
    queryFn: async () => {
      const [institution, departments, courses] = await Promise.all([getInstitution(institutionId), listDepartments(institutionId), listCourses()]);
      return { institution, departments, courses };
    },
    enabled: !!institutionId,
  });
  if (query.isLoading) return <LoadingState label="Loading departments" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const { institution, departments, courses } = query.data ?? { institution: null, departments: [], courses: [] };
  if (!institution) return <EmptyState title="Institution not found" description="This active institution is not available in the catalog." />;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Institution directory" title={institution.name} description="Choose a department and course to see available approved study notes." />
      {departments.length ? <ul className="grid gap-3 sm:grid-cols-2">{departments.map((department) => {
        const departmentCourses = courses.filter((course) => course.department_id === department.id);
        return <li key={department.id} className="rounded-2xl border border-line bg-white p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><h3 className="font-extrabold text-fg">{department.name}</h3><span className="text-xs text-muted">{departmentCourses.length} courses</span></div>{departmentCourses.length ? <ul className="mt-3 divide-y divide-line border-t border-line">{departmentCourses.map((course) => <li key={course.id} className="py-2"><Link to={`/app/study-notes/courses/${course.id}`} className="flex items-center justify-between gap-2 text-sm font-semibold text-primary hover:underline"><span>{course.code} · {course.title}</span><ChevronRight size={15} aria-hidden="true" /></Link></li>)}</ul> : <p className="mt-3 text-sm text-muted">No courses are listed for this department.</p>}</li>;
      })}</ul> : <EmptyState title="No departments listed" description="Departments have not yet been added for this institution." />}
    </div>
  );
}

export function StudyNotesCourses() {
  const [institutionId, setInstitutionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const institutions = useQuery({ queryKey: ["past-questions", "institutions"], queryFn: listInstitutions });
  const departments = useQuery({ queryKey: ["past-questions", "departments", institutionId], queryFn: () => listDepartments(institutionId || undefined) });
  const courses = useQuery({ queryKey: ["past-questions", "courses"], queryFn: () => listCourses() });
  const filtered = useMemo(() => {
    const departmentIds = new Set(departments.data?.map((department) => department.id) ?? []);
    const term = search.trim().toLowerCase();
    return (courses.data ?? []).filter((course) =>
      (!institutionId || departmentIds.has(course.department_id))
      && (!departmentId || course.department_id === departmentId)
      && (!term || `${course.code} ${course.title}`.toLowerCase().includes(term)),
    );
  }, [courses.data, departmentId, departments.data, institutionId, search]);
  const error = institutions.error ?? departments.error ?? courses.error;
  if (institutions.isLoading || departments.isLoading || courses.isLoading) return <LoadingState label="Loading courses" variant="panel" />;
  if (error) return <ErrorState error={error} retry={() => { void institutions.refetch(); void departments.refetch(); void courses.refetch(); }} />;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Study by subject" title="Courses" description="Choose a course to browse its approved study notes." />
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <h3 className="font-extrabold text-fg">Filter courses</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label><span className="label">Institution</span><select className="input" value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); }}><option value="">All institutions</option>{(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
          <label><span className="label">Department</span><select className="input" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label><span className="label">Search course</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Course code or title" /></label>
        </div>
      </section>
      {filtered.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((course) => <CourseCard key={course.id} course={course} />)}</ul> : <EmptyState title="No courses found" description="Try another filter or check whether courses have been added to the academic catalog." />}
    </div>
  );
}

export function StudyNotesCourseDetails() {
  const { courseId = "" } = useParams();
  const course = useQuery({ queryKey: ["study-notes", "course", courseId], queryFn: () => getCourse(courseId), enabled: !!courseId });
  const notes = useQuery({ queryKey: ["study-notes", "course-notes", courseId], queryFn: () => listStudyNotes({ courseId }), enabled: !!courseId });
  if (course.isLoading || notes.isLoading) return <LoadingState label="Loading course study notes" variant="panel" />;
  if (course.isError) return <ErrorState error={course.error} retry={() => void course.refetch()} />;
  if (notes.isError) return <ErrorState error={notes.error} retry={() => void notes.refetch()} />;
  if (!course.data) return <EmptyState title="Course not found" description="This course is unavailable or inactive in the catalog." />;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Course details" title={`${course.data.code} · ${course.data.title}`} description={`${course.data.department?.name ?? "Department unavailable"} · ${course.data.department?.institution?.name ?? "Institution unavailable"}`} />
      <section className="space-y-3">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-primary">Approved resources</p><h2 className="mt-1 text-lg font-extrabold text-fg">Study notes</h2></div>
        {notes.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{notes.data.map((note) => <StudyNoteCard key={note.id} note={note} />)}</ul> : <EmptyState title="No approved notes for this course" description="Notes will appear here after a student submits them and an administrator approves them." />}
      </section>
    </div>
  );
}

export function StudyNoteDetails() {
  const { noteId = "" } = useParams();
  const query = useQuery({ queryKey: ["study-notes", "note", noteId], queryFn: () => getStudyNote(noteId), enabled: !!noteId });
  const [documentUrl, setDocumentUrl] = useState("");
  const preview = useMutation({ mutationFn: (path: string) => createStudyNoteDownloadUrl(path), onSuccess: setDocumentUrl });
  if (query.isLoading) return <LoadingState label="Loading study-note details" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const note = query.data;
  if (!note) return <EmptyState title="Study note unavailable" description="This note may not exist, or you may not be authorized to view it." />;
  const course = note.course;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Study note" title={note.title} description={note.description} />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold uppercase tracking-wide text-primary">Course material</span><NoteStatus status={note.status} /></div>
          <h3 className="mt-4 text-lg font-extrabold text-fg">Course information</h3>
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <InfoRow label="Course" value={`${course?.code ?? "Course"} · ${course?.title ?? "Unavailable"}`} /><InfoRow label="Institution" value={course?.department?.institution?.name ?? "Institution unavailable"} /><InfoRow label="Department" value={course?.department?.name ?? "Department unavailable"} /><InfoRow label="Level" value={`${note.level} level`} /><InfoRow label="Semester" value={`${note.semester} semester`} /><InfoRow label="Submitted" value={new Date(note.created_at).toLocaleDateString()} />
            {note.status === "rejected" && note.rejection_reason && <InfoRow label="Review note" value={note.rejection_reason} />}
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {note.status === "approved" && <SaveNoteButton note={note} />}
            {note.status !== "rejected" && <button type="button" className="btn-primary min-h-10 gap-2" disabled={preview.isPending} onClick={() => preview.mutate(note.object_path)}><ArrowDownToLine size={15} aria-hidden="true" />{preview.isPending ? "Preparing secure preview…" : "Preview PDF"}</button>}
            <span className="inline-flex items-center gap-1.5 text-xs text-muted"><LockKeyhole size={14} aria-hidden="true" />Private PDF · secure link expires after 60 seconds</span>
            {preview.isError && <p role="alert" className="w-full text-sm text-danger">{preview.error.message}</p>}
            {documentUrl && <a className="text-sm font-bold text-primary underline" href={documentUrl} target="_blank" rel="noreferrer">Open PDF in a new tab</a>}
          </div>
        </div>
        <section aria-label="Study-note document preview" className="min-h-[18rem] overflow-hidden rounded-2xl border border-line bg-white">
          {documentUrl ? <iframe title={`${note.title} PDF preview`} src={documentUrl} className="h-[32rem] w-full" /> : <div className="flex min-h-[18rem] flex-col items-center justify-center p-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><FileText size={26} aria-hidden="true" /></span><h3 className="mt-4 font-extrabold text-fg">{note.status === "approved" ? "Document preview" : "Pending review"}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">{note.status === "approved" ? "Generate a short-lived secure link to preview this PDF." : "Only you and authorized reviewers can access this submission until it is approved."}</p></div>}
        </section>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-fg">{value}</dd></div>;
}

export function StudyNotesUpload() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [institutionId, setInstitutionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [level, setLevel] = useState<StudyNoteLevel | "">("");
  const [semester, setSemester] = useState<StudyNoteSemester | "">("");
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showNewDepartment, setShowNewDepartment] = useState(false);
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [catalogNotice, setCatalogNotice] = useState("");
  const institutions = useQuery({ queryKey: ["past-questions", "institutions"], queryFn: listInstitutions });
  const departments = useQuery({ queryKey: ["past-questions", "departments", institutionId], queryFn: () => listDepartments(institutionId), enabled: !!institutionId });
  const courses = useQuery({ queryKey: ["past-questions", "courses", departmentId], queryFn: () => listCourses(departmentId), enabled: !!departmentId });
  const addDepartment = useMutation({
    mutationFn: () => createDepartment({ institutionId, name: newDepartmentName.trim() }),
    onSuccess: async (department) => {
      setDepartmentId(department.id);
      setCourseId("");
      setNewDepartmentName("");
      setShowNewDepartment(false);
      setCatalogNotice(`Department "${department.name}" was added and selected.`);
      await queryClient.invalidateQueries({ queryKey: ["past-questions", "departments", institutionId] });
    },
  });
  const addCourse = useMutation({
    mutationFn: () => createCourse({ departmentId, code: newCourseCode.trim(), title: newCourseTitle.trim() }),
    onSuccess: async (course) => {
      setCourseId(course.id);
      setNewCourseCode("");
      setNewCourseTitle("");
      setShowNewCourse(false);
      setCatalogNotice(`Course ${course.code} was added and selected.`);
      await queryClient.invalidateQueries({ queryKey: ["past-questions", "courses", departmentId] });
    },
  });
  const upload = useMutation({
    mutationFn: uploadStudyNote,
    onSuccess: async () => {
      setSubmitted(true);
      setFormError("");
      setTitle("");
      setDescription("");
      setFile(null);
      setFileInputKey((key) => key + 1);
      await queryClient.invalidateQueries({ queryKey: ["study-notes"] });
    },
  });
  const error = institutions.error ?? departments.error ?? courses.error;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    setFormError("");
    if (!session?.user.id) return setFormError("Your session has expired. Sign in again to submit notes.");
    if (title.trim().length < 5 || title.trim().length > 200) return setFormError("The title must be between 5 and 200 characters.");
    if (description.trim().length < 10 || description.trim().length > 2000) return setFormError("The description must be between 10 and 2,000 characters.");
    if (!courseId) return setFormError("Select a course.");
    if (!level || !semester) return setFormError("Select a level and semester.");
    if (!file) return setFormError("Choose a PDF document to upload.");
    const fileError = validateStudyNoteFile(file);
    if (fileError) return setFormError(fileError);
    upload.mutate({ courseId, title, description, level, semester, file, userId: session.user.id });
  }
  if (error) return <ErrorState error={error} retry={() => { void institutions.refetch(); void departments.refetch(); void courses.refetch(); }} />;
  if (institutions.isLoading || (!!institutionId && departments.isLoading) || (!!departmentId && courses.isLoading)) return <LoadingState label="Loading the academic catalog" variant="panel" />;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Contribute to the repository" title="Upload study notes" description="Share your course notes. An administrator reviews each submission before it appears in the library." />
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><LockKeyhole size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><p><strong>Review required.</strong> Your submission stays private while pending. Upload one PDF up to {MAX_STUDY_NOTE_FILE_BYTES / 1024 / 1024} MB.</p></div>
      <form className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7" onSubmit={submit}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold text-fg">Note information</h3><span className="text-xs text-muted">PDF only · maximum 20 MB</span></div>
        <fieldset disabled={upload.isPending || addDepartment.isPending || addCourse.isPending} className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Note title</span><input className="input" required minLength={5} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter a clear title" /></label>
          <label><span className="label">Institution</span><select className="input" required value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); setCourseId(""); setShowNewDepartment(false); setShowNewCourse(false); setCatalogNotice(""); }}><option value="">Select an institution</option>{(institutions.data ?? []).map((institution: Institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
          <div className="space-y-2">
            <label className="block"><span className="label">Department</span><select className="input" required value={departmentId} disabled={!institutionId || departments.isLoading} onChange={(event) => { setDepartmentId(event.target.value); setCourseId(""); setShowNewCourse(false); }}><option value="">Select a department</option>{(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            {institutionId && <button type="button" className="text-xs font-bold text-primary underline" onClick={() => { setShowNewDepartment((show) => !show); setShowNewCourse(false); }}>Department not listed? Add it</button>}
            {showNewDepartment && (
              <div className="space-y-2 rounded-xl border border-[#efd9db] bg-[#fff9f8] p-3">
                <p className="text-xs leading-5 text-muted">This department will be added to the shared catalog for the selected institution.</p>
                <label className="block"><span className="label">Department name</span><input className="input" required minLength={2} maxLength={120} value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} /></label>
                {addDepartment.isError && <p role="alert" className="break-words text-xs text-danger">{addDepartment.error.message}</p>}
                <button type="button" className="btn min-h-9" disabled={newDepartmentName.trim().length < 2 || newDepartmentName.trim().length > 120 || addDepartment.isPending} onClick={() => addDepartment.mutate()}>{addDepartment.isPending ? "Adding…" : "Add department"}</button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="block"><span className="label">Course</span><select className="input" required value={courseId} disabled={!departmentId || courses.isLoading} onChange={(event) => setCourseId(event.target.value)}><option value="">Select a course</option>{(courses.data ?? []).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
            {departmentId && <button type="button" className="text-xs font-bold text-primary underline" onClick={() => setShowNewCourse((show) => !show)}>Course not listed? Add it</button>}
            {showNewCourse && (
              <div className="space-y-2 rounded-xl border border-[#efd9db] bg-[#fff9f8] p-3">
                <p className="text-xs leading-5 text-muted">Use the official course code and title. The entry becomes available to other users.</p>
                <label className="block"><span className="label">Course code</span><input className="input" required maxLength={30} value={newCourseCode} onChange={(event) => setNewCourseCode(event.target.value)} /></label>
                <label className="block"><span className="label">Course title</span><input className="input" required minLength={2} maxLength={150} value={newCourseTitle} onChange={(event) => setNewCourseTitle(event.target.value)} /></label>
                {addCourse.isError && <p role="alert" className="break-words text-xs text-danger">{addCourse.error.message}</p>}
                <button type="button" className="btn min-h-9" disabled={!newCourseCode.trim() || newCourseTitle.trim().length < 2 || addCourse.isPending} onClick={() => addCourse.mutate()}>{addCourse.isPending ? "Adding…" : "Add course"}</button>
              </div>
            )}
          </div>
          <label><span className="label">Level</span><select className="input" required value={level} onChange={(event) => setLevel(event.target.value as StudyNoteLevel | "")}><option value="">Select a level</option>{LEVELS.map((value) => <option key={value} value={value}>{value} level</option>)}</select></label>
          <label><span className="label">Semester</span><select className="input" required value={semester} onChange={(event) => setSemester(event.target.value as StudyNoteSemester | "")}><option value="">Select a semester</option>{SEMESTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="label">Description</span><textarea className="input min-h-24" required minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what students will learn from these notes" /></label>
          <label className="sm:col-span-2"><span className="label">Study notes PDF</span><input aria-label="Study notes PDF" key={fileInputKey} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-[#fff1ef] file:px-3 file:py-2 file:text-xs file:font-bold file:text-primary" type="file" accept="application/pdf,.pdf" required onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} /><span className="mt-1 block text-xs text-muted">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "PDF documents only, maximum 20 MB."}</span></label>
        </fieldset>
        {catalogNotice && <p role="status" className="mt-4 text-sm font-semibold text-[#28633a]">{catalogNotice}</p>}
        <p className="mt-3 text-xs leading-5 text-muted">New departments and courses are added to the shared academic catalog. Add only accurate, official information.</p>
        {formError && <p role="alert" className="mt-4 text-sm text-danger">{formError}</p>}
        {upload.isError && <p role="alert" className="mt-4 break-words text-sm text-danger">{upload.error.message}</p>}
        {submitted && <p role="status" className="mt-4 rounded-xl bg-[#eef8f0] p-3 text-sm font-semibold text-[#28633a]">Your notes were submitted and are pending review. Track the status in My uploads.</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-muted">Only approved notes appear in discovery.</p><button type="submit" className="btn-primary min-h-10 gap-2" disabled={upload.isPending}><Upload size={15} aria-hidden="true" />{upload.isPending ? "Submitting…" : "Submit for review"}</button></div>
      </form>
    </div>
  );
}

export function MyStudyNotes() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["study-notes", "my-uploads", session?.user.id],
    queryFn: () => listStudyNotes({ uploadedBy: session!.user.id, limit: 100 }),
    enabled: !!session?.user.id,
  });
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Your activity" title="My uploaded notes" description="See each submission's review status and any feedback from the review team." />
      {query.isLoading ? <LoadingState label="Loading your study notes" variant="panel" /> : query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : query.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{query.data.map((note) => <li key={note.id} className="rounded-2xl border border-line bg-white p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><Link to={`/app/study-notes/notes/${note.id}`} className="font-extrabold text-fg hover:text-primary">{note.title}</Link><NoteStatus status={note.status} /></div><p className="mt-2 text-sm text-muted">{note.course?.code} · {note.course?.title}</p><p className="mt-1 text-xs text-muted">Submitted {new Date(note.created_at).toLocaleDateString()} · {note.level} level · {note.semester} semester</p>{note.rejection_reason && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900"><strong>Reviewer feedback:</strong> {note.rejection_reason}</p>}</li>)}</ul> : <EmptyState title="No uploads yet" description="Submit your first set of notes to see its review status here." />}
    </div>
  );
}

export function SavedStudyNotes() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["study-notes", "saved", session?.user.id],
    queryFn: () => listSavedStudyNotes(session!.user.id),
    enabled: !!session?.user.id,
  });
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Your reading list" title="Saved notes" description="Return to approved study materials you have bookmarked." />
      {query.isLoading ? <LoadingState label="Loading saved study notes" variant="panel" /> : query.isError ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : query.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{query.data.map((note) => <StudyNoteCard key={note.id} note={note} />)}</ul> : <EmptyState title="No saved notes yet" description="Save an approved note to keep it in your reading list." />}
    </div>
  );
}
