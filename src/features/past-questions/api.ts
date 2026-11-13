import { supabase } from "@/lib/supabase";

export const PAST_QUESTIONS_BUCKET = "past-questions";
export const MAX_PAST_QUESTION_FILE_BYTES = 20 * 1024 * 1024;
const RESOURCE_SELECT =
  "id,title,academic_session,exam_year,semester,status,created_at,uploaded_by,reviewed_by,rejection_reason,object_path,course_id,course:academic_courses!past_question_resources_course_id_fkey(id,code,title,department:academic_departments!academic_courses_department_id_fkey(id,name,institution:institutions!academic_departments_institution_id_fkey(id,name)))";

export type Institution = {
  id: string;
  name: string;
  short_name: string | null;
  state: string | null;
};

export type InstitutionPage = {
  items: Institution[];
  total: number;
};

export type Department = {
  id: string;
  institution_id: string;
  name: string;
};

export type Course = {
  id: string;
  department_id: string;
  code: string;
  title: string;
  department?: (Department & { institution?: Institution | null }) | null;
};

type Relation<T> = T | T[] | null;
type DepartmentRow = Department & { institution: Relation<Institution> };
type CourseRow = Omit<Course, "department"> & { department: Relation<DepartmentRow> };

export type PastQuestionResource = {
  id: string;
  title: string;
  academic_session: string;
  exam_year: number;
  semester: "first" | "second" | "other" | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  uploaded_by: string;
  reviewed_by: string | null;
  rejection_reason: string | null;
  object_path: string;
  course_id: string;
  course?: Course | null;
};

type ResourceRow = Omit<PastQuestionResource, "course"> & { course: Relation<CourseRow> };

export type UploadResourceInput = {
  courseId: string;
  title: string;
  academicSession: string;
  examYear: number;
  semester: PastQuestionResource["semester"];
  file: File;
  userId: string;
};

export function validatePastQuestionFile(file: File): string | null {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return "Choose a PDF document.";
  }
  if (file.size <= 0 || file.size > MAX_PAST_QUESTION_FILE_BYTES) {
    return "The PDF must be smaller than 20 MB.";
  }
  return null;
}

export async function listInstitutions(): Promise<Institution[]> {
  const { data, error } = await supabase
    .from("institutions")
    .select("id,name,short_name,state")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Institution[];
}

