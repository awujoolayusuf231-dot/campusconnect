import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, ArrowLeft, ArrowRight, CalendarDays, Clock3, ExternalLink, GraduationCap, Heart, PartyPopper, Sparkles, Trash2 } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { useAuth } from "@/features/auth/AuthProvider";
import { celebrationUrlSchema } from "@/validation/profile";
import { CelebrationPoster } from "./CelebrationPoster";
import {
  addCelebrationReminder,
  cancelCelebrationReminder,
  CELEBRATION_IMAGE_URL_GC_TIME,
  CELEBRATION_IMAGE_URL_STALE_TIME,
  deleteCelebrationCard,
  getCelebration,
  getCelebrationImageUrl,
  listMyCelebrationReminders,
  listMyCelebrations,
  listRecentPublishedCelebrations,
  listUpcomingCelebrations,
  saveCelebrationCard,
  validateCelebration,
  type CelebrationCard,
  type CelebrationCategory,
  type CelebrationDetails,
  type CelebrationTheme,
  type FeedCelebration,
  type SaveCelebrationInput,
} from "./api";

type Template = { id: string; category: CelebrationCategory; label: string; background: string; accent: string; text: string; icon: typeof PartyPopper; font: CelebrationTheme["font"]; style: "confetti" | "academic" | "romantic" | "soft" | "bold" };
const CATEGORY_LABELS: Record<CelebrationCategory, string> = {
  birthday: "Birthday", convocation: "Convocation", graduation: "Graduation", induction: "Induction",
  sign_out: "Sign-out", naming_ceremony: "Naming ceremony", wedding: "Wedding", anniversary: "Anniversary",
  achievement: "Personal achievement", promotion_achievement: "Promotion & achievement",
  award_recognition: "Award & recognition", engagement: "Engagement", housewarming: "Housewarming",
  baby_shower: "Baby shower", retirement: "Retirement", cultural_celebration: "Cultural celebration", other: "Other",
};
const TEMPLATES: Template[] = [
  { id: "birthday-balloons", category: "birthday", label: "Balloons & joy", background: "#8e2433", accent: "#ffd166", text: "#fffaf2", icon: PartyPopper, font: "display", style: "confetti" },
  { id: "birthday-editorial", category: "birthday", label: "Birthday editorial", background: "#f5d6ca", accent: "#92283a", text: "#4b1821", icon: Sparkles, font: "serif", style: "soft" },
  { id: "birthday-confetti", category: "birthday", label: "Confetti night", background: "#321b36", accent: "#f2ae4b", text: "#fff8ec", icon: PartyPopper, font: "sans", style: "confetti" },
  { id: "convocation-classic", category: "convocation", label: "Classic convocation", background: "#1d3150", accent: "#d8b15f", text: "#fffaf1", icon: GraduationCap, font: "serif", style: "academic" },
  { id: "graduation-honors", category: "graduation", label: "Honors", background: "#6d1e2b", accent: "#e9c47c", text: "#fffaf2", icon: GraduationCap, font: "serif", style: "academic" },
  { id: "graduation-modern", category: "graduation", label: "Modern graduate", background: "#213b3d", accent: "#d4b670", text: "#f8f6ee", icon: Award, font: "sans", style: "academic" },
  { id: "induction-professional", category: "induction", label: "Professional welcome", background: "#20374c", accent: "#d8ad5d", text: "#fffaf2", icon: Sparkles, font: "sans", style: "academic" },
  { id: "signout-campus", category: "sign_out", label: "Campus memories", background: "#5b2733", accent: "#f0b37b", text: "#fff6ee", icon: PartyPopper, font: "display", style: "confetti" },
  { id: "naming-soft", category: "naming_ceremony", label: "Soft welcome", background: "#d9b7a3", accent: "#874759", text: "#3d2730", icon: Heart, font: "serif", style: "soft" },
  { id: "wedding-romance", category: "wedding", label: "Romance", background: "#762f43", accent: "#e8c4a0", text: "#fff9f2", icon: Heart, font: "serif", style: "romantic" },
  { id: "anniversary-elegant", category: "anniversary", label: "Elegant years", background: "#3c293e", accent: "#d9b469", text: "#fff8ed", icon: Heart, font: "serif", style: "romantic" },
  { id: "achievement-bold", category: "achievement", label: "Bold achievement", background: "#7c2d27", accent: "#f0bd62", text: "#fff9ef", icon: Award, font: "display", style: "bold" },
  { id: "other-celebration", category: "other", label: "Campus celebration", background: "#422b3b", accent: "#edbd72", text: "#fff9ef", icon: Sparkles, font: "sans", style: "bold" },
];
const CATEGORY_BACKGROUNDS: Record<CelebrationCategory, string> = {
  birthday: "/celebrations/birthday.jpg",
  convocation: "/celebrations/graduation.jpg",
  graduation: "/celebrations/graduation.jpg",
  induction: "/celebrations/achievement.jpg",
  sign_out: "/celebrations/graduation.jpg",
  naming_ceremony: "/celebrations/birthday.jpg",
  wedding: "/celebrations/wedding.jpg",
  anniversary: "/celebrations/wedding.jpg",
  achievement: "/celebrations/achievement.jpg",
  promotion_achievement: "/celebrations/achievement.jpg",
  award_recognition: "/celebrations/achievement.jpg",
  engagement: "/celebrations/wedding.jpg",
  housewarming: "/celebrations/achievement.jpg",
  baby_shower: "/celebrations/birthday.jpg",
  retirement: "/celebrations/achievement.jpg",
  cultural_celebration: "/celebrations/achievement.jpg",
  other: "/celebrations/achievement.jpg",
};
const DEFAULT_THEME: CelebrationTheme = { background: "#8e2433", accent: "#ffd166", text: "#fffaf2", align: "center", font: "display", photoX: 50, photoY: 72, photoScale: 1 };
const REMINDER_OPTIONS = [{ minutes: 10080, label: "One week before" }, { minutes: 1440, label: "One day before" }, { minutes: 0, label: "On the day" }];

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{eyebrow}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>{action}</div>;
}

