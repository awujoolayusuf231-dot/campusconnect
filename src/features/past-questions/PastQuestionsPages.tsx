import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Building2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileText,
  GraduationCap,
  Info,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import { useAuth } from "@/features/auth/AuthProvider";
import { useMyPermissions } from "@/features/admin/useMyPermissions";
import {
  createResourceDownloadUrl,
  createCourse,
  createDepartment,
  getCourse,
  getInstitution,
  getResource,
  importCatalogRows,
  listCourses,
  listDepartments,
  listInstitutionPage,
  listInstitutions,
  listResources,
  MAX_PAST_QUESTION_FILE_BYTES,
  reviewResource,
  uploadResource,
  validatePastQuestionFile,
  type Course,
  type CatalogImportRow,
  type Department,
  type Institution,
  type PastQuestionResource,
} from "./api";
import { normalizeCatalogName, parseCatalogCsv, type CatalogCsvRow } from "./catalogCsv";

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
            {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
            {item.to ? <Link to={item.to} className="rounded px-1 py-1 hover:text-primary hover:underline">{item.label}</Link> : <span aria-current="page" className="px-1 py-1 text-fg">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return (
    <section role="alert" className="rounded-2xl border border-red-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <h2 className="font-extrabold text-fg">Could not load Past Questions</h2>
          <p className="mt-1 break-words text-sm text-muted">{message}</p>
          <p className="mt-2 text-xs text-muted">If this is the first setup, review and apply the Past Questions migration before retrying.</p>
          {retry && <button type="button" className="btn mt-3 min-h-9" onClick={retry}>Try again</button>}
        </div>
      </div>
    </section>
  );
}

function catalogMutationError(error: unknown, item: string): string {
  const message = error instanceof Error ? error.message : "The catalog entry could not be added.";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  if (code === "23505") return `That ${item} already exists. Select the existing catalog entry instead.`;
  if (/row-level security|permission denied/i.test(message)) {
    return `Supabase blocked this ${item}. Apply the student catalog insert policy migration before trying again.`;
  }
  return message;
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

function ResourceCard({ resource, showStatus = false }: { resource: PastQuestionResource; showStatus?: boolean }) {
  const course = resource.course;
  const institution = course?.department?.institution?.name;
  return (
    <li>
      <Link to={`/app/past-questions/questions/${resource.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><FileText size={19} aria-hidden="true" /></span>
          {showStatus && <StatusBadge status={resource.status} />}
        </div>
        <h3 className="mt-4 font-extrabold leading-6 text-fg group-hover:text-primary">{resource.title}</h3>
        <p className="mt-1 text-xs font-semibold text-muted">{course?.code} · {course?.title}</p>
        <p className="mt-1 text-xs text-muted">{institution}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs text-muted">
          <span className="rounded-full bg-bg px-2.5 py-1">{resource.exam_year}</span>
          <span className="rounded-full bg-bg px-2.5 py-1">{semesterLabel(resource.semester)}</span>
          <span className="rounded-full bg-bg px-2.5 py-1">{resource.academic_session}</span>
        </div>
        <span className="mt-4 inline-flex min-h-9 items-center gap-1.5 border-t border-line pt-3 text-xs font-extrabold text-primary">
          View resource <ArrowRight size={14} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function StatusBadge({ status }: { status: PastQuestionResource["status"] }) {
  const styles = status === "approved" ? "bg-[#eef8f0] text-[#28633a]" : status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900";
  return <span className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${styles}`}>{status === "pending" ? "Pending review" : status}</span>;
}

function semesterLabel(semester: PastQuestionResource["semester"]) {
  if (semester === "first") return "First semester";
  if (semester === "second") return "Second semester";
  if (semester === "other") return "Other semester";
  return "Semester not specified";
}

function getCourseInstitution(course?: Course | null) {
  return course?.department?.institution?.name ?? "Institution unavailable";
}

export function PastQuestionsHome() {
  const [search, setSearch] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const institutions = useQuery({ queryKey: ["past-questions", "institutions"], queryFn: listInstitutions });
  const resources = useQuery({
    queryKey: ["past-questions", "home", institutionId, submittedSearch],
    queryFn: () => listResources({ institutionId: institutionId || undefined, search: submittedSearch, limit: 6 }),
  });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSubmittedSearch(search.trim());
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] md:grid-cols-[minmax(0,1.3fr)_minmax(15rem,0.7fr)] md:items-center sm:p-7">
        <div>
          <span className="inline-flex w-fit items-center rounded-full border border-[#efd9db] bg-[#fff4f2] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">Academic resources</span>
          <h2 className="mt-3 max-w-xl text-2xl font-black tracking-[-0.035em] text-fg sm:text-3xl">Find the right past paper for your next study session.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">Browse approved examination resources by institution, department, or course.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/app/past-questions/institutions" className="btn-primary min-h-11 gap-2 rounded-xl px-4 font-bold"><Building2 size={16} aria-hidden="true" />Browse institutions</Link>
            <Link to="/app/past-questions/courses" className="btn min-h-11 gap-2 rounded-xl px-4 font-bold"><GraduationCap size={16} aria-hidden="true" />Browse courses</Link>
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[#741923] via-[#a52432] to-[#df7a80] p-5 text-white sm:p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10"><BookOpen size={22} aria-hidden="true" /></span>
          <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/75">CampusConnect study space</p>
          <p className="mt-1 text-xl font-black">A clearer way to prepare.</p>
          <p className="mt-2 text-sm leading-6 text-white/80">Submissions are reviewed before they are listed in the library.</p>
        </div>
      </section>

      <form className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5" onSubmit={submitSearch} aria-label="Search the library">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-fg">Search the library</h2><span className="text-xs font-semibold text-muted">Approved resources</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
          <label className="relative">
            <span className="sr-only">Search past questions</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input className="input min-h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, course code, or subject" />
          </label>
          <select className="input min-h-11" value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} aria-label="Filter by institution">
            <option value="">All institutions</option>
            {(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
          </select>
          <button type="submit" className="btn-primary min-h-11 gap-2 rounded-xl px-5 font-bold"><Search size={15} aria-hidden="true" />Search</button>
        </div>
        {institutions.isError && <p role="alert" className="mt-2 text-xs text-danger">{institutions.error.message}</p>}
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-primary">Recently added</p><h2 className="mt-1 text-lg font-extrabold text-fg">Past questions</h2></div>
          <Link to="/app/past-questions/courses" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary hover:bg-[#fff4f2]">Browse courses <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {resources.isLoading ? <LoadingState label="Loading past questions" variant="panel" /> : resources.isError ? <ErrorState error={resources.error} retry={() => void resources.refetch()} /> : resources.data?.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{resources.data.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</ul> : <EmptyState title="No approved past questions found" description="Try another search or institution, or check back after resources have been reviewed." />}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { icon: Building2, title: "Browse institutions", body: "Find courses and resources from your institution.", to: "/app/past-questions/institutions", action: "View institutions" },
          { icon: GraduationCap, title: "Explore courses", body: "Browse academic departments and course resources.", to: "/app/past-questions/courses", action: "Explore courses" },
          { icon: ClipboardList, title: "Your resources", body: "Follow the review status of your submissions.", to: "/app/past-questions/my-resources", action: "View my resources" },
        ].map((item) => <article key={item.title} className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.025)] sm:p-5">
          <item.icon size={19} className="text-primary" aria-hidden="true" />
          <h3 className="mt-3 font-extrabold text-fg">{item.title}</h3>
          <p className="mt-1 text-sm leading-5 text-muted">{item.body}</p>
          <Link to={item.to} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary hover:underline">{item.action} <ArrowRight size={13} aria-hidden="true" /></Link>
        </article>)}
      </section>
    </div>
  );
}

