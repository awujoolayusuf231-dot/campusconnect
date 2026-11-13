import { supabase } from "@/lib/supabase";
import { listCourses, type Course, type Department, type Institution } from "@/features/past-questions/api";

export const STUDY_NOTES_BUCKET = "study-notes";
export const MAX_STUDY_NOTE_FILE_BYTES = 20 * 1024 * 1024;
const NOTE_SELECT =
  "id,title,description,course_id,level,semester,status,created_at,uploaded_by,reviewed_by,rejection_reason,object_path,course:academic_courses!study_notes_course_id_fkey(id,department_id,code,title,department:academic_departments!academic_courses_department_id_fkey(id,institution_id,name,institution:institutions!academic_departments_institution_id_fkey(id,name,short_name,state)))";

export type StudyNoteStatus = "pending" | "approved" | "rejected";
export type StudyNoteLevel = "100" | "200" | "300" | "400" | "500" | "600" | "700";
export type StudyNoteSemester = "first" | "second" | "other";

export type StudyNote = {
  id: string;
  title: string;
  description: string;
  course_id: string;
  level: StudyNoteLevel;
  semester: StudyNoteSemester;
  status: StudyNoteStatus;
  created_at: string;
  uploaded_by: string;
  reviewed_by: string | null;
  rejection_reason: string | null;
  object_path: string;
  course: Course | null;
};

type Relation<T> = T | T[] | null;
type NoteDepartmentRow = Department & { institution: Relation<Institution> };
type NoteCourseRow = Omit<Course, "department"> & {
  department: Relation<NoteDepartmentRow>;
};
type StudyNoteRow = Omit<StudyNote, "course"> & { course: Relation<NoteCourseRow> };
type NoteQueryOptions = {
  status?: StudyNoteStatus;
  courseId?: string;
  courseIds?: string[];
  uploadedBy?: string;
  level?: StudyNoteLevel;
  semester?: StudyNoteSemester;
  titleTerm?: string;
  limit?: number;
};

export type UploadStudyNoteInput = {
  courseId: string;
  title: string;
  description: string;
  level: StudyNoteLevel;
  semester: StudyNoteSemester;
  file: File;
  userId: string;
};

export function validateStudyNoteFile(file: File): string | null {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return "Choose a PDF document.";
  }
  if (file.size <= 0 || file.size > MAX_STUDY_NOTE_FILE_BYTES) {
    return "The PDF must be smaller than 20 MB.";
  }
  return null;
}

export async function listStudyNotes(options: {
  status?: StudyNoteStatus;
  courseId?: string;
  institutionId?: string;
  departmentId?: string;
  uploadedBy?: string;
  level?: StudyNoteLevel;
  semester?: StudyNoteSemester;
  search?: string;
  limit?: number;
} = {}): Promise<StudyNote[]> {
  const status = options.status ?? (options.uploadedBy ? undefined : "approved");
  let scopedCourseIds: string[] | undefined;

  if (options.institutionId || options.departmentId) {
    const courses = await listCourses(options.departmentId);
    scopedCourseIds = courses
      .filter((course) => !options.institutionId || course.department?.institution?.id === options.institutionId)
      .map((course) => course.id);
    if (!scopedCourseIds.length) return [];
  }

  const term = options.search?.trim().slice(0, 100);
  if (!term) {
    return queryStudyNotes({
      status,
      courseId: options.courseId,
      courseIds: scopedCourseIds,
      uploadedBy: options.uploadedBy,
      level: options.level,
      semester: options.semester,
      limit: options.limit,
    });
  }

  const courses = await listCourses(options.departmentId);
  const matchingCourseIds = courses
    .filter((course) =>
      (!options.institutionId || course.department?.institution?.id === options.institutionId)
      && `${course.code} ${course.title}`.toLowerCase().includes(term.toLowerCase()),
    )
    .map((course) => course.id)
    .filter((id) => !options.courseId || id === options.courseId);
  const [titleMatches, courseMatches] = await Promise.all([
    queryStudyNotes({
      status,
      courseId: options.courseId,
      courseIds: scopedCourseIds,
      uploadedBy: options.uploadedBy,
      level: options.level,
      semester: options.semester,
      titleTerm: term,
    }),
    matchingCourseIds.length
      ? queryStudyNotes({
        status,
        courseId: options.courseId,
        courseIds: matchingCourseIds,
        uploadedBy: options.uploadedBy,
        level: options.level,
        semester: options.semester,
      })
      : Promise.resolve([]),
  ]);
  const rows = mergeStudyNotes(titleMatches, courseMatches);
  return typeof options.limit === "number" ? rows.slice(0, options.limit) : rows;
}

