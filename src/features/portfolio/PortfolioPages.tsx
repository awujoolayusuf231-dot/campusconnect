import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Globe2, ImagePlus, Plus, Share2, Trash2 } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import {
  deletePortfolioItem,
  getMyPortfolio,
  getOwnProfileForPortfolio,
  getPublicPortfolio,
  portfolioAvatarUrl,
  portfolioCompletion,
  portfolioImageUrl,
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_TEMPLATES,
  savePortfolio,
  savePortfolioItem,
  type PortfolioInput,
  type PortfolioItem,
  type PortfolioItemInput,
  type PortfolioItemType,
  type PublicPortfolio,
} from "@/features/portfolio/api";

const PORTFOLIO_QUERY = ["student-portfolio"];
const SECTIONS = ["projects", "skills", "experience", "education", "achievements", "certificates"];
const ITEM_LABELS: Record<PortfolioItemType, string> = {
  skill: "Skill",
  project: "Project",
  education: "Education",
  experience: "Experience",
  achievement: "Achievement",
  certificate: "Certificate",
};

function blankInput(): PortfolioInput {
  return {
    slug: "",
    display_name: "",
    avatar_path: null,
    headline: "",
    summary: "",
    contact_email: "",
    show_contact_email: false,
    location: "",
    website_url: "",
    linkedin_url: "",
    github_url: "",
    template_key: "modern",
    accent_color: "#c52b3a",
    section_order: SECTIONS,
    is_public: false,
  };
}

function Field({ label, value, onChange, type = "text", maxLength, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
  maxLength?: number; placeholder?: string;
}) {
  return <label className="block space-y-1.5 text-sm font-semibold text-fg">
    <span>{label}</span>
    <input className="field w-full" type={type} value={value} maxLength={maxLength} placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)} />
  </label>;
}

function TextAreaField({ label, value, onChange, maxLength, rows = 4, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; maxLength?: number;
  rows?: number; placeholder?: string;
}) {
  return <label className="block space-y-1.5 text-sm font-semibold text-fg">
    <span>{label}</span>
    <textarea className="field w-full" rows={rows} value={value} maxLength={maxLength}
      placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function PortfolioDashboardPage() {
  const portfolio = useQuery({ queryKey: PORTFOLIO_QUERY, queryFn: getMyPortfolio });
  const completion = portfolioCompletion(portfolio.data ?? null);
  if (portfolio.isLoading) return <LoadingState label="Loading your portfolio" variant="panel" />;
  if (portfolio.isError) return <p role="alert" className="err">Could not load your portfolio: {(portfolio.error as Error).message}</p>;
  return <div className="space-y-5">
    <header className="rounded-3xl border border-[#eadbd8] bg-gradient-to-br from-white via-[#fff9f7] to-[#f8ecea] p-5 shadow-sm sm:p-7">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Your work, thoughtfully presented</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-black tracking-tight text-fg sm:text-3xl">Student portfolio</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Build a polished home for your projects, skills, education, and milestones. You decide what becomes public.</p></div>
        <Link className="btn-primary inline-flex items-center gap-2" to="/app/portfolio/edit"><Plus size={16} />{portfolio.data ? "Edit portfolio" : "Create portfolio"}</Link>
      </div>
    </header>
    {!portfolio.data ? <section className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
      <Globe2 className="mx-auto text-primary" size={28} /><h2 className="mt-3 font-extrabold text-fg">Your portfolio starts here</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">Add your introduction and a few highlights. It stays private until you choose to publish it.</p>
      <Link to="/app/portfolio/edit" className="btn-primary mt-5 inline-flex">Create my portfolio</Link>
    </section> : <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <article className="card">
        <div className="flex items-start justify-between gap-4"><div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Portfolio link</p>
          <h2 className="mt-1 break-all text-lg font-extrabold text-fg">/portfolio/{portfolio.data.slug}</h2>
        </div><span className={`rounded-full px-3 py-1 text-xs font-bold ${portfolio.data.is_public ? "bg-success-soft text-success" : "bg-bg text-muted"}`}>
          {portfolio.data.is_public ? "Published" : "Private"}
        </span></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {portfolio.data.is_public && <Link className="btn min-h-9 rounded-lg px-3 text-xs" to={`/portfolio/${portfolio.data.slug}`} target="_blank" rel="noreferrer">View public portfolio</Link>}
          <Link className="btn min-h-9 rounded-lg px-3 text-xs" to="/app/portfolio/edit">Edit details</Link>
        </div>
      </article>
      <article className="card">
        <div className="flex items-center justify-between"><h2 className="font-extrabold text-fg">Profile readiness</h2><span className="text-sm font-extrabold text-primary">{completion}%</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f1e8e5]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} /></div>
        <p className="mt-2 text-xs leading-5 text-muted">A useful starting checklist based on your saved introduction and portfolio sections.</p>
      </article>
      <section className="card md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-fg">Your portfolio sections</h2><p className="mt-1 text-xs text-muted">Only items you mark public appear on your public page.</p></div>
          <Link className="btn min-h-9 rounded-lg px-3 text-xs" to="/app/portfolio/edit">Manage sections</Link></div>
        {portfolio.data.items.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {portfolio.data.items.map((item) => <li key={item.id} className="rounded-xl border border-line bg-bg p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">{ITEM_LABELS[item.item_type]}</span>
              <span className="text-[10px] font-bold text-muted">{item.is_public ? "Public item" : "Private item"}</span></div>
            <p className="mt-1 line-clamp-1 text-sm font-bold text-fg">{textValue(item.content, item.item_type === "skill" ? "name" : "title")}</p>
          </li>)}
        </ul> : <p className="mt-4 rounded-xl bg-[#fbf8f6] p-4 text-sm text-muted">Add your first project, skill, or milestone to get started.</p>}
      </section>
    </section>}
  </div>;
}