export function InstitutionBrowser() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const query = useQuery({
    queryKey: ["past-questions", "institutions", submittedSearch, page],
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
      <PageTitle eyebrow="Discover resources" title="Browse institutions" description="Choose an institution to explore its academic departments and courses." />
      <form className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5" onSubmit={submitSearch} aria-label="Search institutions">
        <label className="block"><span className="label">Search institutions</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Enter an institution name" /></label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-xs text-muted">{result.total} active {result.total === 1 ? "institution" : "institutions"} · page {page} of {totalPages}</p>
          <button type="submit" className="btn-primary min-h-9 gap-2"><Search size={14} aria-hidden="true" />Search</button>
        </div>
      </form>
      {result.items.length ? <>
        <ul className="grid gap-4 md:grid-cols-2">{result.items.map((institution) => <InstitutionCard key={institution.id} institution={institution} />)}</ul>
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn min-h-10" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span className="text-xs text-muted">Page {page} of {totalPages}</span>
          <button type="button" className="btn min-h-10" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </> : <EmptyState title="No institutions found" description={submittedSearch ? "Try a different institution name." : "Active institutions will appear here when available in CampusConnect."} />}
    </div>
  );
}

function InstitutionCard({ institution }: { institution: Institution }) {
  return (
    <li className="flex h-full flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><Building2 size={23} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-fg">{institution.name}</h3>
          <p className="mt-1 text-xs text-muted">{[institution.short_name, institution.state].filter(Boolean).join(" · ") || "Institution"}</p>
        </div>
      </div>
      <Link to={`/app/past-questions/institutions/${institution.id}`} className="btn mt-5 min-h-10 gap-2 self-start font-bold text-primary">Browse institution <ArrowRight size={15} aria-hidden="true" /></Link>
    </li>
  );
}

export function InstitutionDetailsPage() {
  const { institutionId = "" } = useParams();
  const query = useQuery({
    queryKey: ["past-questions", "institution", institutionId],
    queryFn: async () => {
      const [institution, departments, courses] = await Promise.all([
        getInstitution(institutionId),
        listDepartments(institutionId),
        listCourses(),
      ]);
      return { institution, departments, courses };
    },
    enabled: !!institutionId,
  });
  if (query.isLoading) return <LoadingState label="Loading institution resources" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const { institution, departments, courses } = query.data ?? { institution: null, departments: [], courses: [] };
  if (!institution) return <EmptyState title="Institution not found" description="This institution is unavailable or inactive." />;

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Past Questions", to: "/app/past-questions" }, { label: "Institutions", to: "/app/past-questions/institutions" }, { label: institution.name }]} />
      <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
        <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><Building2 size={23} aria-hidden="true" /></span><div><h2 className="text-xl font-black text-fg">{institution.name}</h2><p className="mt-1 text-sm text-muted">{[institution.short_name, institution.state].filter(Boolean).join(" · ")}</p></div></div>
      </section>
      <section className="space-y-3">
        <PageTitle eyebrow="Institution directory" title="Departments" description="Select a department to browse its courses and approved past questions." />
        {departments.length ? <ul className="grid gap-3 sm:grid-cols-2">
          {departments.map((department) => <DepartmentCard key={department.id} department={department} courses={courses.filter((course) => course.department_id === department.id)} />)}
        </ul> : <EmptyState title="No departments listed" description="Departments for this institution have not been added yet." />}
      </section>
    </div>
  );
}