export async function getStudyNote(id: string): Promise<StudyNote | null> {
  const { data, error } = await supabase
    .from("study_notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeStudyNote(data as StudyNoteRow) : null;
}

async function queryStudyNotes(options: NoteQueryOptions): Promise<StudyNote[]> {
  if (options.courseIds && options.courseIds.length === 0) return [];
  let query = supabase.from("study_notes").select(NOTE_SELECT).order("created_at", { ascending: false });
  if (options.status) query = query.eq("status", options.status);
  if (options.courseId) query = query.eq("course_id", options.courseId);
  if (options.courseIds) query = query.in("course_id", options.courseIds);
  if (options.uploadedBy) query = query.eq("uploaded_by", options.uploadedBy);
  if (options.level) query = query.eq("level", options.level);
  if (options.semester) query = query.eq("semester", options.semester);
  if (options.titleTerm) query = query.ilike("title", `%${options.titleTerm.replace(/[%_]/g, "\\$&")}%`);
  if (typeof options.limit === "number") query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as StudyNoteRow[]).map(normalizeStudyNote);
}

export async function listSavedStudyNotes(userId: string): Promise<StudyNote[]> {
  const { data, error } = await supabase
    .from("study_note_saves")
    .select(`study_note_id,created_at,note:study_notes!study_note_saves_study_note_id_fkey(${NOTE_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as { note: Relation<StudyNoteRow> }[])
    .flatMap((row) => {
      const note = first(row.note);
      return note ? [normalizeStudyNote(note)] : [];
    });
}

export async function isStudyNoteSaved(noteId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("study_note_saves")
    .select("study_note_id")
    .eq("study_note_id", noteId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function setStudyNoteSaved(noteId: string, userId: string, saved: boolean): Promise<void> {
  const request = saved
    ? supabase.from("study_note_saves").upsert(
      { study_note_id: noteId, user_id: userId },
      { onConflict: "study_note_id,user_id", ignoreDuplicates: true },
    )
    : supabase.from("study_note_saves").delete().eq("study_note_id", noteId).eq("user_id", userId);
  const { error } = await request;
  if (error) throw error;
}

export async function uploadStudyNote(input: UploadStudyNoteInput): Promise<void> {
  const validationError = validateStudyNoteFile(input.file);
  if (validationError) throw new Error(validationError);

  const objectPath = `${input.userId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(STUDY_NOTES_BUCKET)
    .upload(objectPath, input.file, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("study_notes").insert({
    course_id: input.courseId,
    title: input.title.trim(),
    description: input.description.trim(),
    level: input.level,
    semester: input.semester,
    object_path: objectPath,
    uploaded_by: input.userId,
  });
  if (!insertError) return;

  const { error: cleanupError } = await supabase.storage.from(STUDY_NOTES_BUCKET).remove([objectPath]);
  if (cleanupError) {
    throw new Error(`Could not save submission (${insertError.message}); uploaded file cleanup also failed (${cleanupError.message}).`);
  }
  throw insertError;
}

export async function createStudyNoteDownloadUrl(objectPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STUDY_NOTES_BUCKET)
    .createSignedUrl(objectPath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewStudyNote(
  noteId: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("review_study_note", {
    p_note_id: noteId,
    p_decision: decision,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}

function first<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeStudyNote(row: StudyNoteRow): StudyNote {
  const course = first(row.course);
  if (!course) return { ...row, course: null };
  const department = first(course.department);
  return {
    ...row,
    course: {
      ...course,
      department: department
        ? { ...department, institution: first(department.institution) }
        : null,
    },
  };
}

function mergeStudyNotes(...groups: StudyNote[][]): StudyNote[] {
  return Array.from(new Map(groups.flat().map((note) => [note.id, note])).values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