function ThemeForTemplate(templateId: string): CelebrationTheme {
  const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0]!;
  return { ...DEFAULT_THEME, background: template.background, accent: template.accent, text: template.text, font: template.font };
}

function CelebrationVisual({ card, photoUrl, compact = false }: { card: Pick<FeedCelebration, "title" | "category" | "celebrant_name" | "celebration_at" | "timezone" | "message" | "whiteshirt_url" | "template_id" | "customization"> & { details?: CelebrationDetails }; photoUrl?: string | null; compact?: boolean }) {
  const template = TEMPLATES.find((item) => item.id === card.template_id) ?? TEMPLATES[TEMPLATES.length - 1]!;
  const theme = card.customization ?? ThemeForTemplate(template.id);
  return <CelebrationPoster card={{ ...card, customization: theme }} photoUrl={photoUrl} square={compact} />;
}

function CelebrationImage({ card, compact = false }: { card: CelebrationCard | FeedCelebration; compact?: boolean }) {
  const image = useQuery({
    queryKey: ["celebration-image", card.photo_path],
    enabled: !!card.photo_path,
    queryFn: () => getCelebrationImageUrl(card.photo_path!),
    staleTime: CELEBRATION_IMAGE_URL_STALE_TIME,
    gcTime: CELEBRATION_IMAGE_URL_GC_TIME,
  });
  return <><CelebrationVisual card={card} photoUrl={image.data} compact={compact} />{image.isError && <p role="alert" className="mt-2 text-xs text-danger">The celebration photo could not be loaded. <button type="button" className="font-bold underline underline-offset-2" onClick={() => void image.refetch()}>Try again</button></p>}</>;
}

function daysUntil(value: string) {
  const remaining = new Date(value).getTime() - Date.now();
  if (remaining <= 0) return "Celebration date passed";
  const days = Math.floor(remaining / 86_400_000);
  if (days === 0) return "Celebrating today";
  if (days === 1) return "1 day to go";
  return `${days} days to go`;
}

export function CelebrationFeedCard({ card }: { card: FeedCelebration }) {
  return <article className="overflow-hidden rounded-2xl border border-primary-border bg-white shadow-[0_10px_28px_rgba(35,24,20,0.07)]">
    <Link to={`/app/celebrations/${card.id}`} className="block p-3 sm:p-4"><CelebrationImage card={card} compact /></Link>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs"><span className="font-bold text-fg">Celebrated by {card.creator_name || "CampusConnect student"}{card.creator_username ? ` · @${card.creator_username}` : ""}</span><span className="rounded-full bg-primary-soft px-2.5 py-1 font-bold text-primary">{daysUntil(card.celebration_at)}</span></div>
  </article>;
}