function DepartmentCard({ department, courses }: { department: Department; courses: Course[] }) {
  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.025)] sm:p-5">
      <div className="flex items-start justify-between gap-2"><h3 className="font-extrabold text-fg">{department.name}</h3><span className="text-xs text-muted">{courses.length} courses</span></div>
      {courses.length ? <ul className="mt-3 divide-y divide-line border-t border-line">
        {courses.map((course) => <li key={course.id} className="py-2"><Link to={`/app/past-questions/courses/${course.id}`} className="flex items-center justify-between gap-2 text-sm font-semibold text-primary hover:underline"><span>{course.code} · {course.title}</span><ChevronRight size={15} aria-hidden="true" /></Link></li>)}
      </ul> : <p className="mt-3 text-sm text-muted">No courses listed for this department.</p>}
    </li>
  );
}

export function CourseBrowser() {
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
  const busy = institutions.isLoading || departments.isLoading || courses.isLoading;
  const error = institutions.error ?? departments.error ?? courses.error;
  if (busy) return <LoadingState label="Loading departments and courses" variant="panel" />;
  if (error) return <ErrorState error={error} retry={() => { void institutions.refetch(); void departments.refetch(); void courses.refetch(); }} />;

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Study by subject" title="Departments and courses" description="Browse academic courses from the active institution catalog." />
      <section className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
        <h2 className="font-extrabold text-fg">Course filters</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label><span className="label">Institution</span><select className="input" value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); }}><option value="">All institutions</option>{(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
          <label><span className="label">Department</span><select className="input" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label><span className="label">Search courses</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Course code or title" /></label>
        </div>
      </section>
      {filtered.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((course) => <CourseCard key={course.id} course={course} />)}</ul> : <EmptyState title="No courses found" description="Try another filter or check whether courses have been added to the academic catalog." />}
    </div>
  );
}

