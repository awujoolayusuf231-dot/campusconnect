import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@/app/LoadingState";
import { useMyPermissions } from "@/features/admin/useMyPermissions";
import {
  listCelebrationCatalogForAdmin,
  saveCelebrationOccasion,
  saveCelebrationTemplate,
  uploadCelebrationTemplatePreview,
} from "@/features/celebrations/api";
import type { CelebrationOccasion, CelebrationLayout, StudioTemplate } from "@/features/celebrations/catalog";

const LAYOUTS: { id: CelebrationLayout; label: string }[] = [
  { id: "portrait", label: "Photo portrait" },
  { id: "editorial", label: "Editorial" },
  { id: "luxury", label: "Signature / luxe" },
  { id: "celebration", label: "Joyful celebration" },
];

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function CelebrationCatalogPage() {
  const permissions = useMyPermissions();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["admin", "celebration-catalog"], queryFn: listCelebrationCatalogForAdmin });
  const [occasionId, setOccasionId] = useState("");
  const [occasionName, setOccasionName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLayout, setTemplateLayout] = useState<CelebrationLayout>("portrait");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateBackground, setTemplateBackground] = useState("#213b4d");
  const [templateAccent, setTemplateAccent] = useState("#e2bd78");
  const [templateText, setTemplateText] = useState("#fffaf2");
  const [templateError, setTemplateError] = useState("");

  const canManage = permissions.data?.includes("settings.manage") ?? false;
  const occasions = catalog.data?.occasions ?? [];
  const templates = catalog.data?.templates ?? [];
  const selectedOccasion = useMemo(() => occasions.find((row) => row.id === occasionId), [occasions, occasionId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "celebration-catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["celebrations", "studio-catalog"] }),
    ]);
  };
  const saveOccasion = useMutation({ mutationFn: saveCelebrationOccasion, onSuccess: refresh });
  const saveTemplate = useMutation({
    mutationFn: async (template: StudioTemplate) => saveCelebrationTemplate(template),
    onSuccess: refresh,
  });
  const createTemplate = useMutation({ mutationFn: saveCelebrationTemplate, onSuccess: refresh });
  const uploadPreview = useMutation({
    mutationFn: async ({ template, file }: { template: StudioTemplate; file: File }) => {
      const url = await uploadCelebrationTemplatePreview(template.occasion_id, template.id, file);
      await saveCelebrationTemplate({ ...template, preview_image_url: url });
    },
    onSuccess: refresh,
  });

  if (permissions.isLoading) return <LoadingState label="Checking Celebration Studio management access" variant="panel" />;
  if (permissions.isError) return <section role="alert" className="card">Could not verify template-management permissions.</section>;
  if (!canManage) return <section role="alert" className="card">You need settings management permission to manage celebration templates.</section>;
  if (catalog.isLoading) return <LoadingState label="Loading celebration catalog" variant="panel" />;
  if (catalog.isError) return <section role="alert" className="card"><h1 className="font-bold">Could not load the Celebration Studio catalog</h1><p className="mt-1 break-words text-sm text-muted">{catalog.error.message}</p><button className="btn mt-3" onClick={() => void catalog.refetch()}>Retry</button></section>;

  return (
    <div className="space-y-5">
      <header><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Platform content</p><h1 className="mt-1 text-2xl font-black">Celebration Studio catalog</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Manage the occasions and design templates available to students. Database policies re-check permission for every change.</p></header>
      {(saveOccasion.isError || saveTemplate.isError || createTemplate.isError || uploadPreview.isError) && <p role="alert" className="err">{templateError || (saveOccasion.error ?? saveTemplate.error ?? createTemplate.error ?? uploadPreview.error as Error).message}</p>}

      <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <div><h2 className="font-extrabold">Add an occasion</h2><p className="mt-1 text-xs text-muted">New occasion IDs use lowercase letters, numbers, and underscores. Add its four template layouts below.</p></div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          const id = slug(occasionId);
          if (id.length < 2) return setTemplateError("Use an occasion ID with at least two characters.");
          const newOccasion: CelebrationOccasion = {
            id, label: occasionName, eyebrow: occasionName, primaryName: "Name to celebrate",
            titlePlaceholder: `Celebrate ${occasionName.toLowerCase()}`, messagePlaceholder: "Write a personal message for the occasion.",
            fields: [], palette: ["#263846", "#69434b", "#435448", "#eadbc6"], accent: "#e1bd78",
            text: "#fffaf2", image: "/celebrations/achievement.jpg", icon: "spark",
            emotionalLine: "A moment worth remembering.",
          };
          setTemplateError("");
          saveOccasion.mutate(newOccasion);
          setOccasionId(id);
          setOccasionName("");
        }}>
          <label><span className="label">Occasion ID</span><input className="input" required maxLength={40} value={occasionId} onChange={(event) => setOccasionId(event.target.value)} placeholder="e.g. cultural_celebration" /></label>
          <label><span className="label">Display name</span><input className="input" required minLength={2} maxLength={80} value={occasionName} onChange={(event) => setOccasionName(event.target.value)} placeholder="Cultural celebration" /></label>
          <button className="btn-primary min-h-10 sm:col-span-2" disabled={saveOccasion.isPending}>Add occasion</button>
        </form>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{occasions.map((occasion) => (
          <li key={occasion.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <div className="min-w-0"><p className="truncate text-sm font-bold">{occasion.label}</p><p className="truncate text-xs text-muted">{occasion.id} · {templates.filter((row) => row.occasion_id === occasion.id && row.is_active !== false).length} active templates</p></div>
            <button type="button" className="btn min-h-9 shrink-0 px-3 text-xs" disabled={saveOccasion.isPending} onClick={() => saveOccasion.mutate({ ...occasion, is_active: occasion.is_active === false })}>{occasion.is_active === false ? "Enable" : "Disable"}</button>
          </li>
        ))}</ul>
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <div><h2 className="font-extrabold">Add a template</h2><p className="mt-1 text-xs text-muted">The four layout engines are intentionally distinct; each can have its own palette, typography and preview art.</p></div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          if (!selectedOccasion || !templateName.trim()) return setTemplateError("Choose an occasion and enter a template name.");
          const id = `${selectedOccasion.id}-${templateLayout}-${slug(templateName).slice(0, 24)}`;
          setTemplateError("");
          createTemplate.mutate({
            id, occasion_id: selectedOccasion.id, name: templateName.trim(), description: templateDescription.trim() || `A ${templateLayout} design for ${selectedOccasion.label.toLowerCase()}.`,
            layout: templateLayout, background: templateBackground, accent: templateAccent, text: templateText,
            font: templateLayout === "luxury" ? "serif" : templateLayout === "portrait" ? "sans" : "display",
            is_active: true, is_featured: false,
          });
          setTemplateName("");
          setTemplateDescription("");
        }}>
          <label><span className="label">Occasion</span><select className="input" required value={occasionId} onChange={(event) => setOccasionId(event.target.value)}><option value="">Choose occasion</option>{occasions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          <label><span className="label">Layout style</span><select className="input" value={templateLayout} onChange={(event) => setTemplateLayout(event.target.value as CelebrationLayout)}>{LAYOUTS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          <label><span className="label">Template name</span><input className="input" required minLength={2} maxLength={80} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Golden hour" /></label>
          <label><span className="label">Description</span><input className="input" maxLength={240} value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="Describe this design" /></label>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">{([["background", "Background", templateBackground, setTemplateBackground], ["accent", "Accent", templateAccent, setTemplateAccent], ["text", "Text", templateText, setTemplateText]] as const).map(([key, label, value, setValue]) => <label key={key} className="text-xs font-semibold text-muted">{label}<input type="color" className="mt-1 h-10 w-full rounded-lg border border-line p-1" value={value} onChange={(event) => setValue(event.target.value)} /></label>)}</div>
          <button className="btn-primary min-h-10 sm:col-span-2" disabled={createTemplate.isPending}>Create template</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-extrabold">Templates · {templates.length}</h2>
        {templates.map((template) => <TemplateRow key={template.id} template={template} onSave={(next) => saveTemplate.mutate(next)} onUpload={(file) => uploadPreview.mutate({ template, file })} busy={saveTemplate.isPending || uploadPreview.isPending} />)}
      </section>
    </div>
  );
}