export async function listInstitutionPage(search: string, offset: number, pageSize: number): Promise<InstitutionPage> {
  let query = supabase
    .from("institutions")
    .select("id,name,short_name,state", { count: "exact" })
    .eq("is_active", true)
    .order("name")
    .range(offset, offset + pageSize - 1);
  const term = search.trim().slice(0, 100);
  if (term) query = query.ilike("name", `%${term.replace(/[%_]/g, "\\$&")}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { items: (data ?? []) as Institution[], total: count ?? 0 };
}

export async function getInstitution(id: string): Promise<Institution | null> {
  const { data, error } = await supabase
    .from("institutions")
    .select("id,name,short_name,state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Institution | null;
}

export async function listDepartments(institutionId?: string): Promise<Department[]> {
  let query = supabase
    .from("academic_departments")
    .select("id,institution_id,name")
    .eq("is_active", true)
    .order("name");
  if (institutionId) query = query.eq("institution_id", institutionId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function createDepartment(input: { institutionId: string; name: string }): Promise<Department> {
  const { data, error } = await supabase
    .from("academic_departments")
    .insert({ institution_id: input.institutionId, name: input.name.trim() })
    .select("id,institution_id,name")
    .single();
  if (error) throw error;
  return data as Department;
}

export async function listCourses(departmentId?: string): Promise<Course[]> {
  let query = supabase
    .from("academic_courses")
    .select("id,department_id,code,title,department:academic_departments!academic_courses_department_id_fkey(id,institution_id,name,institution:institutions!academic_departments_institution_id_fkey(id,name,short_name,state))")
    .eq("is_active", true)
    .order("code");
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CourseRow[]).map(normalizeCourse);
}

export async function createCourse(input: { departmentId: string; code: string; title: string }): Promise<Course> {
  const { data, error } = await supabase
    .from("academic_courses")
    .insert({ department_id: input.departmentId, code: input.code.trim(), title: input.title.trim() })
    .select("id,department_id,code,title")
    .single();
  if (error) throw error;
  return data as Course;
}

export type CatalogImportRow = {
  rowNumber: number;
  institutionId: string;
  department: string;
  courseCode: string;
  courseTitle: string;
};

export type CatalogImportSummary = {
  departmentsCreated: number;
  coursesCreated: number;
  duplicatesSkipped: number;
  errors: string[];
};

type CatalogDepartmentRow = Department & { is_active: boolean };
type CatalogCourseRow = Course & { is_active: boolean };

export async function importCatalogRows(rows: CatalogImportRow[]): Promise<CatalogImportSummary> {
  if (!rows.length) throw new Error("Choose a CSV with at least one valid course row.");

  const summary: CatalogImportSummary = { departmentsCreated: 0, coursesCreated: 0, duplicatesSkipped: 0, errors: [] };
  const institutionIds = Array.from(new Set(rows.map((row) => row.institutionId)));
  const { data: existingDepartments, error: departmentsError } = await supabase
    .from("academic_departments")
    .select("id,institution_id,name,is_active")
    .in("institution_id", institutionIds);
  if (departmentsError) throw departmentsError;

  const departmentKey = (institutionId: string, name: string) => `${institutionId}:${name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")}`;
  const departmentIds = new Map<string, string>();
  const inactiveDepartmentKeys = new Set<string>();
  for (const department of (existingDepartments ?? []) as CatalogDepartmentRow[]) {
    const key = departmentKey(department.institution_id, department.name);
    if (department.is_active) departmentIds.set(key, department.id);
    else inactiveDepartmentKeys.add(key);
  }

  const departmentsToCreate = new Map<string, { institution_id: string; name: string }>();
  for (const row of rows) {
    const key = departmentKey(row.institutionId, row.department);
    if (departmentIds.has(key)) continue;
    if (inactiveDepartmentKeys.has(key)) {
      summary.errors.push(`CSV row ${row.rowNumber}: "${row.department}" already exists but is inactive.`);
      continue;
    }
    if (!departmentsToCreate.has(key)) {
      departmentsToCreate.set(key, { institution_id: row.institutionId, name: row.department.trim() });
    }
  }

  const departmentEntries = Array.from(departmentsToCreate.entries());
  for (let offset = 0; offset < departmentEntries.length; offset += 200) {
    const chunk = departmentEntries.slice(offset, offset + 200);
    const { data, error } = await supabase
      .from("academic_departments")
      .insert(chunk.map(([, department]) => department))
      .select("id,institution_id,name");
    if (!error) {
      for (const department of data ?? []) {
        departmentIds.set(departmentKey(department.institution_id, department.name), department.id);
      }
      summary.departmentsCreated += data?.length ?? 0;
      continue;
    }

    for (const [key, department] of chunk) {
      const { data: inserted, error: insertError } = await supabase
        .from("academic_departments")
        .insert(department)
        .select("id,institution_id,name")
        .single();
      if (!insertError) {
        departmentIds.set(key, inserted.id);
        summary.departmentsCreated += 1;
        continue;
      }
      if (insertError.code === "23505") {
        const { data: matches, error: lookupError } = await supabase
          .from("academic_departments")
          .select("id,institution_id,name,is_active")
          .eq("institution_id", department.institution_id);
        if (lookupError) throw lookupError;
        const match = ((matches ?? []) as CatalogDepartmentRow[]).find((candidate) =>
          departmentKey(candidate.institution_id, candidate.name) === key,
        );
        if (match?.is_active) departmentIds.set(key, match.id);
        else summary.errors.push(`Department "${department.name}" could not be added: ${insertError.message}`);
      } else {
        summary.errors.push(`Department "${department.name}" could not be added: ${insertError.message}`);
      }
    }
  }

  const activeDepartmentIds = Array.from(new Set(departmentIds.values()));
  const existingCourses = new Map<string, boolean>();
  if (activeDepartmentIds.length) {
    const { data, error } = await supabase
      .from("academic_courses")
      .select("id,department_id,code,title,is_active")
      .in("department_id", activeDepartmentIds);
    if (error) throw error;
    for (const course of (data ?? []) as CatalogCourseRow[]) {
      existingCourses.set(`${course.department_id}:${course.code.trim().toLocaleLowerCase("en-US")}`, course.is_active);
    }
  }

  const pendingCourses: { rowNumber: number; department_id: string; code: string; title: string }[] = [];
  const seenCourseKeys = new Set<string>();
  for (const row of rows) {
    const depKey = departmentKey(row.institutionId, row.department);
    const departmentId = departmentIds.get(depKey);
    if (!departmentId) {
      if (!inactiveDepartmentKeys.has(depKey)) summary.errors.push(`CSV row ${row.rowNumber}: department "${row.department}" could not be created.`);
      continue;
    }
    const key = `${departmentId}:${row.courseCode.trim().toLocaleLowerCase("en-US")}`;
    if (seenCourseKeys.has(key)) {
      summary.duplicatesSkipped += 1;
      continue;
    }
    seenCourseKeys.add(key);
    if (existingCourses.has(key)) {
      if (existingCourses.get(key)) summary.duplicatesSkipped += 1;
      else summary.errors.push(`CSV row ${row.rowNumber}: course code "${row.courseCode}" already exists but is inactive.`);
      continue;
    }
    pendingCourses.push({
      rowNumber: row.rowNumber,
      department_id: departmentId,
      code: row.courseCode.trim(),
      title: row.courseTitle.trim(),
    });
  }

  for (let offset = 0; offset < pendingCourses.length; offset += 200) {
    const chunk = pendingCourses.slice(offset, offset + 200);
    const { error } = await supabase
      .from("academic_courses")
      .insert(chunk.map(({ department_id, code, title }) => ({ department_id, code, title })))
      .select("id");
    if (!error) {
      summary.coursesCreated += chunk.length;
      continue;
    }

    for (const course of chunk) {
      const { error: insertError } = await supabase
        .from("academic_courses")
        .insert({ department_id: course.department_id, code: course.code, title: course.title });
      if (!insertError) summary.coursesCreated += 1;
      else if (insertError.code === "23505") summary.duplicatesSkipped += 1;
      else summary.errors.push(`CSV row ${course.rowNumber}: course ${course.code} could not be added: ${insertError.message}`);
    }
  }

  return summary;
}

export async function getCourse(id: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from("academic_courses")
    .select("id,department_id,code,title,department:academic_departments!academic_courses_department_id_fkey(id,institution_id,name,institution:institutions!academic_departments_institution_id_fkey(id,name,short_name,state))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeCourse(data as CourseRow) : null;
}

export async function listResources(options: {
  status?: PastQuestionResource["status"];
  courseId?: string;
  institutionId?: string;
  uploadedBy?: string;
  search?: string;
  limit?: number;
} = {}): Promise<PastQuestionResource[]> {
  const { institutionId, search, ...filters } = options;
  const status = filters.status ?? (filters.uploadedBy ? undefined : "approved");
  let courseIds: string[] | undefined;

  if (institutionId) {
    const departments = await listDepartments(institutionId);
    if (!departments.length) return [];
    const courses = await listCoursesForDepartments(departments.map((department) => department.id));
    if (!courses.length) return [];
    courseIds = courses.map((course) => course.id);
  }

  let matchingCourseIds: string[] | undefined;
  const term = search?.trim().slice(0, 100);
  if (term) {
    const courses = await findCourses(term, courseIds);
    matchingCourseIds = courses.map((course) => course.id);
  }

  const requestedCourseIds = filters.courseId
    ? [filters.courseId]
    : matchingCourseIds?.length
      ? matchingCourseIds
      : courseIds;
  const titleMatches = term
    ? await queryResources({ ...filters, status, courseIds, titleTerm: term, limit: undefined })
    : [];
  const courseMatches = term && matchingCourseIds?.length
    ? await queryResources({ ...filters, status, courseIds: requestedCourseIds, limit: undefined })
    : [];
  const rows = term
    ? mergeResources(titleMatches, courseMatches)
    : await queryResources({ ...filters, status, courseIds: requestedCourseIds });

  return typeof options.limit === "number" ? rows.slice(0, options.limit) : rows;
}

export async function getResource(id: string): Promise<PastQuestionResource | null> {
  const { data, error } = await supabase
    .from("past_question_resources")
    .select(RESOURCE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeResource(data as ResourceRow) : null;
}

async function listCoursesForDepartments(departmentIds: string[]): Promise<Course[]> {
  const { data, error } = await supabase
    .from("academic_courses")
    .select("id,department_id,code,title")
    .eq("is_active", true)
    .in("department_id", departmentIds);
  if (error) throw error;
  return (data ?? []) as Course[];
}

async function findCourses(term: string, departmentCourseIds?: string[]): Promise<Course[]> {
  const pattern = `%${term.replace(/[%_]/g, "\\$&")}%`;
  const [byCode, byTitle] = await Promise.all([
    supabase.from("academic_courses").select("id,department_id,code,title").eq("is_active", true).ilike("code", pattern),
    supabase.from("academic_courses").select("id,department_id,code,title").eq("is_active", true).ilike("title", pattern),
  ]);
  if (byCode.error) throw byCode.error;
  if (byTitle.error) throw byTitle.error;
  const matching = mergeById((byCode.data ?? []) as Course[], (byTitle.data ?? []) as Course[]);
  return departmentCourseIds
    ? matching.filter((course) => departmentCourseIds.includes(course.id))
    : matching;
}

async function queryResources(options: {
  status?: PastQuestionResource["status"];
  courseId?: string;
  courseIds?: string[];
  uploadedBy?: string;
  titleTerm?: string;
  limit?: number;
}): Promise<PastQuestionResource[]> {
  if (options.courseIds && options.courseIds.length === 0) return [];
  let query = supabase.from("past_question_resources").select(RESOURCE_SELECT).order("created_at", { ascending: false });
  if (options.status) query = query.eq("status", options.status);
  if (options.courseId) query = query.eq("course_id", options.courseId);
  if (options.courseIds) query = query.in("course_id", options.courseIds);
  if (options.uploadedBy) query = query.eq("uploaded_by", options.uploadedBy);
  if (options.titleTerm) query = query.ilike("title", `%${options.titleTerm.replace(/[%_]/g, "\\$&")}%`);
  if (typeof options.limit === "number") query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ResourceRow[]).map(normalizeResource);
}

function mergeById<T extends { id: string }>(...groups: T[][]): T[] {
  return Array.from(new Map(groups.flat().map((row) => [row.id, row])).values());
}

function first<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeCourse(row: CourseRow): Course {
  const department = first(row.department);
  return {
    ...row,
    department: department
      ? { ...department, institution: first(department.institution) }
      : null,
  };
}

function normalizeResource(row: ResourceRow): PastQuestionResource {
  const course = first(row.course);
  return {
    ...row,
    course: course ? normalizeCourse(course) : null,
  };
}

function mergeResources(...groups: PastQuestionResource[][]): PastQuestionResource[] {
  return mergeById(...groups).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function uploadResource(input: UploadResourceInput): Promise<void> {
  const validationError = validatePastQuestionFile(input.file);
  if (validationError) throw new Error(validationError);

  const objectPath = `${input.userId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(PAST_QUESTIONS_BUCKET)
    .upload(objectPath, input.file, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("past_question_resources").insert({
    course_id: input.courseId,
    title: input.title.trim(),
    academic_session: input.academicSession.trim(),
    exam_year: input.examYear,
    semester: input.semester,
    object_path: objectPath,
    uploaded_by: input.userId,
  });
  if (!insertError) return;

  const { error: cleanupError } = await supabase.storage.from(PAST_QUESTIONS_BUCKET).remove([objectPath]);
  if (cleanupError) {
    throw new Error(`Could not save submission (${insertError.message}); uploaded file cleanup also failed (${cleanupError.message}).`);
  }
  throw insertError;
}

export async function createResourceDownloadUrl(objectPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PAST_QUESTIONS_BUCKET)
    .createSignedUrl(objectPath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewResource(
  resourceId: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("review_past_question", {
    p_resource_id: resourceId,
    p_decision: decision,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}