export function CatalogManagementPage() {
  const permissions = useMyPermissions();
  const queryClient = useQueryClient();
  const canManage = permissions.data?.includes("past_questions.manage") ?? false;
  const [institutionId, setInstitutionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [csvRows, setCsvRows] = useState<CatalogCsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvParseError, setCsvParseError] = useState("");
  const institutions = useQuery({
    queryKey: ["past-questions", "institutions"],
    queryFn: listInstitutions,
    enabled: canManage,
    refetchOnMount: "always",
  });
  const departments = useQuery({
    queryKey: ["past-questions", "departments", institutionId],
    queryFn: () => listDepartments(institutionId),
    enabled: canManage && !!institutionId,
    refetchOnMount: "always",
  });
  const courses = useQuery({
    queryKey: ["past-questions", "courses", departmentId],
    queryFn: () => listCourses(departmentId),
    enabled: canManage && !!departmentId,
    refetchOnMount: "always",
  });
  const addDepartment = useMutation({
    mutationFn: (name: string) => createDepartment({ institutionId, name }),
    onSuccess: async (department) => {
      setDepartmentName("");
      setDepartmentId(department.id);
      await queryClient.invalidateQueries({ queryKey: ["past-questions"] });
    },
  });
  const addCourse = useMutation({
    mutationFn: () => createCourse({ departmentId, code: courseCode, title: courseTitle }),
    onSuccess: async () => {
      setCourseCode("");
      setCourseTitle("");
      await queryClient.invalidateQueries({ queryKey: ["past-questions"] });
    },
  });
  const csvImport = useMutation({
    mutationFn: (rows: CatalogImportRow[]) => importCatalogRows(rows),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["past-questions"] });
    },
  });
  const institutionLookup = useMemo(() => {
    const lookup = new Map<string, Institution[]>();
    for (const institution of institutions.data ?? []) {
      const key = normalizeCatalogName(institution.name);
      lookup.set(key, [...(lookup.get(key) ?? []), institution]);
    }
    return lookup;
  }, [institutions.data]);
  const csvResolution = useMemo(() => csvRows.map((row) => {
    const matches = institutionLookup.get(normalizeCatalogName(row.institution)) ?? [];
    return {
      row,
      institution: matches.length === 1 ? matches[0] : null,
      error: matches.length === 0
        ? `CSV row ${row.rowNumber}: no active institution matches "${row.institution}".`
        : matches.length > 1
          ? `CSV row ${row.rowNumber}: "${row.institution}" matches multiple institutions; use an exact unique institution name.`
          : "",
    };
  }), [csvRows, institutionLookup]);
  const csvMappingErrors = csvResolution.filter((entry) => entry.error).map((entry) => entry.error);
  const resolvedCsvRows = csvResolution.flatMap(({ row, institution }): CatalogImportRow[] => institution
    ? [{ rowNumber: row.rowNumber, institutionId: institution.id, department: row.department, courseCode: row.courseCode, courseTitle: row.courseTitle }]
    : []);

  if (permissions.isLoading) return <LoadingState label="Checking catalog permissions" variant="panel" />;
  if (permissions.isError) return <ErrorState error={permissions.error} retry={() => void permissions.refetch()} />;
  if (!canManage) return <EmptyState title="Catalog management access required" description="Only authorized administrators can add departments and courses. Ask a CampusConnect administrator to grant the past_questions.manage permission." />;

  const queryError = institutions.error ?? departments.error ?? courses.error;
  if (queryError) return <ErrorState error={queryError} retry={() => { void institutions.refetch(); void departments.refetch(); void courses.refetch(); }} />;

  function submitDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addDepartment.mutate(departmentName.trim());
  }

  function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addCourse.mutate();
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setCsvFileName(file?.name ?? "");
    setCsvRows([]);
    setCsvParseError("");
    csvImport.reset();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvParseError("Choose a .csv file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCsvParseError("The CSV must be 5 MB or smaller.");
      return;
    }
    try {
      setCsvRows(parseCatalogCsv(await file.text()));
    } catch (error) {
      setCsvParseError(error instanceof Error ? error.message : "The CSV could not be read.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle eyebrow="Administrator tools" title="Academic catalog" description="Add real departments and courses to the selected institution. New entries will appear in browsing and upload forms." />
        <button type="button" className="btn min-h-9 gap-2" onClick={() => { void Promise.all([institutions.refetch(), departments.refetch(), courses.refetch()]); }}>
          <RefreshCw size={14} aria-hidden="true" />Refresh catalog
        </button>
      </div>
      <div role="note" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        Departments and courses students add while uploading are saved directly to this shared catalog. Select their institution and department to see them, or refresh if the page was already open. Institutions themselves are managed by authorized staff.
      </div>
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>Catalog changes are restricted by your Supabase <code>past_questions.manage</code> permission. Use official institution department names and course codes.</p>
      </div>
      <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
        <div>
          <h3 className="font-extrabold text-fg">Import catalog from CSV</h3>
          <p className="mt-1 text-sm leading-6 text-muted">Upload a CSV with one course per row. Required headers: <code>institution,department,course_code,course_title</code>. Institution names must match the active CampusConnect institution list. Existing course codes are skipped; nothing is overwritten.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            className="btn min-h-10"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent("institution,department,course_code,course_title\r\n")}`}
            download="campusconnect-academic-catalog-template.csv"
          >
            Download blank CSV template
          </a>
          <label className="min-w-0 flex-1">
            <span className="label">CSV file</span>
            <input className="input" type="file" accept=".csv,text/csv" onChange={(event) => void handleCsvFileChange(event)} disabled={institutions.isLoading || csvImport.isPending} />
          </label>
        </div>
        {csvFileName && <p className="text-xs text-muted">Selected: {csvFileName}</p>}
        {csvParseError && <p role="alert" className="text-sm text-danger">{csvParseError}</p>}
        {csvRows.length > 0 && (
          <>
            <p className="text-sm font-semibold text-fg">{csvRows.length} course rows read · {resolvedCsvRows.length} ready to import</p>
            {csvMappingErrors.length > 0 && <div role="alert" className="max-h-32 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-danger">{csvMappingErrors.slice(0, 20).map((error) => <p key={error}>{error}</p>)}{csvMappingErrors.length > 20 && <p>And {csvMappingErrors.length - 20} more rows need correction.</p>}</div>}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-bg text-muted"><tr><th className="px-3 py-2">Institution</th><th className="px-3 py-2">Department</th><th className="px-3 py-2">Course code</th><th className="px-3 py-2">Course title</th></tr></thead>
                <tbody className="divide-y divide-line">{csvRows.slice(0, 8).map((row) => <tr key={row.rowNumber}><td className="px-3 py-2">{row.institution}</td><td className="px-3 py-2">{row.department}</td><td className="px-3 py-2">{row.courseCode}</td><td className="px-3 py-2">{row.courseTitle}</td></tr>)}</tbody>
              </table>
            </div>
            {csvRows.length > 8 && <p className="text-xs text-muted">Showing the first 8 rows.</p>}
            <button type="button" className="btn-primary min-h-10" disabled={!resolvedCsvRows.length || csvMappingErrors.length > 0 || csvImport.isPending} onClick={() => csvImport.mutate(resolvedCsvRows)}>
              {csvImport.isPending ? "Importing catalog…" : `Import ${resolvedCsvRows.length} course rows`}
            </button>
          </>
        )}
        {csvImport.isError && <p role="alert" className="break-words text-sm text-danger">{csvImport.error.message}</p>}
        {csvImport.data && (
          <div role={csvImport.data.errors.length ? "alert" : "status"} className={`space-y-1 rounded-xl p-3 text-sm ${csvImport.data.errors.length ? "border border-amber-200 bg-amber-50 text-amber-950" : "bg-[#eef8f0] text-[#28633a]"}`}>
            <p>Import complete: {csvImport.data.departmentsCreated} departments added, {csvImport.data.coursesCreated} courses added, {csvImport.data.duplicatesSkipped} existing or repeated course rows skipped.</p>
            {csvImport.data.errors.slice(0, 20).map((error) => <p key={error}>{error}</p>)}
            {csvImport.data.errors.length > 20 && <p>And {csvImport.data.errors.length - 20} more rows could not be imported.</p>}
          </div>
        )}
      </section>
      <label className="block rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
        <span className="label">Institution</span>
        <select
          className="input"
          value={institutionId}
          disabled={institutions.isLoading}
          onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); }}
        >
          <option value="">Select an institution</option>
          {(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
        </select>
      </label>
      {institutions.isLoading && <LoadingState label="Loading institutions" variant="panel" />}
      {institutionId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
            <div>
              <h3 className="font-extrabold text-fg">Departments</h3>
              <p className="mt-1 text-sm text-muted">Add a department, then select it to manage its courses.</p>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitDepartment}>
              <label className="min-w-0 flex-1"><span className="sr-only">Department name</span><input className="input" required minLength={2} maxLength={120} value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="e.g. Computer Science" /></label>
              <button type="submit" className="btn-primary min-h-10 shrink-0 gap-2" disabled={addDepartment.isPending || departments.isLoading}><Plus size={15} aria-hidden="true" />{addDepartment.isPending ? "Adding…" : "Add department"}</button>
            </form>
            {addDepartment.isError && <p role="alert" className="break-words text-sm text-danger">{catalogMutationError(addDepartment.error, "department")}</p>}
            {addDepartment.isSuccess && <p role="status" className="text-sm font-semibold text-[#28633a]">Department added.</p>}
            {departments.isLoading ? <LoadingState label="Loading departments" variant="panel" /> : departments.data?.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {departments.data.map((department) => (
                  <li key={department.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-fg">{department.name}</span>
                    <button type="button" className={`btn min-h-9 shrink-0 ${department.id === departmentId ? "border-primary text-primary" : ""}`} onClick={() => setDepartmentId(department.id)}>{department.id === departmentId ? "Selected" : "Manage courses"}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">No departments yet. Add the first department above.</p>}
          </section>
          <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
            <div>
              <h3 className="font-extrabold text-fg">{departments.data?.find((department) => department.id === departmentId)?.name ?? "Courses"}</h3>
              <p className="mt-1 text-sm text-muted">Add official course codes and titles for the selected department.</p>
            </div>
            <form className="space-y-3" onSubmit={submitCourse}>
              <label className="block"><span className="label">Course code</span><input className="input" required maxLength={30} value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="e.g. CSC 101" disabled={!departmentId} /></label>
              <label className="block"><span className="label">Course title</span><input className="input" required minLength={2} maxLength={150} value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} placeholder="e.g. Introduction to Computing" disabled={!departmentId} /></label>
              <button type="submit" className="btn-primary min-h-10 gap-2" disabled={!departmentId || addCourse.isPending || courses.isLoading}><Plus size={15} aria-hidden="true" />{addCourse.isPending ? "Adding…" : "Add course"}</button>
            </form>
            {addCourse.isError && <p role="alert" className="break-words text-sm text-danger">{catalogMutationError(addCourse.error, "course")}</p>}
            {addCourse.isSuccess && <p role="status" className="text-sm font-semibold text-[#28633a]">Course added.</p>}
            {!departmentId ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">Select a department to view or add courses.</p> : courses.isLoading ? <LoadingState label="Loading courses" variant="panel" /> : courses.data?.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {courses.data.map((course) => <li key={course.id} className="py-3"><p className="text-sm font-extrabold text-fg">{course.code}</p><p className="mt-0.5 text-sm text-muted">{course.title}</p></li>)}
              </ul>
            ) : <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">No courses yet. Add the first course above.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <li>
      <Link to={`/app/past-questions/courses/${course.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
        <span className="w-fit rounded-lg bg-[#fff1ef] px-2.5 py-1 text-xs font-black text-primary">{course.code}</span>
        <h3 className="mt-4 font-extrabold leading-6 text-fg group-hover:text-primary">{course.title}</h3>
        <p className="mt-1 text-sm text-muted">{course.department?.name} · {getCourseInstitution(course)}</p>
        <span className="mt-4 inline-flex min-h-9 items-center justify-between gap-2 border-t border-line pt-3 text-xs font-extrabold text-primary">View course <ArrowRight size={13} aria-hidden="true" /></span>
      </Link>
    </li>
  );
}

