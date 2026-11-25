import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toBlob } from "html-to-image";
import { ArrowLeft, ArrowRight, Download, ExternalLink, ImagePlus, Printer, Share2, Sparkles } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "@/app/LoadingState";
import { celebrationUrlSchema } from "@/validation/profile";
import {
  getCelebration,
  getCelebrationImageUrl,
  listCelebrationCatalog,
  saveCelebrationCard,
  validateCelebration,
  validateCelebrationImage,
  type CelebrationCategory,
  type CelebrationDetails,
  type CelebrationTheme,
  type CelebrationVisibility,
  type SaveCelebrationInput,
} from "./api";
import { CELEBRATION_OCCASIONS, CELEBRATION_TEMPLATES, type StudioTemplate } from "./catalog";
import { CelebrationPoster } from "./CelebrationPoster";

function defaultEventTime() {
  const date = new Date(Date.now() + 7 * 86_400_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function dateInputValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const initialTheme: CelebrationTheme = {
  background: "#172c3c",
  accent: "#f4c769",
  text: "#fffaf2",
  align: "center",
  font: "sans",
  photoX: 50,
  photoY: 50,
  photoScale: 1,
  layout: "portrait",
  titleSize: "large",
  fullBleedPhoto: true,
  showDecorations: true,
  showCountdown: true,
};

const VISIBILITY_OPTIONS: { value: CelebrationVisibility; label: string; description: string }[] = [
  { value: "public", label: "Everyone", description: "Discoverable by the CampusConnect community." },
  { value: "followers", label: "Followers", description: "Only students who follow you can view this card." },
  { value: "institution", label: "My institution", description: "Visible to signed-in students at your institution." },
  { value: "private", label: "Only me", description: "Saved for you; hidden from discovery and the feed." },
];

export function CelebrationStudioPage() {
  const { celebrationId = "" } = useParams();
  const editing = Boolean(celebrationId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const posterWrap = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<CelebrationCategory>("birthday");
  const [templateId, setTemplateId] = useState("birthday-portrait");
  const [title, setTitle] = useState("");
  const [celebrant, setCelebrant] = useState("");
  const [eventTime, setEventTime] = useState(defaultEventTime);
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [message, setMessage] = useState("");
  const [venue, setVenue] = useState("");
  const [whiteshirtUrl, setWhiteshirtUrl] = useState("");
  const [details, setDetails] = useState<CelebrationDetails>({});
  const [theme, setTheme] = useState<CelebrationTheme>(initialTheme);
  const [visibility, setVisibility] = useState<CelebrationVisibility>("public");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [square, setSquare] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparingPoster, setPreparingPoster] = useState(false);
  const [preparedPoster, setPreparedPoster] = useState<{ key: string; blob: Blob } | null>(null);
  const [exportRetry, setExportRetry] = useState(0);
  const [exportError, setExportError] = useState("");
  const [exportStatus, setExportStatus] = useState("");

  const catalog = useQuery({ queryKey: ["celebrations", "studio-catalog"], queryFn: listCelebrationCatalog, staleTime: 60_000 });
  const existing = useQuery({ queryKey: ["celebration", celebrationId], queryFn: () => getCelebration(celebrationId), enabled: editing });
  const image = useQuery({ queryKey: ["celebration-image", photoPath], enabled: Boolean(photoPath && !imageFile), queryFn: () => getCelebrationImageUrl(photoPath!) });
  const occasions = catalog.data?.occasions ?? CELEBRATION_OCCASIONS;
  const templates = catalog.data?.templates ?? CELEBRATION_TEMPLATES;
  const occasion = occasions.find((row) => row.id === category) ?? occasions[0]!;
  const occasionTemplates = templates.filter((row) => row.occasion_id === occasion.id);
  const template = occasionTemplates.find((row) => row.id === templateId) ?? occasionTemplates[0];
  const previewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : image.data, [imageFile, image.data]);

  useEffect(() => {
    if (!imageFile || !previewUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile, previewUrl]);

  useEffect(() => {
    if (!existing.data || loaded || !catalog.data) return;
    const card = existing.data;
    const selectedOccasion = catalog.data.occasions.find((row) => row.id === card.category);
    const selectedTemplate = catalog.data.templates.find((row) => row.id === card.template_id);
    setCategory(card.category);
    setTemplateId(selectedTemplate?.id ?? `${card.category}-portrait`);
    setTitle(card.title);
    setCelebrant(card.celebrant_name);
    setEventTime(dateInputValue(card.celebration_at));
    setMessage(card.message);
    setVenue(card.venue ?? "");
    setWhiteshirtUrl(card.whiteshirt_url ?? "");
    setDetails(card.details ?? {});
    setTheme({ ...initialTheme, ...(selectedTemplate ? {
      background: selectedTemplate.background, accent: selectedTemplate.accent, text: selectedTemplate.text, font: selectedTemplate.font, layout: selectedTemplate.layout,
    } : {}), ...card.customization });
    setVisibility(card.visibility ?? "public");
    setPhotoPath(card.photo_path);
    setLoaded(true);
    if (selectedOccasion) setCategory(selectedOccasion.id);
  }, [catalog.data, existing.data, loaded]);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!catalog.data) throw new Error("Apply the Celebration Studio SQL before saving a design.");
      const eventDate = new Date(eventTime);
      if (Number.isNaN(eventDate.getTime())) throw new Error("Choose a valid event date and time.");
      const input: SaveCelebrationInput = {
        id: celebrationId || undefined,
        title,
        category,
        celebrant_name: celebrant,
        celebration_at: eventDate.toISOString(),
        timezone,
        message,
        venue: venue || null,
        whiteshirt_url: whiteshirtUrl.trim() || null,
        template_id: template?.id ?? templateId,
        customization: theme,
        details,
        visibility,
        photoPath,
        imageFile,
        keepCurrentPublication: existing.data?.status === "published",
        publish,
      };
      const error = validateCelebration(input);
      if (error) throw new Error(error);
      return saveCelebrationCard(input);
    },
    onSuccess: async (id, publish) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["celebrations"] }),
        queryClient.invalidateQueries({ queryKey: ["celebration", id] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
      ]);
      if (publish) navigate(`/app/celebrations/${id}`);
      else navigate("/app/celebrations/mine");
    },
  });

  useEffect(() => {
    if (!occasionTemplates.length) return;
    if (occasionTemplates.some((row) => row.id === templateId)) return;
    const next = occasionTemplates[0]!;
    setTemplateId(next.id);
    setTheme((current) => ({ ...current, background: next.background, accent: next.accent, text: next.text, font: next.font, layout: next.layout }));
  }, [occasionTemplates, templateId]);

  const chooseTemplate = (row: StudioTemplate) => {
    setTemplateId(row.id);
    setTheme((current) => ({ ...current, background: row.background, accent: row.accent, text: row.text, font: row.font, layout: row.layout }));
  };
  const updateDetail = (key: string, value: string) => setDetails((current) => ({ ...current, [key]: value }));
  const whiteshirtLinkError = whiteshirtUrl.trim() && !celebrationUrlSchema.safeParse(whiteshirtUrl.trim()).success
    ? "Enter a valid HTTPS link from whiteshirt.fun."
    : "";
  const posterCard = {
    title: title || occasion.titlePlaceholder,
    category,
    celebrant_name: celebrant || occasion.primaryName,
    celebration_at: Number.isNaN(new Date(eventTime).getTime()) ? new Date().toISOString() : new Date(eventTime).toISOString(),
    timezone,
    message,
    whiteshirt_url: whiteshirtLinkError ? null : whiteshirtUrl.trim() || null,
    template_id: template?.id ?? templateId,
    customization: theme,
    details,
  };
  const qrValue = theme.qrValue?.trim() || (editing && visibility === "public" ? `${window.location.origin}/app/celebrations/${celebrationId}` : "");
  const posterNode = () => posterWrap.current?.querySelector<HTMLElement>("[data-celebration-poster]");
  const posterFileName = () => `${(title || occasion.label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${square ? "square" : "portrait"}.png`;
  const posterRenderKey = JSON.stringify({ title, category, celebrant, eventTime, timezone, message, theme, details, previewUrl, qrValue, square, templateId });

  useEffect(() => {
    let cancelled = false;
    setPreparedPoster(null);
    setPreparingPoster(true);
    setExportError("");
    setExportStatus("");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          const node = posterNode();
          if (!node) throw new Error("The poster preview is not ready.");
          await Promise.all(Array.from(node.querySelectorAll("img"), async (image) => {
            if (typeof image.decode === "function") {
              await image.decode().catch(() => undefined);
            }
            if (!image.complete || image.naturalWidth === 0) {
              throw new Error("A poster image could not be loaded. Check the photo and try again.");
            }
          }));
          const blob = await toBlob(node, { pixelRatio: 3, backgroundColor: theme.background });
          if (!blob) throw new Error("The poster image could not be generated.");
          if (!cancelled) setPreparedPoster({ key: posterRenderKey, blob });
        } catch (error) {
          if (!cancelled) {
            setExportError(`Could not prepare the poster. ${error instanceof Error ? error.message : "Please try again."}`);
          }
        } finally {
          if (!cancelled) setPreparingPoster(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [posterRenderKey, theme.background, exportRetry]);

  const downloadPoster = async () => {
    setExporting(true);
    setExportError("");
    setExportStatus("");
    try {
      if (!preparedPoster || preparedPoster.key !== posterRenderKey) {
        throw new Error("The poster is still preparing. Wait a moment and try again.");
      }
      downloadBlob(preparedPoster.blob, posterFileName());
      setExportStatus("The high-resolution poster download has started. Check your browser downloads.");
    } catch (error) {
      setExportError(`Could not download the poster. ${error instanceof Error ? error.message : "Please try again."}`);
    }
    finally { setExporting(false); }
  };
  const sharePoster = async () => {
    setExporting(true);
    setExportError("");
    setExportStatus("");
    try {
      if (!preparedPoster || preparedPoster.key !== posterRenderKey) {
        throw new Error("The poster is still preparing. Wait a moment and try again.");
      }
      const file = new File([preparedPoster.blob], posterFileName(), { type: "image/png" });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        downloadBlob(preparedPoster.blob, posterFileName());
        setExportStatus("This browser cannot share image files directly. The poster was downloaded so you can attach it to your message.");
        return;
      }
      const shareRequest = navigator.share({ title: title || "CampusConnect celebration", files: [file] });
      await shareRequest;
      setExportStatus("Your poster has been shared.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (preparedPoster?.key === posterRenderKey) {
        downloadBlob(preparedPoster.blob, posterFileName());
        setExportStatus("Sharing is unavailable here. The poster was downloaded so you can attach it to your message.");
      } else setExportError(`Could not share the poster. ${error instanceof Error ? error.message : "Please try again."}`);
    }
    finally { setExporting(false); }
  };
  const copyShareLink = async () => {
    const link = visibility === "public" && editing ? `${window.location.origin}/app/celebrations/${celebrationId}` : window.location.href;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  };
  const onPhoto = (file?: File) => {
    setImageError("");
    if (!file) return setImageFile(null);
    const issue = validateCelebrationImage(file);
    if (issue) return setImageError(issue);
    setImageFile(file);
    setTheme((current) => ({ ...current, fullBleedPhoto: true }));
  };

  if (editing && (existing.isLoading || !catalog.isError && !catalog.data)) return <LoadingState label="Loading your celebration design" variant="panel" />;
  if (editing && (existing.isError || !existing.data)) return <p role="alert" className="err">This card is unavailable or not editable.</p>;

  return (
    <div className="celebration-studio-print space-y-5">
      <Link to={editing ? `/app/celebrations/${celebrationId}` : "/app/celebrations"} className="inline-flex min-h-9 items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />Back to celebrations</Link>
      <header className="overflow-hidden rounded-[26px] border border-[#efd9db] bg-gradient-to-br from-[#fff5f1] via-white to-[#fff0f2] p-5 sm:p-7">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">CampusConnect · Celebration Studio</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">{editing ? "Make this moment yours" : "Design a moment worth remembering"}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Start with a design made for your occasion, add your own photo and details, then download or share your finished poster.</p>
      </header>
      {catalog.isError && <p role="alert" className="rounded-xl border border-warning-border bg-warning-soft p-3 text-sm text-warning">The Celebration Studio catalog is unavailable. Review and apply the legacy-schema repair in <code>supabase/manual-sql/celebration_studio_catalog_privacy.sql</code> in Supabase. Do not use an older copy of the Studio setup. <span className="mt-1 block">{catalog.error instanceof Error ? catalog.error.message : "The catalog tables could not be loaded."}</span></p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
        <form className="min-w-0 space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(true); }}>
          <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff1f2] text-primary"><Sparkles size={16} /></span><div><h2 className="font-extrabold">Start with your occasion</h2><p className="text-xs text-muted">Each occasion has four distinct layouts.</p></div></div>
            <label className="block"><span className="label">Celebration occasion</span><select className="input" value={category} onChange={(event) => { const next = event.target.value as CelebrationCategory; setCategory(next); const nextTemplate = templates.find((row) => row.occasion_id === next); if (nextTemplate) chooseTemplate(nextTemplate); }}><optgroup label="Campus milestones">{occasions.filter((row) => ["induction", "convocation", "sign_out", "graduation"].includes(row.id)).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</optgroup><optgroup label="Life celebrations">{occasions.filter((row) => !["induction", "convocation", "sign_out", "graduation"].includes(row.id)).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</optgroup></select></label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Choose a poster layout">{occasionTemplates.map((row, index) => (
              <button key={row.id} type="button" aria-pressed={row.id === template?.id} onClick={() => chooseTemplate(row)} className={`group overflow-hidden rounded-xl border-2 text-left transition ${row.id === template?.id ? "border-primary ring-2 ring-primary/15" : "border-line hover:border-primary/40"}`}>
                <span className="block h-20 p-2" style={{ background: `linear-gradient(145deg, ${row.background}, ${row.background}dd 60%, ${row.accent})` }}>
                  <span className={`block h-full border border-white/40 ${index === 0 ? "rounded-t-full" : index === 1 ? "border-x-0 border-b-0" : index === 2 ? "m-1 border-2" : "rotate-3 rounded-xl"}`} />
                </span>
                <span className="block p-2 text-[11px] font-extrabold">{row.name}</span>
              </button>
            ))}</div>
            {template && <p className="text-xs text-muted">{template.description}</p>}
          </section>

          <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-extrabold">Your celebration details</h2>
            <label className="block"><span className="label">Poster heading</span><input className="input" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={occasion.titlePlaceholder} /></label>
            <label className="block"><span className="label">{occasion.primaryName}</span><input className="input" required maxLength={100} value={celebrant} onChange={(event) => setCelebrant(event.target.value)} /></label>
            {occasion.fields.map((field) => (
              <label key={field.key} className="block"><span className="label">{field.label}</span><input className="input" type={field.type ?? "text"} maxLength={300} value={field.key === "venue" ? venue : details[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => field.key === "venue" ? setVenue(event.target.value) : updateDetail(field.key, event.target.value)} /></label>
            ))}
            <label className="block"><span className="label">Event date and time</span><input className="input" type="datetime-local" required value={eventTime} onChange={(event) => setEventTime(event.target.value)} /><span className="mt-1 block text-xs text-muted">Time zone: {timezone}</span></label>
            <label className="block"><span className="label">Personal message</span><textarea className="input min-h-24" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={occasion.messagePlaceholder} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="label">Institution or organization (optional)</span><input className="input" maxLength={120} value={theme.institutionName ?? ""} onChange={(event) => setTheme((current) => ({ ...current, institutionName: event.target.value }))} placeholder="Institution name" /></label><label className="block"><span className="label">Extra line (optional)</span><input className="input" maxLength={300} value={theme.extraText ?? ""} onChange={(event) => setTheme((current) => ({ ...current, extraText: event.target.value }))} placeholder="A short personal touch" /></label></div>
            <label className="block"><span className="label">Whiteshirt.fun celebration board <span className="text-danger" aria-hidden="true">*</span></span><input className="input" type="url" required maxLength={200} value={whiteshirtUrl} aria-invalid={Boolean(whiteshirtLinkError)} onChange={(event) => setWhiteshirtUrl(event.target.value)} placeholder="https://whiteshirt.fun/your-board" /><span className="mt-1 block text-xs text-muted">Required to save or publish. It appears as a styled callout on your poster and opens the celebration board.</span></label>
            {whiteshirtLinkError && <p role="alert" className="text-sm text-danger">{whiteshirtLinkError}</p>}
          </section>

          <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <div><h2 className="font-extrabold">Customize the design</h2><p className="mt-1 text-xs text-muted">Color, typography and image changes update the preview immediately.</p></div>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#d9c6c7] p-3 hover:bg-[#fff9f8]"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fff1f2] text-primary"><ImagePlus size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">Add a photograph</span><span className="block text-xs text-muted">JPEG, PNG or WebP · up to 5 MB</span></span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            {imageError && <p role="alert" className="text-sm text-danger">{imageError}</p>}
            {(previewUrl || photoPath) && <div className="grid gap-3 sm:grid-cols-3">{([["photoX", "Photo position · horizontal", 0, 100, 1], ["photoY", "Photo position · vertical", 0, 100, 1], ["photoScale", "Photo zoom", 0.6, 1.6, 0.05]] as const).map(([key, label, min, max, step]) => <label key={key} className="block text-xs font-semibold text-muted">{label}<input className="mt-2 w-full accent-primary" type="range" min={min} max={max} step={step} value={theme[key]} onChange={(event) => setTheme((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>}
            {imageFile && <button type="button" className="text-xs font-bold text-danger" onClick={() => setImageFile(null)}>Remove selected photograph</button>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={theme.fullBleedPhoto ?? true} onChange={(event) => setTheme((current) => ({ ...current, fullBleedPhoto: event.target.checked }))} />Use the photograph as a full-background image</label>
            <div className="grid grid-cols-3 gap-3">{([["background", "Background"], ["accent", "Accent"], ["text", "Text"]] as const).map(([key, label]) => <label key={key} className="block text-xs font-semibold text-muted">{label}<input type="color" className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-line bg-white p-1" value={theme[key]} onChange={(event) => setTheme((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
            <div className="grid gap-3 sm:grid-cols-3"><label><span className="label">Typography</span><select className="input" value={theme.font} onChange={(event) => setTheme((current) => ({ ...current, font: event.target.value as CelebrationTheme["font"] }))}><option value="serif">Elegant serif</option><option value="sans">Modern sans</option><option value="display">Bold display</option></select></label><label><span className="label">Name size</span><select className="input" value={theme.titleSize ?? "large"} onChange={(event) => setTheme((current) => ({ ...current, titleSize: event.target.value as CelebrationTheme["titleSize"] }))}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label><span className="label">Text alignment</span><select className="input" value={theme.align} onChange={(event) => setTheme((current) => ({ ...current, align: event.target.value as CelebrationTheme["align"] }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
            <div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={theme.showCountdown ?? false} onChange={(event) => setTheme((current) => ({ ...current, showCountdown: event.target.checked }))} />Show event countdown</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={theme.showDecorations ?? true} onChange={(event) => setTheme((current) => ({ ...current, showDecorations: event.target.checked }))} />Show decorative elements</label></div>
            <label className="block"><span className="label">QR code link (optional, HTTPS)</span><input className="input" type="url" maxLength={500} value={theme.qrValue ?? ""} onChange={(event) => setTheme((current) => ({ ...current, qrValue: event.target.value }))} placeholder="Leave blank to use the public celebration link after publishing" /></label>
            <div className="grid grid-cols-2 gap-2"><button type="button" className={`btn min-h-10 ${square ? "border-primary text-primary" : ""}`} onClick={() => setSquare(false)}>Portrait poster</button><button type="button" className={`btn min-h-10 ${square ? "border-primary text-primary" : ""}`} onClick={() => setSquare(true)}>Square poster</button></div>
          </section>

          <section className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-extrabold">Who can view it?</h2>
            <label className="block"><span className="label">Audience</span><select className="input" value={visibility} onChange={(event) => setVisibility(event.target.value as CelebrationVisibility)}>{VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <p className="text-xs leading-5 text-muted">{VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.description} Private and limited-audience celebrations are excluded from public discovery.</p>
          </section>
          {save.isError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{(save.error as Error).message}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 rounded-xl px-5 font-bold" disabled={save.isPending || catalog.isError} onClick={() => save.mutate(false)}>{save.isPending ? "Saving…" : "Save as draft"}</button><button type="submit" className="btn-primary min-h-11 rounded-xl px-5 font-bold" disabled={save.isPending || catalog.isError}>{save.isPending ? "Publishing…" : "Publish celebration"}</button></div>
        </form>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">Live studio preview</p><h2 className="font-extrabold text-fg">{square ? "Square poster" : "Portrait poster"}</h2></div><span className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-[10px] font-bold text-primary">LIVE</span></div>
          <div className="rounded-[28px] border border-[#eadbd2] bg-[radial-gradient(ellipse_at_50%_0%,#fff_0%,#fff8f4_52%,#f2e7df_100%)] p-4 shadow-inner sm:p-6">
            <div ref={posterWrap} className="mx-auto w-full max-w-[420px]"><CelebrationPoster card={posterCard} photoUrl={previewUrl} qrValue={qrValue || undefined} square={square} /></div>
          </div>
          {image.isError && <p role="alert" className="text-xs text-danger">The saved photograph could not be loaded.</p>}
          <div className="grid grid-cols-2 gap-2"><button type="button" className="btn min-h-10 gap-2" disabled={exporting || preparingPoster} onClick={() => void downloadPoster()}><Download size={15} />{preparingPoster || exporting ? "Preparing…" : "Download PNG"}</button><button type="button" className="btn min-h-10 gap-2" onClick={() => window.print()}><Printer size={15} />Print / PDF</button><button type="button" className="btn min-h-10 gap-2" disabled={exporting || preparingPoster} onClick={() => void sharePoster()}><Share2 size={15} />{preparingPoster || exporting ? "Preparing…" : "Share poster"}</button><button type="button" className="btn min-h-10 gap-2" onClick={() => void copyShareLink()}><ExternalLink size={15} />{linkCopied ? "Link copied" : "Copy link"}</button></div>
          {exportError && <button type="button" className="text-sm font-bold text-primary underline" onClick={() => setExportRetry((current) => current + 1)}>Retry poster preparation</button>}
          {exportError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{exportError}</p>}
          {exportStatus && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success">{exportStatus}</p>}
          <p className="text-xs leading-5 text-muted">Download PNG exports at high resolution. Print / PDF opens your browser's print dialog; choose “Save as PDF”. Your uploaded photo replaces the sample background while keeping the layout protected.</p>
          {editing && <Link to={`/app/celebrations/${celebrationId}`} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">View saved celebration <ArrowRight size={14} /></Link>}
        </aside>
      </div>
    </div>
  );
}
