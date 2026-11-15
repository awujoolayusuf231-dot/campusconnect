import { supabase } from "@/lib/supabase";

export const CV_TEMPLATES = [
  { id: "modern_professional", label: "Modern Professional" },
  { id: "simple_minimal", label: "Simple and Minimal" },
  { id: "graduate", label: "Graduate CV" },
  { id: "student", label: "Student CV" },
  { id: "technical", label: "Technical / Developer" },
  { id: "academic", label: "Academic CV" },
  { id: "creative", label: "Creative CV" },
  { id: "internship", label: "Internship CV" },
] as const;
export const CV_SECTION_TYPES = [
  "education", "work_experience", "internship", "projects", "technical_skills",
  "soft_skills", "certifications", "awards", "volunteer", "leadership", "languages", "references",
] as const;
export type CvTemplate = typeof CV_TEMPLATES[number]["id"];
export type CvSectionType = typeof CV_SECTION_TYPES[number];
export type CvEntry = {
  id: string;
  title: string;
  organization: string;
  date: string;
  location: string;
  description: string;
  url: string;
};
export type CvSection = { id: string; type: CvSectionType; title: string; entries: CvEntry[] };
export type CvContent = {
  full_name: string;
  email: string;
  phone: string;
  headline: string;
  location: string;
  summary: string;
  sections: CvSection[];
};
export type StudentCv = {
  id: string;
  owner_id: string;
  title: string;
  template_key: CvTemplate;
  content: CvContent;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const EMPTY_CONTENT: CvContent = {
  full_name: "",
  email: "",
  phone: "",
  headline: "",
  location: "",
  summary: "",
  sections: [],
};

export function newCvContent(): CvContent {
  return structuredClone(EMPTY_CONTENT);
}

export function newCvSection(type: CvSectionType): CvSection {
  const sectionName = CV_SECTION_TYPES.includes(type) ? type.replace(/_/g, " ") : "section";
  return {
    id: crypto.randomUUID(),
    type,
    title: sectionName.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    entries: [],
  };
}

export function newCvEntry(): CvEntry {
  return { id: crypto.randomUUID(), title: "", organization: "", date: "", location: "", description: "", url: "" };
}

export function parseCvContent(value: unknown): CvContent {
  const invalid = () => { throw new Error("This CV contains invalid saved content. It cannot be edited or printed safely."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const raw = value as Record<string, unknown>;
  const stringField = (record: Record<string, unknown>, key: string): string => {
    const field = record[key];
    if (typeof field !== "string") return invalid();
    return field;
  };
  if (!Array.isArray(raw.sections)) return invalid();
  const sections = raw.sections.map((entry): CvSection => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return invalid();
    const section = entry as Record<string, unknown>;
    const type = stringField(section, "type");
    if (!CV_SECTION_TYPES.includes(type as CvSectionType) || !Array.isArray(section.entries)) return invalid();
    const entries = section.entries.map((row): CvEntry => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return invalid();
      const item = row as Record<string, unknown>;
      return {
        id: stringField(item, "id"),
        title: stringField(item, "title"),
        organization: stringField(item, "organization"),
        date: stringField(item, "date"),
        location: stringField(item, "location"),
        description: stringField(item, "description"),
        url: stringField(item, "url"),
      };
    });
    return {
      id: stringField(section, "id"),
      type: type as CvSectionType,
      title: stringField(section, "title"),
      entries,
    };
  });
  return {
    full_name: stringField(raw, "full_name"),
    email: stringField(raw, "email"),
    phone: stringField(raw, "phone"),
    headline: stringField(raw, "headline"),
    location: stringField(raw, "location"),
    summary: stringField(raw, "summary"),
    sections,
  };
}

export function validateCv(title: string, template: string, content: CvContent): string | null {
  if (title.trim().length < 1 || title.trim().length > 100) return "CV title must be between 1 and 100 characters.";
  if (!CV_TEMPLATES.some((item) => item.id === template)) return "Choose a supported CV template.";
  for (const [label, value, max] of [
    ["Name", content.full_name, 100],
    ["Email", content.email, 254],
    ["Phone", content.phone, 40],
    ["Headline", content.headline, 120],
    ["Location", content.location, 100],
    ["Summary", content.summary, 2000],
  ] as const) {
    if (value.length > max) return `${label} must be ${max} characters or fewer.`;
  }
  if (content.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.email)) return "Enter a valid contact email.";
  if (content.sections.length > CV_SECTION_TYPES.length) return "Remove an extra section before saving.";
  for (const section of content.sections) {
    if (!CV_SECTION_TYPES.includes(section.type)) return "A CV section type is not supported.";
    if (!section.title.trim() || section.title.length > 80) return "Each section needs a title of up to 80 characters.";
    if (section.entries.length > 30) return "Each section can have up to 30 entries.";
    for (const entry of section.entries) {
      if (entry.title.length > 120 || entry.organization.length > 120 || entry.date.length > 80
        || entry.location.length > 100 || entry.description.length > 2000 || entry.url.length > 300) {
        return "One of the CV entries is too long.";
      }
      if (entry.url && !isHttpsUrl(entry.url)) return "CV links must use HTTPS.";
    }
  }
  if (new TextEncoder().encode(JSON.stringify(content)).length > 180000) return "This CV is too large to save. Remove some details or entries.";
  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function listMyCvs(): Promise<StudentCv[]> {
  const { data, error } = await supabase.from("student_cvs").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, content: parseCvContent(row.content) })) as StudentCv[];
}