export function CourseDetailsPage() {
  const { courseId = "" } = useParams();
  const courseQuery = useQuery({ queryKey: ["past-questions", "course", courseId], queryFn: () => getCourse(courseId), enabled: !!courseId });
  const resources = useQuery({ queryKey: ["past-questions", "course-resources", courseId], queryFn: () => listResources({ courseId }), enabled: !!courseId });
  if (courseQuery.isLoading || resources.isLoading) return <LoadingState label="Loading course resources" variant="panel" />;
  if (courseQuery.isError) return <ErrorState error={courseQuery.error} retry={() => void courseQuery.refetch()} />;
  if (resources.isError) return <ErrorState error={resources.error} retry={() => void resources.refetch()} />;
  const course = courseQuery.data;
  if (!course) return <EmptyState title="Course not found" description="This course is unavailable or inactive." />;

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Past Questions", to: "/app/past-questions" }, { label: "Courses", to: "/app/past-questions/courses" }, { label: course.code }]} />
      <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
        <p className="text-sm font-black text-primary">{course.code}</p><h2 className="mt-1 text-2xl font-black tracking-tight text-fg">{course.title}</h2><p className="mt-2 text-sm text-muted">{course.department?.name} · {getCourseInstitution(course)}</p>
        <dl className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <InfoRow label="Institution" value={getCourseInstitution(course)} /><InfoRow label="Department" value={course.department?.name ?? "Department unavailable"} /><InfoRow label="Approved resources" value={`${resources.data?.length ?? 0}`} />
        </dl>
      </section>
      <section className="space-y-3">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-primary">Course resources</p><h2 className="mt-1 text-lg font-extrabold text-fg">Past questions</h2></div>
        {resources.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{resources.data.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</ul> : <EmptyState title="No approved papers for this course" description="Approved resources will appear here after they are submitted and reviewed." />}
      </section>
    </div>
  );
}

