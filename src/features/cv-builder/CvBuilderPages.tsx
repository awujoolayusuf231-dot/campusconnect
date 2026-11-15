import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, FileDown, Plus, Printer, Trash2 } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import {
  CV_SECTION_TYPES,
  CV_TEMPLATES,
  deleteCv,
  duplicateCv,
  getCv,
  getCvImportData,
  listMyCvs,
  newCvContent,
  newCvEntry,
  newCvSection,
  saveCv,
  setDefaultCv,
  type CvContent,
  type CvEntry,
  type CvSection,
  type CvSectionType,
  type StudentCv,
} from "@/features/cv-builder/api";
import "./cvPrint.css";

const CV_QUERY = ["student-cvs"];
const SECTION_LABELS: Record<CvSectionType, string> = {
  education: "Education",
  work_experience: "Work experience",
  internship: "Internship",
  projects: "Projects",
  technical_skills: "Technical skills",
  soft_skills: "Soft skills",
  certifications: "Certifications",
  awards: "Awards",
  volunteer: "Volunteering",
  leadership: "Leadership",
  languages: "Languages",
  references: "References",
};

function templateName(key: string) {
  return CV_TEMPLATES.find((template) => template.id === key)?.label ?? "Modern Professional";
}

export function CvDashboardPage() {
  const queryClient = useQueryClient();
  const cvs = useQuery({ queryKey: CV_QUERY, queryFn: listMyCvs });
  const [deleteTarget, setDeleteTarget] = useState<StudentCv | null>(null);
  const [message, setMessage] = useState("");
  const remove = useMutation({
    mutationFn: (id: string) => deleteCv(id),
    onSuccess: async () => { setDeleteTarget(null); await queryClient.invalidateQueries({ queryKey: CV_QUERY }); },
    onError: (error: Error) => setMessage(error.message),
  });
  const makeDefault = useMutation({
    mutationFn: setDefaultCv,
    onSuccess: async () => { setMessage("Default CV updated."); await queryClient.invalidateQueries({ queryKey: CV_QUERY }); },
    onError: (error: Error) => setMessage(error.message),
  });
  const copy = useMutation({
    mutationFn: duplicateCv,
    onSuccess: async () => { setMessage("A copy of your CV was created."); await queryClient.invalidateQueries({ queryKey: CV_QUERY }); },
    onError: (error: Error) => setMessage(error.message),
  });
  if (cvs.isLoading) return <LoadingState label="Loading your CVs" variant="panel" />;
  if (cvs.isError) return <p role="alert" className="err">Could not load your CVs: {(cvs.error as Error).message}</p>;
  const savedCvs = cvs.data ?? [];
  return <div className="space-y-5">
    <header className="rounded-3xl border border-[#eadbd8] bg-gradient-to-br from-white via-[#fff9f7] to-[#f8ecea] p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">A clear story of your experience</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">Student CV builder</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Create tailored, private CVs from a professional template. Import your profile only when you choose, and print or save a PDF from your browser.</p></div>
        <Link className="btn-primary inline-flex items-center gap-2" to="/app/cv-builder/new"><Plus size={16} />Create a CV</Link>
      </div>
    </header>
    {message && <p role="status" className={message.includes("could not") || message.includes("failed") ? "err" : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"}>{message}</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {CV_TEMPLATES.map((template, index) => <article key={template.id} className="rounded-2xl border border-line bg-white p-3 shadow-sm">
        <div className={`mb-3 flex h-24 items-center justify-center rounded-xl ${index % 2 ? "bg-[#f7f4f2]" : "bg-[#fbf0ee]"}`}>
          <div className="w-24 rounded bg-white p-2 shadow-sm"><div className={`h-1 w-12 rounded ${index % 2 ? "bg-slate-500" : "bg-primary"}`} /><div className="mt-2 h-1 w-16 rounded bg-slate-200" /><div className="mt-2 h-1 w-12 rounded bg-slate-100" /><div className="mt-1 h-1 w-14 rounded bg-slate-100" /></div>
        </div>
        <h2 className="text-xs font-extrabold text-fg">{template.label}</h2><p className="mt-1 text-[10px] leading-4 text-muted">{templateDescription(template.id)}</p>
      </article>)}
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-fg">Your saved CVs</h2><p className="text-xs text-muted">Only you can access your documents.</p></div>
      {savedCvs.length ? <ul className="grid gap-3 md:grid-cols-2">
        {savedCvs.map((cv) => <li key={cv.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-extrabold text-fg">{cv.title}</h3>
              {cv.is_default && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Default</span>}</div>
              <p className="mt-1 text-xs text-muted">{templateName(cv.template_key)} · Updated {new Date(cv.updated_at).toLocaleDateString()}</p>
            </div>
            <Link className="btn min-h-9 rounded-lg px-3 text-xs" to={`/app/cv-builder/${cv.id}/edit`}>Edit</Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="btn min-h-9 rounded-lg px-3 text-xs" to={`/app/cv-builder/${cv.id}/print`}><Printer size={13} className="mr-1 inline" />Print / PDF</Link>
            {!cv.is_default && <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(cv.id)}>Set default</button>}
            <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" disabled={copy.isPending} onClick={() => copy.mutate(cv)}><Copy size={13} className="mr-1 inline" />Duplicate</button>
            <button type="button" className="btn-danger min-h-9 rounded-lg px-3 text-xs" onClick={() => setDeleteTarget(cv)}><Trash2 size={13} className="mr-1 inline" />Delete</button>
          </div>
        </li>)}
      </ul> : <section className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
        <FileDown className="mx-auto text-primary" size={26} /><h3 className="mt-3 font-extrabold text-fg">Create your first CV</h3>
        <p className="mt-1 text-sm text-muted">Start with a blank, private document and add only the experience you want to share.</p>
        <Link to="/app/cv-builder/new" className="btn-primary mt-4 inline-flex">Build a CV</Link>
      </section>}
    </section>
    {deleteTarget && <ConfirmDialog title="Delete this CV?" confirmLabel="Delete CV" busy={remove.isPending}
      onCancel={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id)}>
      This document will be permanently deleted. You can print a copy first if you need to keep it.
    </ConfirmDialog>}
  </div>;
}