export function PortfolioEditorPage() {
  const queryClient = useQueryClient();
  const portfolio = useQuery({ queryKey: PORTFOLIO_QUERY, queryFn: getMyPortfolio });
  const profile = useQuery({ queryKey: ["student-portfolio-profile"], queryFn: getOwnProfileForPortfolio });
  const [values, setValues] = useState<PortfolioInput>(blankInput);
  const [initialized, setInitialized] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [editingItem, setEditingItem] = useState<PortfolioItem | null | "new">(null);
  const [deleteItem, setDeleteItem] = useState<PortfolioItem | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (initialized || portfolio.isLoading || profile.isLoading) return;
    if (portfolio.data) {
      const { id: _id, owner_id: _ownerId, created_at: _createdAt, updated_at: _updatedAt, ...fields } = portfolio.data;
      setValues(fields);
      setNewSlug(fields.slug);
    } else if (profile.data) {
      const username = profile.data.username?.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      setValues({ ...blankInput(), display_name: profile.data.display_name ?? "", avatar_path: profile.data.avatar_path,
        headline: profile.data.academic_level ?? "", summary: profile.data.bio ?? "", location: profile.data.location ?? "",
        website_url: profile.data.website_url ?? "", slug: username && username.length >= 3 ? username.slice(0, 30) : "" });
      setNewSlug(username ?? "");
    }
    setInitialized(true);
  }, [initialized, portfolio.data, portfolio.isLoading, profile.data, profile.isLoading]);

  const save = useMutation({
    mutationFn: () => savePortfolio(values, portfolio.data?.id),
    onSuccess: async () => {
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
      navigate("/app/portfolio");
    },
    onError: async (error: Error) => {
      setErrorMessage(error.message);
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
    },
  });
  const itemSave = useMutation({
    mutationFn: (args: { input: PortfolioItemInput; itemId?: string; file?: File | null; removeImage?: boolean }) =>
      savePortfolioItem(portfolio.data!.id, args.input, args.itemId, args.file, args.removeImage),
    onSuccess: async () => {
      setEditingItem(null);
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
    },
    onError: async (error: Error) => {
      setErrorMessage(error.message);
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
    },
  });
  const itemDelete = useMutation({
    mutationFn: (item: PortfolioItem) => deletePortfolioItem(portfolio.data!.id, item),
    onSuccess: async () => {
      setDeleteItem(null);
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
    },
    onError: async (error: Error) => {
      setErrorMessage(error.message);
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
    },
  });

  const setField = <K extends keyof PortfolioInput>(key: K, value: PortfolioInput[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const saveSectionOrder = (index: number, offset: -1 | 1) => {
    const next = [...values.section_order];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const adjacent = next[target];
    if (!current || !adjacent) return;
    next[index] = adjacent;
    next[target] = current;
    setField("section_order", next);
  };
  const importProfile = () => {
    if (!profile.data) return;
    setValues((current) => ({
      ...current,
      display_name: current.display_name || profile.data!.display_name || "",
      avatar_path: current.avatar_path || profile.data!.avatar_path,
      headline: current.headline || profile.data!.academic_level || "",
      summary: current.summary || profile.data!.bio || "",
      location: current.location || profile.data!.location || "",
      website_url: current.website_url || profile.data!.website_url || "",
    }));
    setShareMessage("Profile details added. Review them before saving or publishing.");
  };
  const share = async () => {
    const url = `${window.location.origin}/portfolio/${portfolio.data?.slug ?? values.slug}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${values.display_name}'s portfolio`, url }); }
      catch (error) { if (error instanceof Error && error.name !== "AbortError") setErrorMessage(error.message); }
      return;
    }
    try { await navigator.clipboard.writeText(url); setShareMessage("Public link copied."); }
    catch { setErrorMessage("Could not copy the link. Copy it from the preview URL instead."); }
  };

  if (portfolio.isLoading || profile.isLoading) return <LoadingState label="Preparing your portfolio editor" variant="panel" />;
  if (portfolio.isError || profile.isError) return <p role="alert" className="err">Could not prepare your portfolio editor: {((portfolio.error ?? profile.error) as Error).message}</p>;
  const publicPreview = portfolio.data?.is_public ? `/portfolio/${portfolio.data.slug}` : null;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><Link to="/app/portfolio" className="text-xs font-bold text-primary hover:underline">← Portfolio overview</Link>
        <h1 className="mt-2 text-2xl font-black text-fg">Portfolio editor</h1><p className="mt-1 max-w-2xl text-sm text-muted">Build your profile one section at a time. Your changes remain private until you publish.</p></div>
      <div className="flex gap-2">
        {publicPreview && <Link className="btn min-h-9 rounded-lg px-3 text-xs" target="_blank" rel="noreferrer" to={publicPreview}>Preview public page</Link>}
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save portfolio"}</button>
      </div>
    </header>
    {errorMessage && <p role="alert" className="err">{errorMessage}</p>}
    {shareMessage && <p role="status" className="rounded-xl border border-success-border bg-success-soft px-3 py-2 text-sm text-success">{shareMessage}</p>}
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-fg">Introduction</h2><p className="mt-1 text-xs text-muted">Import your profile as a starting point, then review each field.</p></div>
        <button className="btn min-h-9 rounded-lg px-3 text-xs" type="button" onClick={importProfile}>Import from profile</button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" value={values.display_name} maxLength={100} onChange={(value) => setField("display_name", value)} />
        <Field label="Public link slug" value={newSlug} maxLength={30} placeholder="your-name" onChange={(value) => { setNewSlug(value); setField("slug", value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
        <Field label="Headline" value={values.headline ?? ""} maxLength={120} placeholder="Computer science student · Front-end developer" onChange={(value) => setField("headline", value)} />
        <Field label="Location" value={values.location ?? ""} maxLength={100} placeholder="City, Country" onChange={(value) => setField("location", value)} />
      </div>
      <TextAreaField label="About you" value={values.summary ?? ""} maxLength={2000} rows={5}
        placeholder="A short introduction to your interests, strengths, and the work you want to do."
        onChange={(value) => setField("summary", value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact email" value={values.contact_email ?? ""} type="email" maxLength={254} onChange={(value) => setField("contact_email", value)} />
        <Field label="Website" value={values.website_url ?? ""} type="url" maxLength={300} placeholder="https://" onChange={(value) => setField("website_url", value)} />
        <Field label="LinkedIn" value={values.linkedin_url ?? ""} type="url" maxLength={300} placeholder="https://linkedin.com/in/…" onChange={(value) => setField("linkedin_url", value)} />
        <Field label="GitHub" value={values.github_url ?? ""} type="url" maxLength={300} placeholder="https://github.com/…" onChange={(value) => setField("github_url", value)} />
      </div>
      <label className="flex items-start gap-2 text-sm text-fg"><input type="checkbox" className="mt-1" checked={values.show_contact_email} onChange={(event) => setField("show_contact_email", event.target.checked)} />
        <span><strong>Show my contact email publicly</strong><span className="block text-xs text-muted">Your email stays hidden until you enable this.</span></span></label>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Portfolio style</span>
          <select className="field w-full" value={values.template_key} onChange={(event) => setField("template_key", event.target.value as PortfolioInput["template_key"])}>
            {PORTFOLIO_TEMPLATES.map((template) => <option key={template} value={template}>{template.replace(/^\w/, (letter) => letter.toUpperCase())}</option>)}
          </select></label>
        <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Accent color</span><input aria-label="Accent color" className="field h-11 w-20 p-1" type="color" value={values.accent_color} onChange={(event) => setField("accent_color", event.target.value)} /></label>
      </div>
      <label className="flex items-start gap-2 text-sm text-fg"><input type="checkbox" className="mt-1" checked={values.is_public} onChange={(event) => setField("is_public", event.target.checked)} />
        <span><strong>Publish my portfolio</strong><span className="block text-xs text-muted">Public visitors can only see the fields and items you explicitly mark public.</span></span></label>
    </section>
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-extrabold text-fg">Arrange sections</h2><p className="mt-1 text-xs text-muted">This sets the order on your public portfolio.</p></div>
        <div className="flex gap-2">
          {portfolio.data?.is_public && <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" onClick={() => void share()}><Share2 size={14} className="mr-1 inline" />Share link</button>}
          {values.slug && <span className="self-center text-xs text-muted">campusconnect.app/portfolio/{values.slug}</span>}
        </div>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {values.section_order.map((section, index) => <li key={section} className="flex items-center justify-between rounded-xl border border-line bg-bg px-3 py-2 text-sm font-semibold capitalize text-fg">
          <span>{section}</span><span className="flex gap-1">
            <button type="button" disabled={index === 0} onClick={() => saveSectionOrder(index, -1)} className="rounded p-1 text-muted hover:bg-bg disabled:opacity-30" aria-label={`Move ${section} up`}><ArrowUp size={15} /></button>
            <button type="button" disabled={index === values.section_order.length - 1} onClick={() => saveSectionOrder(index, 1)} className="rounded p-1 text-muted hover:bg-bg disabled:opacity-30" aria-label={`Move ${section} down`}><ArrowDown size={15} /></button>
          </span>
        </li>)}
      </ol>
    </section>
    {portfolio.data ? <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-extrabold text-fg">Portfolio items</h2><p className="mt-1 text-xs text-muted">Choose which individual highlights are visible to visitors.</p></div>
        <button type="button" className="btn-primary min-h-9 px-3 text-xs" onClick={() => setEditingItem("new")}><Plus size={14} className="mr-1 inline" />Add item</button>
      </div>
      {editingItem && <PortfolioItemEditor
        key={editingItem === "new" ? "new" : editingItem.id}
        item={editingItem === "new" ? null : editingItem}
        nextOrder={portfolio.data.items.length}
        onCancel={() => setEditingItem(null)}
        onSave={(input, itemId, file, removeImage) => itemSave.mutate({ input, itemId, file, removeImage })}
        saving={itemSave.isPending}
        error={itemSave.error instanceof Error ? itemSave.error.message : ""}
      />}
      {portfolio.data.items.length ? <ul className="mt-4 space-y-2">
        {portfolio.data.items.map((item, index) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-3">
          <div className="min-w-0"><span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">{ITEM_LABELS[item.item_type]}</span>
            <h3 className="truncate text-sm font-bold text-fg">{textValue(item.content, item.item_type === "skill" ? "name" : "title")}</h3>
            <p className="text-xs text-muted">{item.is_public ? "Visible in public portfolio" : "Private item"}</p></div>
          <div className="flex items-center gap-1">
            <button type="button" disabled={index === 0 || itemSave.isPending} onClick={() => moveItem(index, -1)} className="btn min-h-9 rounded-lg px-2 text-xs" aria-label="Move item up"><ArrowUp size={14} /></button>
            <button type="button" disabled={index === portfolio.data!.items.length - 1 || itemSave.isPending} onClick={() => moveItem(index, 1)} className="btn min-h-9 rounded-lg px-2 text-xs" aria-label="Move item down"><ArrowDown size={14} /></button>
            <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" onClick={() => setEditingItem(item)}>Edit</button>
            <button type="button" className="btn-danger min-h-9 rounded-lg px-2 text-xs" onClick={() => setDeleteItem(item)} aria-label="Delete item"><Trash2 size={14} /></button>
          </div>
        </li>)}
      </ul> : <p className="mt-4 rounded-xl bg-[#fbf8f6] p-4 text-sm text-muted">Add skills, projects, education, experience, achievements, or certificates to showcase your work.</p>}
    </section> : <section className="rounded-2xl border border-dashed border-[#e4d7d4] bg-white p-4 text-sm text-muted">
      Save your portfolio introduction first. You can then add project images and individual portfolio sections here.
    </section>}
    {deleteItem && <ConfirmDialog title="Delete portfolio item?" confirmLabel="Delete item" busy={itemDelete.isPending}
      onCancel={() => setDeleteItem(null)} onConfirm={() => itemDelete.mutate(deleteItem)}>
      This item will be removed from your portfolio. Project images attached to it will also be deleted.
    </ConfirmDialog>}
  </div>;

  async function moveItem(index: number, offset: -1 | 1) {
    if (!portfolio.data) return;
    const items = [...portfolio.data.items];
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const current = items[index];
    const adjacent = items[target];
    if (!current || !adjacent) return;
    items[index] = adjacent;
    items[target] = current;
    try {
      for (const [position, row] of items.entries()) {
        await savePortfolioItem(portfolio.data.id, {
          item_type: row.item_type,
          content: row.content,
          is_public: row.is_public,
          sort_order: position * 10,
          image_path: row.image_path,
        }, row.id);
      }
      await queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not reorder portfolio items.");
    }
  }
}

function PortfolioItemEditor({ item, nextOrder, onCancel, onSave, saving, error }: {
  item: PortfolioItem | null; nextOrder: number; onCancel: () => void;
  onSave: (input: PortfolioItemInput, itemId?: string, file?: File | null, removeImage?: boolean) => void;
  saving: boolean; error: string;
}) {
  const [type, setType] = useState<PortfolioItemType>(item?.item_type ?? "project");
  const [content, setContent] = useState<Record<string, unknown>>(item?.content ?? defaultItemContent("project"));
  const [isPublic, setIsPublic] = useState(item?.is_public ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [formError, setFormError] = useState("");
  const currentImage = item?.image_path ?? null;
  const setText = (key: string, value: string) => setContent((current) => ({ ...current, [key]: value }));
  const handleSave = () => {
    if (type !== (item?.item_type ?? type)) {
      setFormError("To change a section type, create a new item and delete the old one.");
      return;
    }
    const nextContent = { ...content };
    if (type !== "skill" && !nextContent.title) nextContent.title = "";
    onSave({ item_type: type, content: nextContent, is_public: isPublic, sort_order: item?.sort_order ?? nextOrder, image_path: currentImage },
      item?.id, file, removeImage);
  };
  const common = (key: string, label: string, placeholder?: string, maxLength = 200) =>
    <Field key={key} label={label} value={textValue(content, key)} maxLength={maxLength}
      placeholder={placeholder} onChange={(value) => setText(key, value)} />;
  return <div className="mt-4 space-y-3 rounded-2xl border border-[#eadbd8] bg-bg p-4">
    <div className="flex items-center justify-between"><h3 className="font-extrabold text-fg">{item ? "Edit item" : "Add portfolio item"}</h3><button type="button" className="text-xs font-bold text-muted hover:text-primary" onClick={onCancel}>Close</button></div>
    {!item && <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Section type</span>
      <select className="field w-full" value={type} onChange={(event) => { const next = event.target.value as PortfolioItemType; setType(next); setContent(defaultItemContent(next)); }}>
        {PORTFOLIO_ITEM_TYPES.map((value) => <option key={value} value={value}>{ITEM_LABELS[value]}</option>)}
      </select></label>}
    <div className="grid gap-3 sm:grid-cols-2">
      {type === "skill" ? <>
        {common("name", "Skill name", "e.g. Data visualization", 80)}
        {common("category", "Category", "e.g. Technical", 50)}
        <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Proficiency</span><select className="field w-full" value={textValue(content, "proficiency") || "Intermediate"} onChange={(event) => setText("proficiency", event.target.value)}>
          {["Beginner", "Intermediate", "Advanced", "Expert"].map((level) => <option key={level}>{level}</option>)}
        </select></label>
      </> : <>
        {common("title", "Title", type === "project" ? "Project name" : `Your ${ITEM_LABELS[type].toLowerCase()} title`, 120)}
        {type === "project" ? common("role", "Your role", "e.g. Product designer", 100) : null}
      </>}
      {type === "education" && <>
        {common("institution", "Institution", "School or university", 160)}
        {common("course", "Course or qualification", "e.g. BSc Computer Science", 160)}
        {common("academic_level", "Level", "e.g. 300 level", 60)}
        {common("graduation_year", "Graduation year", "e.g. 2027", 4)}
      </>}
      {type === "experience" && <>
        {common("organization", "Organization", "Company or organization", 160)}
        {common("position", "Position", "Your role", 120)}
        {common("start_date", "Start date", "e.g. Jan 2024", 40)}
        {common("end_date", "End date", "e.g. Present", 40)}
      </>}
      {type === "achievement" && common("organization", "Awarding organization", "Organization or event", 160)}
      {type === "certificate" && <>
        {common("issuer", "Issuing organization", "Certificate provider", 160)}
        {common("credential_id", "Credential ID", "Optional", 100)}
      </>}
      {type === "project" && <>
        {common("project_url", "Project link", "https://", 500)}
        {common("github_url", "Repository link", "https://", 500)}
        {common("technologies", "Tools and technologies", "Separate with commas", 300)}
      </>}
      {type === "certificate" && common("credential_url", "Credential link", "https://", 500)}
    </div>
    <TextAreaField label="Description" value={textValue(content, "description")} maxLength={2000} rows={3}
      placeholder="Add context, responsibilities, or what you learned."
      onChange={(value) => setText("description", value)} />
    {type === "project" && <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-fg"><ImagePlus size={16} />Project image
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRemoveImage(false); }} />
      </label>
      <p className="text-xs text-muted">Optional; JPEG, PNG, or WebP. Images are resized before private storage.</p>
      {currentImage && !removeImage && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={removeImage} onChange={(event) => setRemoveImage(event.target.checked)} />Remove existing image</label>}
      {file && <p className="text-xs text-fg">{file.name}</p>}
    </div>}
    <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />Show this item in my public portfolio</label>
    {(formError || error) && <p role="alert" className="err">{formError || error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save item"}</button></div>
  </div>;
}

function textValue(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

function defaultItemContent(type: PortfolioItemType): Record<string, unknown> {
  return type === "skill" ? { proficiency: "Intermediate" } : {};
}

function publicText(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function publicItemTitle(type: PortfolioItemType, content: Record<string, unknown>) {
  const keys = type === "education" ? ["course", "institution"] : type === "skill" ? ["name"] : ["title"];
  return keys.map((key) => publicText(content, key)).find(Boolean) ?? ITEM_LABELS[type];
}

function safeHttpsUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}

export function PublicPortfolioPage() {
  const { slug = "" } = useParams();
  const portfolio = useQuery({ queryKey: ["public-student-portfolio", slug], queryFn: () => getPublicPortfolio(slug), enabled: !!slug });
  if (portfolio.isLoading) return <main className="mx-auto max-w-5xl p-4 sm:p-8"><LoadingState label="Loading portfolio" variant="panel" /></main>;
  if (portfolio.isError) return <main className="mx-auto max-w-5xl p-4 sm:p-8"><p role="alert" className="err">Could not load this portfolio: {(portfolio.error as Error).message}</p></main>;
  if (!portfolio.data) return <main className="mx-auto max-w-3xl p-6 text-center"><h1 className="text-xl font-black text-fg">Portfolio not found</h1><p className="mt-2 text-sm text-muted">This portfolio is private, unavailable, or the link is incorrect.</p><Link to="/" className="btn mt-4 inline-flex">CampusConnect home</Link></main>;
  return <PublicPortfolioView portfolio={portfolio.data} />;
}

function PublicPortfolioView({ portfolio }: { portfolio: PublicPortfolio }) {
  const items = useMemo(() => portfolio.items.slice().sort((a, b) => a.sort_order - b.sort_order), [portfolio.items]);
  const itemGroups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) map.set(item.item_type, [...(map.get(item.item_type) ?? []), item]);
    return map;
  }, [items]);
  const avatar = portfolioAvatarUrl(portfolio.avatar_path);
  const email = portfolio.contact_email ?? "";
  const isDeveloperTemplate = portfolio.template_key === "developer";
  const isCreativeTemplate = portfolio.template_key === "creative";
  const visibleSections = portfolio.section_order.filter((section) => itemGroups.has(section === "achievements" ? "achievement" : section === "certificates" ? "certificate" : section === "projects" ? "project" : section === "skills" ? "skill" : section === "education" ? "education" : "experience"));
  return <main className="min-h-screen bg-bg px-4 py-8 sm:px-7 sm:py-12" style={{ "--portfolio-accent": portfolio.accent_color } as CSSProperties}>
    <div className="mx-auto max-w-5xl">
      <header className={`overflow-hidden rounded-[2rem] border border-line shadow-sm ${isDeveloperTemplate ? "bg-slate-950 text-white" : isCreativeTemplate ? "bg-gradient-to-br from-white via-[#fff8fb] to-[#f2eafb]" : "bg-white"}`}>
        <div className="h-2 w-full bg-[var(--portfolio-accent)]" />
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-10">
          <div className="flex items-center gap-4">
            {avatar ? <img src={avatar} alt="" className="h-20 w-20 rounded-2xl object-cover ring-4 ring-[#f6efed] sm:h-24 sm:w-24" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f6efed] text-2xl font-black text-primary sm:h-24 sm:w-24">{portfolio.display_name.slice(0, 1)}</div>}
            <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--portfolio-accent)]">Student portfolio</p>
              <h1 className={`mt-1 text-2xl font-black tracking-tight sm:text-4xl ${isDeveloperTemplate ? "text-white" : "text-fg"}`}>{portfolio.display_name}</h1>
              {portfolio.headline && <p className={`mt-2 text-sm font-semibold sm:text-base ${isDeveloperTemplate ? "text-slate-200" : "text-muted"}`}>{portfolio.headline}</p>}
              {portfolio.location && <p className={`mt-1 text-xs ${isDeveloperTemplate ? "text-slate-300" : "text-muted"}`}>{portfolio.location}</p>}
            </div>
          </div>
          <nav aria-label="Contact and profiles" className="flex flex-wrap gap-2 sm:justify-end">
            {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && <a className="btn min-h-9 rounded-lg px-3 text-xs" href={`mailto:${email}`}>Contact</a>}
            {[
              ["Website", portfolio.website_url], ["LinkedIn", portfolio.linkedin_url], ["GitHub", portfolio.github_url],
            ].map(([label, url]) => {
              const safeUrl = typeof url === "string" ? safeHttpsUrl(url) : null;
              return safeUrl ? <a key={label} className="btn min-h-9 rounded-lg px-3 text-xs" href={safeUrl} target="_blank" rel="noopener noreferrer">{label}<ExternalLink size={12} className="ml-1 inline" /></a> : null;
            })}
          </nav>
        </div>
      </header>
      {portfolio.summary && <section className="mt-5 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--portfolio-accent)]">About</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-fg">{portfolio.summary}</p></section>}
      <div className="mt-5 space-y-5">
        {visibleSections.map((section) => {
          const itemType = section === "achievements" ? "achievement" : section === "certificates" ? "certificate" : section === "projects" ? "project" : section === "skills" ? "skill" : section === "education" ? "education" : "experience";
          const rows = itemGroups.get(itemType) ?? [];
          return <section key={section} className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-black capitalize text-fg">{section}</h2>
            {itemType === "skill" ? <ul className="mt-4 flex flex-wrap gap-2">{rows.map((item) => <li key={item.id} className="rounded-full bg-[#f6efed] px-3 py-1.5 text-sm font-semibold text-fg">{publicText(item.content, "name")}{publicText(item.content, "category") ? <span className="ml-2 text-xs text-muted">· {publicText(item.content, "category")}</span> : null}{publicText(item.content, "proficiency") ? <span className="ml-1 text-[10px] font-medium text-muted">({publicText(item.content, "proficiency")})</span> : null}</li>)}</ul>
              : <ul className="mt-4 space-y-4">{rows.map((item) => <li key={item.id} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div><h3 className="font-extrabold text-fg">{publicItemTitle(item.item_type, item.content)}</h3>
                  <p className="mt-1 text-xs font-semibold text-muted">{[publicText(item.content, "organization"), publicText(item.content, "institution"), publicText(item.content, "course"), publicText(item.content, "position"), publicText(item.content, "issuer"), publicText(item.content, "graduation_year"), publicText(item.content, "start_date"), publicText(item.content, "end_date"), publicText(item.content, "achieved_at"), publicText(item.content, "issued_at")].filter(Boolean).join(" · ")}</p>
                  {publicText(item.content, "description") && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{publicText(item.content, "description")}</p>}
                  {publicText(item.content, "technologies") && <p className="mt-2 text-xs font-semibold text-fg">{publicText(item.content, "technologies")}</p>}
                  <div className="mt-3 flex flex-wrap gap-3">{["project_url", "github_url", "credential_url"].map((key) => {
                    const url = safeHttpsUrl(publicText(item.content, key));
                    return url ? <a key={key} className="text-xs font-bold text-[var(--portfolio-accent)] hover:underline" href={url} target="_blank" rel="noopener noreferrer">{key === "github_url" ? "Repository" : key === "credential_url" ? "Credential" : "View project"}<ExternalLink size={12} className="ml-1 inline" /></a> : null;
                  })}</div>
                </div>
                {item.image_path && <PortfolioProjectImage path={item.image_path} title={publicText(item.content, "title")} />}
              </li>)}</ul>}
          </section>;
        })}
      </div>
      <footer className="mt-8 text-center text-xs text-muted">Shared with CampusConnect</footer>
    </div>
  </main>;
}

function PortfolioProjectImage({ path, title }: { path: string; title: string }) {
  const image = useQuery({ queryKey: ["portfolio-image", path], queryFn: () => portfolioImageUrl(path) });
  if (image.isError) return <p role="alert" className="self-start text-xs text-muted">Project image unavailable.</p>;
  return image.data ? <img className="max-h-44 w-full rounded-xl object-cover sm:col-start-2" src={image.data} alt={title ? `${title} project` : "Project"} /> : null;
}