export function QuestionDetailsPage() {
  const { questionId = "" } = useParams();
  const query = useQuery({ queryKey: ["past-questions", "resource", questionId], queryFn: () => getResource(questionId), enabled: !!questionId });
  const [downloadError, setDownloadError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const download = useMutation({
    mutationFn: (path: string) => createResourceDownloadUrl(path),
    onSuccess: (url) => { setDownloadUrl(url); setDownloadError(""); },
    onError: (error) => { setDownloadError(error instanceof Error ? error.message : "The document is unavailable."); },
  });
  if (query.isLoading) return <LoadingState label="Loading document details" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const resource = query.data;
  if (!resource) return <EmptyState title="Resource unavailable" description="This resource may not exist, or you may not be authorized to view it." />;
  const course = resource.course;
  const courseLink = course ? `/app/past-questions/courses/${course.id}` : "/app/past-questions/courses";

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Past Questions", to: "/app/past-questions" }, { label: "Courses", to: "/app/past-questions/courses" }, { label: course?.code ?? "Course", to: courseLink }, { label: "Document details" }]} />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold uppercase tracking-wide text-primary">Past question</span><StatusBadge status={resource.status} /></div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-fg">{resource.title}</h2>
          <Link to={courseLink} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">{course?.code} · {course?.title} <ArrowRight size={14} aria-hidden="true" /></Link>
          <dl className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <InfoRow label="Institution" value={getCourseInstitution(course)} /><InfoRow label="Department" value={course?.department?.name ?? "Department unavailable"} />
            <InfoRow label="Exam year" value={String(resource.exam_year)} /><InfoRow label="Academic session" value={resource.academic_session} />
            <InfoRow label="Semester" value={semesterLabel(resource.semester)} /><InfoRow label="Uploaded" value={new Date(resource.created_at).toLocaleDateString()} />
            {resource.status === "rejected" && resource.rejection_reason && <InfoRow label="Review note" value={resource.rejection_reason} />}
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button type="button" className="btn-primary min-h-10 gap-2" disabled={download.isPending} onClick={() => download.mutate(resource.object_path)}><ArrowDownToLine size={15} aria-hidden="true" />{download.isPending ? "Preparing secure link…" : "Get secure document link"}</button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted"><LockKeyhole size={14} aria-hidden="true" />Private PDF · link expires after 60 seconds</span>
            {downloadError && <p role="alert" className="w-full text-sm text-danger">{downloadError}</p>}
            {downloadUrl && <a className="w-full text-sm font-bold text-primary underline" href={downloadUrl} target="_blank" rel="noreferrer">Open PDF</a>}
          </div>
        </div>
        <section aria-label="Secure document access" className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e6cdcf] bg-white p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><FileText size={26} aria-hidden="true" /></span>
          <h3 className="mt-4 font-extrabold text-fg">Private document</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">The PDF is served from a private bucket. Access is checked by Supabase Storage policies before a short-lived link is created.</p>
        </section>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-fg">{value}</dd></div>;
}