function templateDescription(template: string) {
  const descriptions: Record<string, string> = {
    modern_professional: "Balanced hierarchy for internships and early-career roles.",
    simple_minimal: "Quiet typography and a clean, compact layout.",
    graduate: "Education-forward structure for new graduates.",
    student: "A flexible format for campus experience and activities.",
    technical: "Clear project and technical-skill sections.",
    academic: "Room for education, research, and scholarly experience.",
    creative: "A distinctive, spacious profile with a restrained accent.",
    internship: "A focused one-page structure for applications.",
  };
  return descriptions[template] ?? descriptions.modern_professional;
}

export function CvEditorPage() {
  const { cvId } = useParams();
  const isNew = !cvId || cvId === "new";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const existing = useQuery({ queryKey: ["student-cv", cvId], queryFn: () => getCv(cvId!), enabled: !isNew });
  const [title, setTitle] = useState("My CV");
  const [template, setTemplate] = useState<string>("modern_professional");
  const [content, setContent] = useState<CvContent>(newCvContent);
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const save = useMutation({
    mutationFn: () => saveCv({ title, template_key: template, content, is_default: existing.data?.is_default ?? false }, isNew ? undefined : cvId),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: CV_QUERY });
      await queryClient.invalidateQueries({ queryKey: ["student-cv", id] });
      navigate(`/app/cv-builder/${id}/edit`, { replace: true });
      setMessage("CV saved.");
    },
    onError: (error: Error) => setMessage(error.message),
  });
  useEffect(() => {
    if (initialized || (existing.isLoading && !isNew)) return;
    if (!isNew && existing.data) {
      setTitle(existing.data.title);
      setTemplate(existing.data.template_key);
      setContent(existing.data.content);
    }
    setInitialized(true);
  }, [existing.data, existing.isLoading, initialized, isNew]);

  const setPersonal = (key: keyof Omit<CvContent, "sections">, value: string) =>
    setContent((current) => ({ ...current, [key]: value }));
  const updateSection = (sectionId: string, update: (section: CvSection) => CvSection) =>
    setContent((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId ? update(section) : section) }));
  const addSection = (type: CvSectionType) => {
    setContent((current) => current.sections.some((section) => section.type === type)
      ? current
      : { ...current, sections: [...current.sections, newCvSection(type)] });
  };
  const importProfile = async () => {
    setImporting(true);
    setImportNotice("");
    try {
      const imported = await getCvImportData();
      setContent((current) => ({
        ...current,
        full_name: current.full_name || imported.content.full_name,
        email: current.email || imported.content.email,
        location: current.location || imported.content.location,
        summary: current.summary || imported.content.summary,
        sections: current.sections.length ? current.sections : imported.content.sections,
      }));
      setImportNotice("Profile details were added to empty fields. Review before saving.");
    } catch (error) {
      setImportNotice(error instanceof Error ? error.message : "Could not import profile details.");
    } finally {
      setImporting(false);
    }
  };

  if (!isNew && existing.isLoading) return <LoadingState label="Loading your CV" variant="panel" />;
  if (!isNew && existing.isError) return <p role="alert" className="err">Could not load this CV: {(existing.error as Error).message}</p>;
  if (!isNew && !existing.data) return <section className="card"><h1 className="font-black text-fg">CV not found</h1><p className="mt-2 text-sm text-muted">This CV may have been deleted, or it is not available to your account.</p><Link className="btn mt-4 inline-flex" to="/app/cv-builder">Back to CV builder</Link></section>;
  if (!initialized) return <LoadingState label="Preparing your CV editor" variant="panel" />;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><Link to="/app/cv-builder" className="text-xs font-bold text-primary hover:underline">← Your CVs</Link>
        <h1 className="mt-2 text-2xl font-black text-fg">{isNew ? "Create a CV" : "Edit your CV"}</h1>
        <p className="mt-1 text-sm text-muted">Saved CVs are private to your account. No information is published to your profile.</p></div>
      <div className="flex gap-2">
        {!isNew && <Link className="btn min-h-9 rounded-lg px-3 text-xs" to={`/app/cv-builder/${cvId}/print`}>Preview / PDF</Link>}
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save CV"}</button>
      </div>
    </header>
    {message && <p role={save.isError ? "alert" : "status"} className={save.isError ? "err" : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"}>{message}</p>}
    {importNotice && <p role={importing ? "status" : "alert"} className={importing ? "text-sm text-muted" : "rounded-xl border border-line bg-white px-3 py-2 text-sm text-muted"}>{importNotice}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-4">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-fg">Document details</h2>
            <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" disabled={importing} onClick={() => void importProfile()}>{importing ? "Importing…" : "Import from my profile"}</button></div>
          <TextInput label="CV title" value={title} onChange={setTitle} maxLength={100} />
          <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Template</span>
            <select className="field w-full" value={template} onChange={(event) => setTemplate(event.target.value)}>{CV_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </label>
        </section>
        <section className="card space-y-4">
          <h2 className="font-extrabold text-fg">Contact and profile</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Full name" value={content.full_name} onChange={(value) => setPersonal("full_name", value)} maxLength={100} />
            <TextInput label="Email" value={content.email} onChange={(value) => setPersonal("email", value)} maxLength={254} type="email" />
            <TextInput label="Phone" value={content.phone} onChange={(value) => setPersonal("phone", value)} maxLength={40} />
            <TextInput label="Location" value={content.location} onChange={(value) => setPersonal("location", value)} maxLength={100} />
            <div className="sm:col-span-2"><TextInput label="Professional headline" value={content.headline} onChange={(value) => setPersonal("headline", value)} maxLength={120} placeholder="e.g. Computer science student and junior developer" /></div>
          </div>
          <TextArea label="Profile summary" value={content.summary} onChange={(value) => setPersonal("summary", value)} rows={4} maxLength={2000} />
        </section>
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-fg">CV sections</h2><p className="mt-1 text-xs text-muted">Add only the sections that fit this application.</p></div>
            <select aria-label="Add CV section" className="field max-w-52" value="" onChange={(event) => { if (event.target.value) addSection(event.target.value as CvSectionType); }}>
              <option value="">Add section…</option>{CV_SECTION_TYPES.filter((type) => !content.sections.some((section) => section.type === type)).map((type) => <option value={type} key={type}>{SECTION_LABELS[type]}</option>)}
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {content.sections.map((section, index) => <CvSectionEditor key={section.id} section={section} index={index} count={content.sections.length}
              onChange={(next) => updateSection(section.id, () => next)}
              onRemove={() => setContent((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id) }))}
              onMove={(offset) => setContent((current) => {
                const sections = [...current.sections]; const target = index + offset;
                if (target < 0 || target >= sections.length) return current;
                const currentSection = sections[index];
                const adjacent = sections[target];
                if (!currentSection || !adjacent) return current;
                sections[index] = adjacent;
                sections[target] = currentSection;
                return { ...current, sections };
              })} />)}
            {!content.sections.length && <p className="rounded-xl bg-[#fbf8f6] p-4 text-sm text-muted">Add education, experience, projects, skills, or another section to shape your CV.</p>}
          </div>
        </section>
      </div>
      <aside className="cv-editor-preview">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Live document preview</p>
          {!isNew && <Link className="text-xs font-bold text-primary hover:underline" to={`/app/cv-builder/${cvId}/print`}>Open print view</Link>}</div>
        <CvDocument title={title} template={template} content={content} />
      </aside>
    </div>
  </div>;
}

function CvSectionEditor({ section, index, count, onChange, onRemove, onMove }: {
  section: CvSection; index: number; count: number;
  onChange: (section: CvSection) => void; onRemove: () => void; onMove: (offset: -1 | 1) => void;
}) {
  const updateEntry = (entryId: string, update: Partial<CvEntry>) =>
    onChange({ ...section, entries: section.entries.map((entry) => entry.id === entryId ? { ...entry, ...update } : entry) });
  return <article className="rounded-xl border border-line bg-[#fffdfc] p-3">
    <div className="flex items-center gap-2">
      <input aria-label={`${SECTION_LABELS[section.type]} section title`} className="field min-w-0 flex-1 font-bold" maxLength={80}
        value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} />
      <button type="button" className="rounded p-1 text-muted hover:bg-bg disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move section up"><ArrowUp size={15} /></button>
      <button type="button" className="rounded p-1 text-muted hover:bg-bg disabled:opacity-30" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move section down"><ArrowDown size={15} /></button>
      <button type="button" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-700" onClick={onRemove} aria-label="Remove section"><Trash2 size={15} /></button>
    </div>
    <div className="mt-3 space-y-3">
      {section.entries.map((entry) => <div key={entry.id} className="rounded-lg border border-line bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <TextInput label={entryTitleLabel(section.type)} value={entry.title} onChange={(value) => updateEntry(entry.id, { title: value })} maxLength={120} />
          <TextInput label={organizationLabel(section.type)} value={entry.organization} onChange={(value) => updateEntry(entry.id, { organization: value })} maxLength={120} />
          <TextInput label="Date or period" value={entry.date} onChange={(value) => updateEntry(entry.id, { date: value })} maxLength={80} placeholder="e.g. 2023 – Present" />
          <TextInput label="Location" value={entry.location} onChange={(value) => updateEntry(entry.id, { location: value })} maxLength={100} />
          <div className="sm:col-span-2"><TextArea label="Details" value={entry.description} onChange={(value) => updateEntry(entry.id, { description: value })} rows={3} maxLength={2000} /></div>
          <div className="sm:col-span-2"><TextInput label="Link (optional)" value={entry.url} onChange={(value) => updateEntry(entry.id, { url: value })} maxLength={300} placeholder="https://" /></div>
        </div>
        <button type="button" className="mt-2 text-xs font-bold text-red-700 hover:underline" onClick={() => onChange({ ...section, entries: section.entries.filter((item) => item.id !== entry.id) })}>Remove entry</button>
      </div>)}
      <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" onClick={() => onChange({ ...section, entries: [...section.entries, newCvEntry()] })}><Plus size={13} className="mr-1 inline" />Add entry</button>
    </div>
  </article>;
}