function CelebrationListCard({ card }: { card: CelebrationCard }) {
  const expired = new Date(card.celebration_at).getTime() <= Date.now();
  return <Link to={`/app/celebrations/${card.id}`} className="group grid overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:border-primary-border hover:shadow-md sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <div className="p-3"><CelebrationImage card={card} compact /></div>
    <div className="flex min-w-0 flex-col justify-center p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">{CATEGORY_LABELS[card.category]}</span>{expired && <span className="rounded-full bg-bg px-2.5 py-1 text-[10px] font-bold text-muted">Expired</span>}{card.status === "draft" && <span className="rounded-full bg-bg px-2.5 py-1 text-[10px] font-bold text-muted">Draft</span>}</div><h2 className="mt-3 break-words text-lg font-black text-fg group-hover:text-primary">{card.title}</h2><p className="mt-1 text-sm text-muted">For {card.celebrant_name}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><CalendarDays size={14} />{new Date(card.celebration_at).toLocaleString()}</p><p className="mt-3 line-clamp-2 text-sm leading-5 text-muted">{card.message || "A CampusConnect celebration card."}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">View card <ArrowRight size={13} /></span></div>
  </Link>;
}

export function CelebrationsHomePage() {
  const [category, setCategory] = useState<CelebrationCategory | "all">("all");
  const events = useQuery({ queryKey: ["celebrations", "upcoming", category], queryFn: () => listUpcomingCelebrations(category === "all" ? undefined : category) });
  const recent = useQuery({ queryKey: ["celebrations", "recent", category], queryFn: () => listRecentPublishedCelebrations(category === "all" ? undefined : category) });
  const active = events.data?.filter((card) => new Date(card.celebration_at).getTime() > Date.now()) ?? [];
  return <div className="space-y-5">
    <PageTitle eyebrow="Celebrate campus life" title="Celebrations" description="Share birthdays, achievements and life milestones with students across CampusConnect." action={<Link to="/app/celebrations/create" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><PartyPopper size={16} />Create a card</Link>} />
    <section className="overflow-hidden rounded-[26px] border border-primary-border bg-gradient-to-br from-primary-soft via-white to-primary-soft p-5 sm:p-8"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Good moments deserve a beautiful card</p><h2 className="mt-2 max-w-2xl text-2xl font-black tracking-tight text-fg sm:text-3xl">Celebrate together, wherever campus takes you.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Choose an occasion-specific template, personalize the colors and message, add your own photo, and share it with the whole student community.</p></section>
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Celebration categories"><button type="button" className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold ${category === "all" ? "bg-primary text-white" : "border border-line bg-white text-muted"}`} onClick={() => setCategory("all")}>All occasions</button>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <button key={key} type="button" className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold ${category === key ? "bg-primary text-white" : "border border-line bg-white text-muted"}`} onClick={() => setCategory(key as CelebrationCategory)}>{label}</button>)}</div>
    {recent.isLoading ? <LoadingState label="Discovering new celebrations" variant="panel" /> : recent.isError ? <p role="alert" className="err">Could not load recently shared celebrations: {(recent.error as Error).message}</p> : recent.data?.length ? <section className="space-y-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Fresh from campus</p><h2 className="mt-1 text-lg font-black text-fg">Recently shared</h2></div><ul className="grid gap-3 sm:grid-cols-2">{recent.data.map((card) => <li key={card.id}><CelebrationListCard card={card} /></li>)}</ul></section> : <section className="rounded-2xl border border-dashed border-primary-border bg-white px-5 py-8 text-center"><Sparkles className="mx-auto text-primary" /><h2 className="mt-3 font-extrabold text-fg">No community cards yet</h2><p className="mt-1 text-sm text-muted">Be the first to share a celebration with students across campus.</p></section>}
    {events.isLoading ? <LoadingState label="Loading upcoming celebrations" variant="panel" /> : events.isError ? <p role="alert" className="err">Could not load upcoming celebrations: {(events.error as Error).message}</p> : active.length ? <section className="space-y-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Save the date</p><h2 className="mt-1 text-lg font-black text-fg">Coming up</h2></div><ul className="space-y-3">{active.map((card) => <li key={card.id}><CelebrationListCard card={card} /></li>)}</ul></section> : <section className="rounded-2xl border border-dashed border-primary-border bg-white px-5 py-8 text-center"><CalendarDays className="mx-auto text-primary" /><h2 className="mt-3 font-extrabold text-fg">Nothing on the celebration calendar yet</h2><p className="mt-1 text-sm text-muted">Share an upcoming milestone and give your community something to look forward to.</p></section>}
    <Link to="/app/celebrations/mine" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary hover:underline">View my cards <ArrowRight size={14} /></Link>
  </div>;
}

function defaultLocalTime() {
  const date = new Date(Date.now() + 7 * 86_400_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CreateCelebrationPage() {
  const { celebrationId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = !!celebrationId;
  const existing = useQuery({ queryKey: ["celebration", celebrationId], queryFn: () => getCelebration(celebrationId), enabled: editing });
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CelebrationCategory>("birthday");
  const [celebrant, setCelebrant] = useState("");
  const [eventTime, setEventTime] = useState(defaultLocalTime);
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [message, setMessage] = useState("");
  const [venue, setVenue] = useState("");
  const [whiteshirt, setWhiteshirt] = useState("");
  const [templateId, setTemplateId] = useState("birthday-balloons");
  const [theme, setTheme] = useState<CelebrationTheme>(DEFAULT_THEME);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const templates = TEMPLATES.filter((template) => template.category === category);
  const imageUrl = useQuery({
    queryKey: ["celebration-image", photoPath],
    enabled: !!photoPath && !imageFile,
    queryFn: () => getCelebrationImageUrl(photoPath!),
    staleTime: CELEBRATION_IMAGE_URL_STALE_TIME,
    gcTime: CELEBRATION_IMAGE_URL_GC_TIME,
  });
  useEffect(() => {
    if (!existing.data || loaded) return;
    const card = existing.data;
    setTitle(card.title); setCategory(card.category); setCelebrant(card.celebrant_name);
    setEventTime(toLocalDateTimeInput(card.celebration_at));
    setMessage(card.message); setVenue(card.venue ?? ""); setWhiteshirt(card.whiteshirt_url ?? "");
    setTemplateId(card.template_id); setTheme(card.customization); setPhotoPath(card.photo_path);
    setLoaded(true);
  }, [existing.data, loaded]);
  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);
  const save = useMutation({
    mutationFn: (publish: boolean) => {
      const celebrationDate = new Date(eventTime);
      if (Number.isNaN(celebrationDate.getTime())) throw new Error("Choose a valid celebration date and time.");
      const input: SaveCelebrationInput = {
        id: celebrationId || undefined, title, category, celebrant_name: celebrant,
        celebration_at: celebrationDate.toISOString(), timezone, message, venue: venue || null,
        whiteshirt_url: whiteshirt || null, template_id: templateId, customization: theme,
        photoPath, imageFile, keepCurrentPublication: existing.data?.status === "published", publish,
      };
      const issue = validateCelebration(input);
      if (issue) throw new Error(issue);
      if (whiteshirt && !celebrationUrlSchema.safeParse(whiteshirt).success) throw new Error("Use a valid HTTPS whiteshirt.fun link.");
      return saveCelebrationCard(input);
    },
    onSuccess: async (id, publish) => {
      await qc.invalidateQueries({ queryKey: ["celebrations"] });
      await qc.invalidateQueries({ queryKey: ["celebration", id] });
      await qc.invalidateQueries({ queryKey: ["feed"] });
      if (publish) navigate(`/app/celebrations/${id}`);
      else navigate("/app/celebrations/mine");
    },
  });
  const chooseTemplate = (template: Template) => { setTemplateId(template.id); setTheme(ThemeForTemplate(template.id)); };
  const previewDate = new Date(eventTime);
  const cardPreview = { title: title || "A special celebration", category, celebrant_name: celebrant || "Your name", celebration_at: Number.isNaN(previewDate.getTime()) ? new Date().toISOString() : previewDate.toISOString(), timezone, message, whiteshirt_url: whiteshirt || null, template_id: templateId, customization: theme };
  const displayImage = imagePreview ?? imageUrl.data;
  if (editing && existing.isLoading) return <LoadingState label="Loading celebration card" variant="panel" />;
  if (editing && (existing.isError || !existing.data)) return <p role="alert" className="err">This card is unavailable or not editable.</p>;
  return <div className="space-y-5">
    <Link to={editing ? `/app/celebrations/${celebrationId}` : "/app/celebrations"} className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />{editing ? "Back to card" : "Celebrations"}</Link>
    <PageTitle eyebrow={editing ? "Personalize your card" : "Create a celebration"} title={editing ? "Edit celebration card" : "Create a celebration card"} description="Choose a design for the occasion, then make it yours. Your photo sits in a dedicated frame so the message stays clear." />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.88fr)]">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(true); }}>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
          <label className="block"><span className="label">Occasion</span><select className="input" value={category} onChange={(event) => { const next = event.target.value as CelebrationCategory; setCategory(next); const template = TEMPLATES.find((row) => row.category === next)!; chooseTemplate(template); }}>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="block"><span className="label">Card title</span><input className="input" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. A joyful birthday celebration" /></label>
          <label className="block"><span className="label">Celebrant's name</span><input className="input" required maxLength={100} value={celebrant} onChange={(event) => setCelebrant(event.target.value)} /></label>
          <label className="block"><span className="label">Date and time</span><input className="input" type="datetime-local" required value={eventTime} onChange={(event) => setEventTime(event.target.value)} /><span className="mt-1 block text-xs text-muted">Time zone: {timezone}</span></label>
          <label className="block"><span className="label">Personal message</span><textarea className="input min-h-28" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a warm message for the occasion." /></label>
          <label className="block"><span className="label">Venue <span className="font-normal text-muted">(optional)</span></span><input className="input" maxLength={200} value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Location or online event" /></label>
          <label className="block"><span className="label">Whiteshirt.fun celebration board <span className="text-danger" aria-hidden="true">*</span></span><input className="input" type="url" required maxLength={200} value={whiteshirt} onChange={(event) => setWhiteshirt(event.target.value)} placeholder="https://whiteshirt.fun/your-board" /></label>
          {whiteshirt && !celebrationUrlSchema.safeParse(whiteshirt).success && <p role="alert" className="err">Only an approved HTTPS whiteshirt.fun link is allowed.</p>}
        </section>
        <section className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
          <div><h2 className="font-extrabold text-fg">Choose your occasion template</h2><p className="mt-1 text-xs leading-5 text-muted">Every category has its own artwork and layout. Your photo appears in its own frame, separate from the text.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{templates.map((template) => <button key={template.id} type="button" aria-pressed={template.id === templateId} onClick={() => chooseTemplate(template)} className={`relative min-h-24 overflow-hidden rounded-xl border-2 p-3 text-left text-xs font-bold transition ${template.id === templateId ? "border-primary ring-2 ring-primary/15" : "border-line hover:border-primary/40"}`} style={{ backgroundImage: `linear-gradient(140deg, ${template.background}d9, ${template.background}b8), url(${CATEGORY_BACKGROUNDS[template.category]})`, backgroundPosition: "center", backgroundSize: "cover", color: template.text }}><template.icon size={22} className="mb-2" style={{ color: template.accent }} /><span className="relative z-10">{template.label}</span></button>)}</div>
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
          <div><h2 className="font-extrabold text-fg">Make it yours</h2><p className="mt-1 text-xs text-muted">Changes update the preview immediately. Reset any time.</p></div>
          <div className="grid grid-cols-3 gap-3">{([["background", "Background"], ["accent", "Accent"], ["text", "Text"]] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-muted">{label}<input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-line bg-white p-1" value={theme[key]} onChange={(event) => setTheme((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Text alignment</span><select className="input" value={theme.align} onChange={(event) => setTheme((current) => ({ ...current, align: event.target.value as CelebrationTheme["align"] }))}><option value="center">Centered</option><option value="left">Left</option><option value="right">Right</option></select></label><label><span className="label">Font style</span><select className="input" value={theme.font} onChange={(event) => setTheme((current) => ({ ...current, font: event.target.value as CelebrationTheme["font"] }))}><option value="serif">Elegant serif</option><option value="sans">Modern sans</option><option value="display">Bold display</option></select></label></div>
          <label className="block"><span className="label">Add a personal photo <span className="font-normal text-muted">(JPEG, PNG or WebP, up to 5 MB)</span></span><input className="input cursor-pointer" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setImageFile(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label>
          {imageFile && <button type="button" className="text-xs font-bold text-danger" onClick={() => setImageFile(null)}>Remove selected photo</button>}
          {(displayImage || photoPath) && <div className="grid gap-3 sm:grid-cols-3"><label><span className="label">Photo crop · horizontal</span><input className="w-full accent-primary" type="range" min={0} max={100} value={theme.photoX} onChange={(event) => setTheme((current) => ({ ...current, photoX: Number(event.target.value) }))} /></label><label><span className="label">Photo crop · vertical</span><input className="w-full accent-primary" type="range" min={0} max={100} value={theme.photoY} onChange={(event) => setTheme((current) => ({ ...current, photoY: Number(event.target.value) }))} /></label><label><span className="label">Photo zoom</span><input className="w-full accent-primary" type="range" min={0.6} max={1.6} step={0.05} value={theme.photoScale} onChange={(event) => setTheme((current) => ({ ...current, photoScale: Number(event.target.value) }))} /></label></div>}
          <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs font-bold" onClick={() => { setTheme(ThemeForTemplate(templateId)); setImageFile(null); }}>Reset template styling</button>
        </section>
        {save.isError && <p role="alert" className="err">{(save.error as Error).message}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 rounded-xl px-5 font-bold" disabled={save.isPending} onClick={() => save.mutate(false)}>{save.isPending ? "Saving…" : "Save as draft"}</button><button type="submit" className="btn-primary min-h-11 rounded-xl px-5 font-bold" disabled={save.isPending}>{save.isPending ? "Publishing…" : "Publish celebration"}</button></div>
      </form>
      <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start"><div className="flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Live preview</p><h2 className="font-extrabold text-fg">Your card</h2></div><span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold text-primary">Preview</span></div><CelebrationVisual card={cardPreview} photoUrl={displayImage} /><p className="text-xs leading-5 text-muted">Published cards are public across CampusConnect. Drafts remain visible only to you. Template artwork stays intact when you add a personal photo.</p></aside>
    </div>
  </div>;
}

export function MyCelebrationsPage() {
  const qc = useQueryClient();
  const cards = useQuery({ queryKey: ["celebrations", "mine"], queryFn: listMyCelebrations });
  const remove = useMutation({ mutationFn: deleteCelebrationCard, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["celebrations"] }); await qc.invalidateQueries({ queryKey: ["feed"] }); } });
  const [filter, setFilter] = useState<"all" | "upcoming" | "drafts" | "expired">("all");
  const shown = useMemo(() => (cards.data ?? []).filter((card) => filter === "all"
    || (filter === "drafts" && card.status === "draft")
    || (filter === "upcoming" && card.status === "published" && new Date(card.celebration_at).getTime() > Date.now())
    || (filter === "expired" && card.status === "published" && new Date(card.celebration_at).getTime() <= Date.now())), [cards.data, filter]);
  return <div className="space-y-5"><PageTitle eyebrow="Your cards" title="My Celebrations" description="Manage drafts, upcoming cards and past celebrations." action={<Link to="/app/celebrations/create" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><PartyPopper size={15} />Create card</Link>} />
    <div className="flex gap-2 overflow-x-auto">{(["all", "upcoming", "drafts", "expired"] as const).map((key) => <button key={key} type="button" className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold capitalize ${filter === key ? "bg-primary text-white" : "border border-line bg-white text-muted"}`} onClick={() => setFilter(key)}>{key}</button>)}</div>
    {cards.isLoading ? <LoadingState label="Loading your cards" variant="panel" /> : cards.isError ? <p role="alert" className="err">Could not load your celebrations: {(cards.error as Error).message}</p> : shown.length ? <ul className="space-y-3">{shown.map((card) => <li key={card.id} className="space-y-2"><CelebrationListCard card={card} /><div className="flex justify-end gap-2"><Link className="btn min-h-9 rounded-lg px-3 text-xs" to={`/app/celebrations/${card.id}/edit`}>Edit</Link><button className="btn-danger min-h-9 rounded-lg px-3 text-xs" disabled={remove.isPending} onClick={() => { if (window.confirm("Delete this celebration card?")) remove.mutate(card); }}><Trash2 size={13} className="mr-1 inline" />Delete</button></div></li>)}</ul> : <p className="card text-center text-sm text-muted">No cards match this view yet.</p>}
    {remove.isError && <p role="alert" className="err">{(remove.error as Error).message}</p>}
  </div>;
}

export function CelebrationDetailsPage() {
  const { celebrationId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const qc = useQueryClient();
  const card = useQuery({ queryKey: ["celebration", celebrationId], queryFn: () => getCelebration(celebrationId), enabled: !!celebrationId });
  const reminders = useQuery({ queryKey: ["celebration-reminders"], queryFn: listMyCelebrationReminders });
  const reminder = useMutation({
    mutationFn: ({ minutes, enabled }: { minutes: number; enabled: boolean }) => enabled ? addCelebrationReminder(celebrationId, minutes) : cancelCelebrationReminder(celebrationId, minutes),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["celebration-reminders"] }),
  });
  const remove = useMutation({ mutationFn: deleteCelebrationCard, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["celebrations"] }); await qc.invalidateQueries({ queryKey: ["feed"] }); navigate("/app/celebrations/mine"); } });
  if (card.isLoading) return <LoadingState label="Loading celebration" variant="panel" />;
  if (card.isError) return <p role="alert" className="err">Could not load this celebration.</p>;
  if (!card.data) return <p className="card">This card is not published or is not visible to your account.</p>;
  const c = card.data;
  const mine = session?.user.id === c.owner_id;
  const expired = new Date(c.celebration_at).getTime() <= Date.now();
  const activeReminders = new Set((reminders.data ?? []).filter((row) => row.card_id === c.id).map((row) => row.remind_before_minutes));
  return <div className="mx-auto max-w-3xl space-y-5"><Link to="/app/celebrations" className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />Celebrations</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><PageTitle eyebrow={CATEGORY_LABELS[c.category] ?? c.category} title={c.title} description={`For ${c.celebrant_name} · ${daysUntil(c.celebration_at)}`} />{mine && <div className="flex gap-2"><Link className="btn min-h-10 rounded-xl px-3 text-sm" to={`/app/celebrations/${c.id}/edit`}>Edit</Link><button className="btn-danger min-h-10 rounded-xl px-3 text-sm" disabled={remove.isPending} onClick={() => { if (window.confirm("Delete this card?")) remove.mutate(c); }}>Delete</button></div>}</div>
    {expired && <p className="rounded-xl bg-bg p-3 text-sm text-muted">This celebration date has passed. The public card remains in the archive; reminders are no longer available.</p>}
    <CelebrationImage card={c} />
    <section className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5"><p className="flex items-center gap-2 text-sm text-fg"><CalendarDays size={16} className="text-primary" />{new Date(c.celebration_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short", timeZone: c.timezone })}</p><p className="flex items-center gap-2 text-sm text-muted"><Clock3 size={16} className="text-primary" />{c.timezone}</p>{c.venue && <p className="text-sm text-fg sm:col-span-2">Venue: {c.venue}</p>}{c.whiteshirt_url && <a className="group flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border border-primary-border bg-gradient-to-r from-[#fff4f1] to-white px-4 py-3 transition hover:border-primary/40 hover:shadow-sm sm:col-span-2 sm:max-w-md" href={c.whiteshirt_url} target="_blank" rel="noopener noreferrer"><span><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Continue the celebration</span><span className="mt-1 block text-sm font-bold text-fg">Open their Whiteshirt board</span><span className="mt-0.5 block text-xs text-muted">whiteshirt.fun</span></span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm transition group-hover:translate-x-0.5"><ExternalLink size={16} /></span></a>}</section>
    {!expired && !mine && c.status === "published" && <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"><h2 className="font-extrabold text-fg">Set a reminder</h2><p className="mt-1 text-xs text-muted">Choose a notification reminder. Your notification preferences are respected.</p>{reminders.isLoading ? <LoadingState label="Loading reminders" /> : reminders.isError ? <p role="alert" className="err mt-2">Could not load reminders.</p> : <div className="mt-3 space-y-2">{REMINDER_OPTIONS.map((option) => <label key={option.minutes} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activeReminders.has(option.minutes)} disabled={reminder.isPending} onChange={(event) => reminder.mutate({ minutes: option.minutes, enabled: event.target.checked })} />{option.label}</label>)}</div>}{reminder.isError && <p role="alert" className="err mt-2">{(reminder.error as Error).message}</p>}</section>}
    {remove.isError && <p role="alert" className="err">{(remove.error as Error).message}</p>}
  </div>;
}