export function UploadPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [institutionId, setInstitutionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
    mutationFn: (input: Parameters<typeof uploadResource>[0]) => uploadResource(input),
    onSuccess: async () => {
      setSubmitted(true);
      setFormError("");
      setFile(null);
      setFileInputKey((key) => key + 1);
      await queryClient.invalidateQueries({ queryKey: ["past-questions"] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    setFormError("");
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const academicSession = String(data.get("academicSession") ?? "").trim();
    const examYear = Number(data.get("examYear"));
    const semester = String(data.get("semester") ?? "");
    if (!session?.user.id) return setFormError("Your session has expired. Sign in again to submit a resource.");
    if (!file) return setFormError("Choose a PDF document to upload.");
    const fileError = validatePastQuestionFile(file);
    if (fileError) return setFormError(fileError);
    if (title.length < 5 || title.length > 200) return setFormError("The title must be between 5 and 200 characters.");
    if (academicSession.length < 4 || academicSession.length > 20) return setFormError("Enter an academic session between 4 and 20 characters.");
    if (!Number.isInteger(examYear) || examYear < 1950 || examYear > 2100) return setFormError("Enter a valid exam year between 1950 and 2100.");
    if (!courseId) return setFormError("Select a course.");
    if (!["first", "second", "other", ""].includes(semester)) return setFormError("Select a valid semester.");
    upload.mutate({ courseId, title, academicSession, examYear, semester: semester ? semester as PastQuestionResource["semester"] : null, file, userId: session.user.id });
  }

  const formBusy = institutions.isLoading || (!!institutionId && departments.isLoading) || (!!departmentId && courses.isLoading);
  const formQueryError = institutions.error ?? departments.error ?? courses.error;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Contribute to the library" title="Upload past questions" description="Submit a PDF examination resource for review. It will become visible in the library only after approval." />
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p><strong>Review required.</strong> Submissions are private while pending. Upload a PDF up to {MAX_PAST_QUESTION_FILE_BYTES / 1024 / 1024} MB.</p>
      </div>
      {formQueryError && <ErrorState error={formQueryError} retry={() => { void institutions.refetch(); void departments.refetch(); void courses.refetch(); }} />}
      <form className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7" onSubmit={handleSubmit}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold text-fg">Resource information</h3><span className="text-xs text-muted">PDF only · maximum 20 MB</span></div>
        <fieldset disabled={upload.isPending || addDepartment.isPending || addCourse.isPending} className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Document title</span><input name="title" className="input" required minLength={5} maxLength={200} placeholder="e.g. Introduction to Biology examination" /></label>
          <label><span className="label">Institution</span><select className="input" required disabled={institutions.isLoading || upload.isPending} value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); setCourseId(""); setShowNewDepartment(false); setShowNewCourse(false); setCatalogNotice(""); }}><option value="">Select an institution</option>{(institutions.data ?? []).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
          <div className="space-y-2">
            <label className="block"><span className="label">Department</span><select className="input" required value={departmentId} disabled={!institutionId || departments.isLoading || upload.isPending} onChange={(event) => { setDepartmentId(event.target.value); setCourseId(""); setShowNewCourse(false); }}><option value="">Select a department</option>{(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            {institutionId && <button type="button" className="text-xs font-bold text-primary underline" onClick={() => { setShowNewDepartment((show) => !show); setShowNewCourse(false); }}>Department not listed? Add it</button>}
            {showNewDepartment && (
              <div className="space-y-2 rounded-xl border border-[#efd9db] bg-[#fff9f8] p-3">
                <p className="text-xs leading-5 text-muted">This department will be added to the shared catalog for the selected institution.</p>
                <label className="block"><span className="label">Department name</span><input className="input" required minLength={2} maxLength={120} value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} /></label>
                {addDepartment.isError && <p role="alert" className="break-words text-xs text-danger">{catalogMutationError(addDepartment.error, "department")}</p>}
                <button type="button" className="btn min-h-9" disabled={newDepartmentName.trim().length < 2 || newDepartmentName.trim().length > 120 || addDepartment.isPending} onClick={() => addDepartment.mutate()}>{addDepartment.isPending ? "Adding…" : "Add department"}</button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="block"><span className="label">Course</span><select className="input" required value={courseId} disabled={!departmentId || courses.isLoading || upload.isPending} onChange={(event) => setCourseId(event.target.value)}><option value="">Select a course</option>{(courses.data ?? []).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
            {departmentId && <button type="button" className="text-xs font-bold text-primary underline" onClick={() => setShowNewCourse((show) => !show)}>Course not listed? Add it</button>}
            {showNewCourse && (
              <div className="space-y-2 rounded-xl border border-[#efd9db] bg-[#fff9f8] p-3">
                <p className="text-xs leading-5 text-muted">Use the official course code and title. The entry becomes available to other users.</p>
                <label className="block"><span className="label">Course code</span><input className="input" required maxLength={30} value={newCourseCode} onChange={(event) => setNewCourseCode(event.target.value)} /></label>
                <label className="block"><span className="label">Course title</span><input className="input" required minLength={2} maxLength={150} value={newCourseTitle} onChange={(event) => setNewCourseTitle(event.target.value)} /></label>
                {addCourse.isError && <p role="alert" className="break-words text-xs text-danger">{catalogMutationError(addCourse.error, "course")}</p>}
                <button type="button" className="btn min-h-9" disabled={!newCourseCode.trim() || newCourseTitle.trim().length < 2 || addCourse.isPending} onClick={() => addCourse.mutate()}>{addCourse.isPending ? "Adding…" : "Add course"}</button>
              </div>
            )}
          </div>
          <label><span className="label">Academic session</span><input name="academicSession" className="input" required minLength={4} maxLength={20} placeholder="e.g. 2024/2025" /></label>
          <label><span className="label">Exam year</span><input name="examYear" className="input" type="number" required min={1950} max={2100} step={1} placeholder="2025" /></label>
          <label><span className="label">Semester</span><select name="semester" className="input" defaultValue=""><option value="">Not specified</option><option value="first">First semester</option><option value="second">Second semester</option><option value="other">Other</option></select></label>
          <label className="sm:col-span-2"><span className="label">Examination document (PDF)</span><input key={fileInputKey} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-[#fff1ef] file:px-3 file:py-2 file:text-xs file:font-bold file:text-primary" type="file" accept="application/pdf,.pdf" required onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSubmitted(false); }} /></label>
        </fieldset>
        {catalogNotice && <p role="status" className="mt-4 text-sm font-semibold text-[#28633a]">{catalogNotice}</p>}
        <p className="mt-4 text-xs leading-5 text-muted">Departments and courses you add become shared catalog entries. Add only accurate, official information; other students can use these entries too.</p>
        {formError && <p role="alert" className="mt-4 text-sm text-danger">{formError}</p>}
        {upload.isError && <p role="alert" className="mt-4 break-words text-sm text-danger">{upload.error.message}</p>}
        {submitted && <p role="status" className="mt-4 rounded-xl bg-[#eef8f0] p-3 text-sm font-semibold text-[#28633a]">Your resource was submitted and is pending review. You can track it in My Resources.</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">Only approved resources are listed publicly to signed-in users.</p>
          <button type="submit" className="btn-primary min-h-10 gap-2" disabled={upload.isPending || formBusy}><Upload size={15} aria-hidden="true" />{upload.isPending ? "Submitting…" : "Submit for review"}</button>
        </div>
      </form>
    </div>
  );
}

export function MyResourcesPage() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["past-questions", "my-resources", session?.user.id],
    queryFn: () => listResources({ uploadedBy: session!.user.id }),
    enabled: !!session?.user.id,
  });
  if (query.isLoading) return <LoadingState label="Loading your submissions" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Your library activity" title="My uploaded resources" description="Track the review status of resources submitted from your account." />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><ClipboardList size={19} aria-hidden="true" /></span><div><h3 className="font-extrabold">Submission history</h3><p className="text-xs text-muted">{query.data?.length ?? 0} {(query.data?.length ?? 0) === 1 ? "resource" : "resources"} submitted by you</p></div></div>
      </section>
      {query.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{query.data.map((resource) => <ResourceCard key={resource.id} resource={resource} showStatus />)}</ul> : <EmptyState title="No uploaded resources yet" description="Use Upload to submit a past question for review." />}
      {query.data?.some((resource) => resource.status === "rejected" && resource.rejection_reason) && <section className="space-y-2">{query.data.filter((resource) => resource.status === "rejected" && resource.rejection_reason).map((resource) => <p key={resource.id} className="rounded-xl border border-red-200 bg-white p-3 text-sm"><strong>{resource.title}:</strong> {resource.rejection_reason}</p>)}</section>}
    </div>
  );
}

function ReviewQueueItem({ resource }: { resource: PastQuestionResource }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");
  const mutation = useMutation({
    mutationFn: (decision: "approved" | "rejected") => reviewResource(resource.id, decision, reason),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["past-questions"] }); },
  });
  function reject() {
    if (reason.trim().length < 5) {
      setValidationError("Provide a review note of at least 5 characters.");
      return;
    }
    setValidationError("");
    mutation.mutate("rejected");
  }
  const course = resource.course;
  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-extrabold text-fg">{resource.title}</h3><p className="mt-1 text-xs text-muted">{course?.code} · {course?.title} · {resource.academic_session}</p><p className="mt-1 text-xs text-muted">Exam year {resource.exam_year} · Submitted {new Date(resource.created_at).toLocaleDateString()}</p></div><StatusBadge status={resource.status} /></div>
      <label className="mt-4 block"><span className="label">Rejection note (required to reject)</span><textarea className="input min-h-20" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what needs correction" /></label>
      {validationError && <p role="alert" className="mt-2 text-xs text-danger">{validationError}</p>}
      {mutation.isError && <p role="alert" className="mt-2 break-words text-xs text-danger">{mutation.error.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary min-h-9" disabled={mutation.isPending} onClick={() => mutation.mutate("approved")}>Approve</button>
        <button type="button" className="btn min-h-9" disabled={mutation.isPending} onClick={reject}>Reject</button>
        <Link to={`/app/past-questions/questions/${resource.id}`} className="btn min-h-9">Review details</Link>
      </div>
    </li>
  );
}