function entryTitleLabel(type: CvSectionType) {
  if (type === "education") return "Qualification or course";
  if (type === "technical_skills" || type === "soft_skills" || type === "languages") return "Skill or language";
  if (type === "references") return "Reference name";
  return "Role or title";
}

function organizationLabel(type: CvSectionType) {
  if (type === "education") return "Institution";
  if (type === "references") return "Relationship / organization";
  if (type === "technical_skills" || type === "soft_skills" || type === "languages") return "Level or proficiency";
  return "Organization";
}

function TextInput({ label, value, onChange, maxLength, type = "text", placeholder }: {
  label: string; value: string; onChange: (value: string) => void; maxLength: number; type?: string; placeholder?: string;
}) {
  return <label className="block space-y-1 text-xs font-semibold text-fg"><span>{label}</span>
    <input className="field w-full" type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, rows = 3, maxLength }: {
  label: string; value: string; onChange: (value: string) => void; rows?: number; maxLength: number;
}) {
  return <label className="block space-y-1 text-xs font-semibold text-fg"><span>{label}</span>
    <textarea className="field w-full" rows={rows} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CvDocument({ title, template, content }: { title: string; template: string; content: CvContent }) {
  const accent = template === "simple_minimal" || template === "academic" ? "#374151" : template === "creative" ? "#7654a4" : "#b42335";
  return <article className={`cv-print-root cv-template-${template} mx-auto min-h-[720px] max-w-[760px] bg-white p-6 text-slate-800 shadow-lg sm:p-9`} style={{ "--cv-accent": accent } as CSSProperties}>
    <header className="border-b-2 border-[var(--cv-accent)] pb-4">
      <h1 className="text-2xl font-black tracking-tight">{content.full_name || "Your name"}</h1>
      {content.headline && <p className="mt-1 text-sm font-semibold text-slate-600">{content.headline}</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        {[content.email, content.phone, content.location].filter(Boolean).map((value) => <span key={value}>{value}</span>)}
      </div>
    </header>
    {content.summary && <section className="mt-4"><h2 className="cv-document-heading">Profile</h2><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{content.summary}</p></section>}
    {content.sections.map((section) => <section key={section.id} className="cv-print-section mt-4">
      <h2 className="cv-document-heading">{section.title || SECTION_LABELS[section.type]}</h2>
      <div className="mt-2 space-y-3">
        {section.entries.map((entry) => <div key={entry.id} className="cv-print-entry">
          <div className="flex flex-wrap justify-between gap-x-3"><h3 className="text-xs font-bold">{entry.title || "Entry title"}</h3><span className="text-[10px] text-slate-500">{entry.date}</span></div>
          <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[10px] font-semibold text-slate-600"><span>{entry.organization}</span><span>{entry.location}</span></div>
          {entry.description && <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-slate-700">{entry.description}</p>}
          {entry.url && isSafeLink(entry.url) && <p className="mt-1 break-all text-[9px] text-slate-500">{entry.url}</p>}
        </div>)}
      </div>
    </section>)}
    <span className="sr-only">{title}</span>
  </article>;
}

function isSafeLink(value: string) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

export function CvPrintPage() {
  const { cvId = "" } = useParams();
  const cv = useQuery({ queryKey: ["student-cv", cvId], queryFn: () => getCv(cvId), enabled: !!cvId });
  useEffect(() => {
    if (!cv.data) return;
    const previous = document.title;
    document.title = `${cv.data.title} - CampusConnect`;
    return () => { document.title = previous; };
  }, [cv.data]);
  if (cv.isLoading) return <main className="mx-auto max-w-4xl p-4"><LoadingState label="Preparing your CV" variant="panel" /></main>;
  if (cv.isError) return <main className="mx-auto max-w-4xl p-4"><p role="alert" className="err">Could not load this CV: {(cv.error as Error).message}</p></main>;
  if (!cv.data) return <main className="mx-auto max-w-4xl p-4"><p role="alert" className="err">CV not found or unavailable.</p><Link className="btn mt-3 inline-flex" to="/app/cv-builder">Back to CV builder</Link></main>;
  return <main className="cv-print-page min-h-screen bg-[#f7f5f3] px-3 py-5 sm:px-8">
    <div className="cv-print-toolbar mx-auto mb-4 flex max-w-[760px] flex-wrap items-center justify-between gap-2">
      <Link to={`/app/cv-builder/${cv.data.id}/edit`} className="text-sm font-bold text-primary hover:underline">← Back to editor</Link>
      <button type="button" className="btn-primary" onClick={() => window.print()}><Printer size={15} className="mr-2 inline" />Print or save as PDF</button>
    </div>
    <p className="cv-print-toolbar mx-auto mb-3 max-w-[760px] text-xs text-muted">Choose “Save as PDF” in your browser’s print dialog. This document contains selectable text and is stored privately.</p>
    <CvDocument title={cv.data.title} template={cv.data.template_key} content={cv.data.content} />
  </main>;
}