export async function getCv(id: string): Promise<StudentCv | null> {
  const { data, error } = await supabase.from("student_cvs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, content: parseCvContent(data.content) } as StudentCv : null;
}

export async function saveCv(
  input: { title: string; template_key: string; content: CvContent; is_default: boolean },
  id?: string,
): Promise<string> {
  const issue = validateCv(input.title, input.template_key, input.content);
  if (issue) throw new Error(issue);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to save your CV.");
  const payload = {
    title: input.title.trim(),
    template_key: input.template_key,
    content: input.content,
    is_default: input.is_default,
  };
  if (id) {
    const { data, error } = await supabase.from("student_cvs").update(payload).eq("id", id).select("id").single();
    if (error) throw error;
    return data.id as string;
  }
  const { data, error } = await supabase.from("student_cvs")
    .insert({ ...payload, owner_id: userData.user.id }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function setDefaultCv(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_default_student_cv", { p_cv_id: id });
  if (error) throw error;
}

export async function duplicateCv(cv: StudentCv): Promise<string> {
  return saveCv({
    title: `${cv.title} (copy)`.slice(0, 100),
    template_key: cv.template_key,
    content: { ...cv.content, sections: cv.content.sections.map((section) => ({
      ...section,
      id: crypto.randomUUID(),
      entries: section.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })),
    })) },
    is_default: false,
  });
}

export async function deleteCv(id: string): Promise<void> {
  const { data, error } = await supabase.from("student_cvs").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("cv_not_found");
}

export async function getCvImportData(): Promise<{
  content: CvContent;
  profile: {
    display_name: string;
    bio: string | null;
    faculty: string | null;
    department: string | null;
    academic_level: string | null;
    graduation_year: number | null;
    location: string | null;
    website_url: string | null;
  };
}> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to import your profile.");
  const { data, error } = await supabase.from("profiles")
    .select("display_name,bio,faculty,department,academic_level,graduation_year,location,website_url")
    .eq("id", userData.user.id).single();
  if (error) throw error;
  const profile = data as {
    display_name: string; bio: string | null; faculty: string | null; department: string | null;
    academic_level: string | null; graduation_year: number | null; location: string | null; website_url: string | null;
  };
  const educationParts = [profile.department, profile.faculty, profile.academic_level].filter(Boolean).join(" · ");
  const sections = profile.department || profile.graduation_year
    ? [{
      ...newCvSection("education"),
      entries: [{
        ...newCvEntry(),
        title: educationParts,
        organization: "",
        date: profile.graduation_year ? String(profile.graduation_year) : "",
      }],
    }]
    : [];
  return {
    profile,
    content: {
      ...EMPTY_CONTENT,
      full_name: profile.display_name,
      email: userData.user.email ?? "",
      location: profile.location ?? "",
      summary: profile.bio ?? "",
      sections,
    },
  };
}