export function ResourceManagementPage() {
  const permissions = useMyPermissions();
  const canReview = permissions.data?.includes("past_questions.review") ?? false;
  const query = useQuery({
    queryKey: ["past-questions", "management", "pending"],
    queryFn: () => listResources({ status: "pending" }),
    enabled: canReview,
  });
  if (permissions.isLoading) return <LoadingState label="Checking review permissions" variant="panel" />;
  if (permissions.isError) return <ErrorState error={permissions.error} retry={() => void permissions.refetch()} />;
  if (!canReview) return <EmptyState title="Review access required" description="Only authorized CampusConnect moderators and administrators can review submissions." />;
  if (query.isLoading) return <LoadingState label="Loading review queue" variant="panel" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Staff interface" title="Resource management" description="Review submissions before they are published to the student library." />
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><p>Approval and rejection are checked again by Supabase. Approved documents are available only to signed-in users.</p></div>
      <section className="grid gap-3 sm:grid-cols-3">
        {[["Pending review", query.data?.length ?? 0], ["Reviewer access", "Authorized staff"], ["File access", "Private PDF"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-line bg-white p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 text-lg font-black text-fg">{value}</p></div>)}
      </section>
      {query.data?.length ? <ul className="space-y-3">{query.data.map((resource) => <ReviewQueueItem key={resource.id} resource={resource} />)}</ul> : <EmptyState title="No submissions awaiting review" description="New student submissions will appear here." />}
    </div>
  );
}