function TemplateRow({ template, onSave, onUpload, busy }: {
  template: StudioTemplate;
  onSave: (template: StudioTemplate) => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(template.name);
  return (
    <article className="grid gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
      {template.preview_image_url ? <img src={template.preview_image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div aria-hidden="true" className="h-20 w-20 rounded-xl border border-white/40" style={{ background: `linear-gradient(145deg, ${template.background}, ${template.accent})` }} />}
      <div className="min-w-0 space-y-2"><label className="block"><span className="sr-only">Template name</span><input className="input min-h-9 py-1.5 text-sm" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><p className="text-xs text-muted">{template.occasion_id} · {template.layout} · {template.id}</p><div className="flex flex-wrap gap-3"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={template.is_active !== false} disabled={busy} onChange={(event) => onSave({ ...template, is_active: event.target.checked })} />Enabled</label><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={template.is_featured ?? false} disabled={busy} onChange={(event) => onSave({ ...template, is_featured: event.target.checked })} />Featured</label></div></div>
      <div className="flex flex-wrap items-center gap-2"><label className="btn min-h-9 cursor-pointer px-3 text-xs">Upload preview<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label><button type="button" className="btn min-h-9 px-3 text-xs" disabled={busy || name.trim() === template.name} onClick={() => onSave({ ...template, name: name.trim() })}>Save name</button></div>
    </article>
  );
}