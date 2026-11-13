import { useEffect, useState, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImagePlus, LoaderCircle, Upload } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { celebrationUrlSchema } from "@/validation/profile";
import { listActiveInstitutions } from "@/features/institutions/api";
import { InstitutionPicker } from "@/features/institutions/InstitutionPicker";
import { MAX_INPUT_IMAGE_BYTES, validateImages } from "@/features/social/api";
import { Avatar } from "@/features/social/components/Avatar";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import {
  type CoverUploadStage,
  isLegacyProfileCover,
  migrateLegacyProfileCover,
  removeProfileCover,
  resolveProfileCoverUrl,
  uploadProfileCover,
} from "./profileCover";
import { type AvatarUploadStage, uploadProfileAvatar } from "./profileAvatar";
import { WhiteshirtDialog } from "./WhiteshirtDialog";
import { LoadingState } from "@/app/LoadingState";

const schema = z.object({
  display_name: z.string().trim().min(1, "Enter your name").max(60),
  bio: z.string().max(280),
  institution_id: z.string(),
  faculty: z.string().max(100), department: z.string().max(100), academic_level: z.string().max(30),
  graduation_year: z.string().refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= 2100), "Enter a valid year"),
  location: z.string().max(80),
  interests: z.string().max(300),
  website_url: z.string().max(200).refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "Must start with https://"),
  celebration_url: z.string().max(200).refine((v) => v === "" || celebrationUrlSchema.safeParse(v).success, "Use your whiteshirt.fun link (https://whiteshirt.fun/...)"),
  show_celebration: z.boolean(),
  visibility: z.enum(["public", "institution", "private"]),
});
type Values = z.infer<typeof schema>;
const nullIfEmpty = (v: string) => (v.trim() === "" ? null : v.trim());

export function ProfileEditPage() {
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const [avatarMsg, setAvatarMsg] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverMsg, setCoverMsg] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState("");
  const [confirmRemoveCover, setConfirmRemoveCover] = useState(false);
  const [showWs, setShowWs] = useState(false);
  const celebrationsOn = useQuery({ queryKey: ["flag", "campus_celebrations"], queryFn: async () => { const { data } = await supabase.from("feature_flags").select("enabled").eq("key", "campus_celebrations").maybeSingle(); return (data as { enabled: boolean } | null)?.enabled ?? false; } });
  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const own = useQuery({ queryKey: ["own-profile", uid], enabled: !!uid, queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single(); if (error) throw error; return data as Record<string, unknown>; } });
  const coverPath = typeof own.data?.cover_path === "string" ? own.data.cover_path : null;
  const coverPreview = useQuery({
    queryKey: ["profile-cover-url", uid, coverPath],
    enabled: !!uid && !!coverPath,
    queryFn: () => resolveProfileCoverUrl(uid, coverPath),
  });
  const [selectedCoverPreview, setSelectedCoverPreview] = useState("");
  useEffect(() => {
    if (!coverFile) {
      setSelectedCoverPreview("");
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setSelectedCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const { register, control, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    values: own.data ? {
      display_name: String(own.data.display_name ?? ""), bio: String(own.data.bio ?? ""), institution_id: String(own.data.institution_id ?? ""),
      faculty: String(own.data.faculty ?? ""), department: String(own.data.department ?? ""), academic_level: String(own.data.academic_level ?? ""),
      graduation_year: own.data.graduation_year ? String(own.data.graduation_year) : "", location: String(own.data.location ?? ""),
      interests: ((own.data.interests as string[] | undefined) ?? []).join(", "), website_url: String(own.data.website_url ?? ""),
      celebration_url: String(own.data.celebration_url ?? ""), show_celebration: Boolean(own.data.show_celebration ?? true),
      visibility: (own.data.visibility as Values["visibility"]) ?? "public",
    } : undefined,
  });

  async function onSubmit(v: Values) {
    setMsg("");
    const interests = v.interests.split(",").map((s) => s.trim()).filter(Boolean);
    if (interests.length > 10) { setError("interests", { message: "At most 10 interests" }); return; }
    const { error } = await supabase.from("profiles").update({
      display_name: v.display_name.trim(), bio: nullIfEmpty(v.bio), institution_id: v.institution_id || null,
      faculty: nullIfEmpty(v.faculty), department: nullIfEmpty(v.department), academic_level: nullIfEmpty(v.academic_level),
      graduation_year: v.graduation_year ? Number(v.graduation_year) : null, location: nullIfEmpty(v.location), interests,
      website_url: nullIfEmpty(v.website_url), celebration_url: nullIfEmpty(v.celebration_url), show_celebration: v.show_celebration, visibility: v.visibility,
    }).eq("id", uid);
    if (error) { setMsg("Could not save your profile. Please check the fields and try again."); return; }
    void qc.invalidateQueries({ queryKey: ["profile"] }); void qc.invalidateQueries({ queryKey: ["own-profile"] });
    const username = String(own.data?.username ?? "");
    nav(username ? `/app/u/${username}` : "/app");
  }

  async function onAvatar(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    setAvatarMsg("");
    setAvatarUploading(true);
    try {
      await uploadProfileAvatar(uid, picked, (stage: AvatarUploadStage) => {
        setAvatarProgress(stage === "optimizing" ? "Preparing your photo…" : stage === "uploading" ? "Uploading your photo…" : "Saving your profile photo…");
      });
      setAvatarMsg("Profile photo updated.");
      void qc.invalidateQueries({ queryKey: ["own-profile"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      setAvatarMsg(error instanceof Error ? error.message : "Could not upload your profile photo. Please try again.");
    } finally {
      setAvatarUploading(false);
      setAvatarProgress("");
    }
  }

  function onSelectCover(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    setCoverMsg("");
    const problem = validateImages([picked], MAX_INPUT_IMAGE_BYTES, 1);
    if (problem) { setCoverFile(null); setCoverMsg(problem); return; }
    setCoverFile(picked);
    setCoverMsg("Preview ready. Save the cover photo when you’re happy with it.");
  }

  async function onSaveCover() {
    if (!coverFile) return;
    setCoverUploading(true);
    setCoverMsg("");
    try {
      const previousCover = typeof own.data?.cover_path === "string" ? own.data.cover_path : null;
      const { previousImageRemoved } = await uploadProfileCover(uid, coverFile, previousCover, (stage: CoverUploadStage) => {
        setCoverProgress(stage === "optimizing" ? "Preparing your cover photo…" : stage === "uploading" ? "Uploading your cover photo…" : "Saving your cover photo…");
      });
      setCoverMsg(previousCover && !previousImageRemoved
        ? "Cover image updated, but the previous image could not be removed."
        : "Cover photo updated.");
      setCoverFile(null);
      void qc.invalidateQueries({ queryKey: ["own-profile"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["profile-cover-url"] });
    } catch (error) {
      setCoverMsg(error instanceof Error ? error.message : "Could not upload the cover photo. Please try again.");
    } finally {
      setCoverUploading(false);
      setCoverProgress("");
    }
  }

  async function onRemoveCover() {
    const path = coverPath;
    if (!path) return;
    setCoverUploading(true);
    setCoverMsg("");
    try {
      const imageRemoved = await removeProfileCover(uid, path);
      setCoverMsg(imageRemoved
        ? "Cover image removed."
        : "Cover image removed from your profile, but its stored file could not be deleted.");
      setConfirmRemoveCover(false);
      setCoverFile(null);
      void qc.invalidateQueries({ queryKey: ["own-profile"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["profile-cover-url"] });
    } catch (error) {
      setCoverMsg(error instanceof Error ? error.message : "Could not remove the cover image. Please try again.");
    } finally {
      setCoverUploading(false);
    }
  }

  async function onMigrateCover() {
    if (!coverPath || !isLegacyProfileCover(coverPath)) return;
    setCoverUploading(true);
    setCoverMsg("");
    try {
      const { previousImageRemoved } = await migrateLegacyProfileCover(uid, coverPath);
      setCoverMsg(previousImageRemoved
        ? "Cover image moved to private storage."
        : "Cover image moved to private storage, but its old public copy could not be deleted.");
      void qc.invalidateQueries({ queryKey: ["own-profile"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["profile-cover-url"] });
    } catch (error) {
      setCoverMsg(error instanceof Error ? error.message : "Could not secure the existing cover image.");
    } finally {
      setCoverUploading(false);
    }
  }

  if (own.isLoading) return <LoadingState label="Preparing your profile" variant="panel" />;
  if (own.isError) return <p role="alert" className="err">Could not load your profile.</p>;
  const field = (name: keyof Values, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} className="input" {...props} {...register(name as Exclude<keyof Values, "show_celebration">)} />{errors[name] && <p className="err">{errors[name]?.message as string}</p>}</div>);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/app" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-muted transition hover:bg-white hover:text-primary">← Back to campus</Link>
      <header className="rounded-2xl border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-white p-5 sm:p-7">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Make it yours</p>
        <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-fg sm:text-3xl">Edit your profile</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Share a little about who you are and what makes your campus experience yours.</p>
      </header>
      <section aria-labelledby="profile-photo-heading" className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-[#fff4f2] p-1.5 ring-1 ring-[#f0dadd]">
              <Avatar name={String(own.data?.display_name ?? "")} path={String(own.data?.avatar_path ?? "") || null} size={88} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="profile-photo-heading" className="font-extrabold text-fg">Profile photo</h2>
            <p className="mt-1 text-sm leading-6 text-muted">This photo appears beside your name around CampusConnect.</p>
            <p className="mb-3 mt-1 text-xs leading-5 text-muted sm:mt-2">JPEG, PNG, or WebP. Large photos are resized automatically.</p>
            <label className={`btn-primary inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 font-bold shadow-sm sm:w-auto ${avatarUploading ? "pointer-events-none opacity-70" : ""}`}>
              {avatarUploading ? <LoaderCircle aria-hidden="true" size={17} className="animate-spin" /> : <ImagePlus aria-hidden="true" size={17} />}
              {avatarUploading ? "Updating Profile Photo…" : "Change Profile Photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Choose a new profile photo"
                disabled={avatarUploading}
                onChange={(event) => {
                  void onAvatar(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {avatarUploading && <p role="status" className="mt-2 text-sm text-primary">{avatarProgress}</p>}
            {avatarMsg && <p role="status" className={`mt-2 text-sm ${/failed|could not|only jpeg|too large|sign in/i.test(avatarMsg) ? "text-danger" : "text-muted"}`}>{avatarMsg}</p>}
          </div>
        </div>
      </section>
      <section aria-labelledby="cover-photo-heading" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
        <div className="border-b border-line px-4 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0ef] text-primary"><ImagePlus aria-hidden="true" size={19} /></span>
            <div>
              <h2 id="cover-photo-heading" className="font-extrabold text-fg">Cover photo</h2>
              <p className="mt-1 text-xs leading-5 text-muted sm:text-sm">Add a wide photo to personalize the top of your profile.</p>
            </div>
          </div>
        </div>
        <div
          role="img"
          aria-label={coverFile ? "Selected cover photo preview" : coverPath ? "Current profile cover photo" : "Default profile cover"}
          className="relative h-36 bg-[linear-gradient(125deg,#741923_0%,#a52432_48%,#dd6670_100%)] bg-cover bg-center sm:h-52"
          style={(selectedCoverPreview || coverPreview.data)
            ? { backgroundImage: `linear-gradient(to top, rgba(49,16,20,0.25), rgba(49,16,20,0.02)), url("${selectedCoverPreview || coverPreview.data}")` }
            : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          {coverFile && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-primary shadow-sm sm:left-4 sm:top-4">Preview</span>}
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <p className="text-xs leading-5 text-muted">JPEG, PNG, or WebP. New covers are stored privately and shown only to people who can view your profile. Existing covers in public storage remain public until replaced, removed, or moved to private storage.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className={`btn inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-line px-4 font-bold text-fg hover:border-primary hover:text-primary sm:w-auto ${coverUploading ? "pointer-events-none opacity-70" : ""}`}>
              <ImagePlus aria-hidden="true" size={17} />
              {coverFile ? "Choose Another Cover Photo" : coverPath ? "Change Cover Photo" : "Upload Cover Photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Choose a cover photo"
                disabled={coverUploading}
                onChange={(event) => {
                  onSelectCover(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {coverFile && <button type="button" className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-bold sm:w-auto" disabled={coverUploading} onClick={() => void onSaveCover()}>
              {coverUploading ? <LoaderCircle aria-hidden="true" size={17} className="animate-spin" /> : <Upload aria-hidden="true" size={17} />}
              {coverUploading ? "Saving Cover Photo…" : "Save Cover Photo"}
            </button>}
            {coverPath && <button type="button" className="btn-danger inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-bold sm:w-auto" disabled={coverUploading} onClick={() => setConfirmRemoveCover(true)}>Remove Cover Photo</button>}
            {isLegacyProfileCover(coverPath) && <button type="button" className="btn inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 font-bold sm:w-auto" disabled={coverUploading} onClick={() => void onMigrateCover()}>{coverUploading ? "Securing…" : "Make cover private"}</button>}
          </div>
          {coverUploading && <p role="status" className="flex items-center gap-2 text-sm text-primary"><LoaderCircle aria-hidden="true" size={16} className="animate-spin" />{coverProgress}</p>}
          {coverPreview.isError && <p role="alert" className="text-sm text-danger">Could not load the current cover preview. Refresh and try again.</p>}
          {coverMsg && <p role="status" className={`text-sm ${/failed|could not|too large|only manage|only jpeg|not set up|denied|confirm migration/i.test(coverMsg) ? "text-danger" : "text-muted"}`}>{coverMsg}</p>}
        </div>
      </section>
      <form className="space-y-5" onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
          <div className="border-b border-line pb-3">
            <h2 className="font-extrabold text-fg">About you</h2>
            <p className="mt-1 text-xs text-muted">Help your campus community get to know you.</p>
          </div>
        {field("display_name", "Name")}
        <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" rows={4} maxLength={280} className="input min-h-28 resize-y leading-6" placeholder="A little about you…" {...register("bio")} />{errors.bio && <p className="err">{errors.bio.message}</p>}<p className="mt-1 text-right text-xs text-muted">Up to 280 characters</p></div>
        <div><label className="label" htmlFor="institution_id">Institution (self-reported, not verified)</label>
          <Controller
            control={control}
            name="institution_id"
            render={({ field }) => (
              <InstitutionPicker
                id="institution_id"
                selectedId={field.value}
                institutions={institutions.data ?? []}
                onChange={field.onChange}
                isLoading={institutions.isLoading}
                isError={institutions.isError}
              />
            )}
          />
        </div>
        {field("faculty", "Faculty / school")}{field("department", "Department / course")}{field("academic_level", "Level (e.g. 300L, ND2)")}
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
          <div className="border-b border-line pb-3">
            <h2 className="font-extrabold text-fg">A little more</h2>
            <p className="mt-1 text-xs text-muted">Add details and interests you’d like others to see.</p>
          </div>
        <div className="grid gap-4 sm:grid-cols-2">{field("graduation_year", "Graduation year", { inputMode: "numeric" })}{field("location", "Location (city or state)")}</div>
        {field("interests", "Interests (comma separated, up to 10)")}{field("website_url", "Website (https://…)")}
        {field("celebration_url", "Your whiteshirt.fun celebration board link")}
        {celebrationsOn.data ? (
          <div className="-mt-2 space-y-1">
            <button type="button" className="btn" onClick={() => setShowWs(true)}>Create my celebration board on whiteshirt.fun</button>
            <p className="text-xs text-muted">Opens whiteshirt.fun in a pop-up right here (no new tab). When you finish, paste your board link and we fill it in. CampusConnect only links to your board; it never reads your whiteshirt.fun data.</p>
          </div>) : <p className="-mt-2 text-xs text-muted">Campus Celebrations is currently switched off by the platform.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("show_celebration")} /> Show “Celebrate on whiteshirt.fun” on my profile</label>
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
          <div className="border-b border-line pb-3">
            <h2 className="font-extrabold text-fg">Privacy</h2>
            <p className="mt-1 text-xs text-muted">Choose who can see your profile.</p>
          </div>
        <div><label className="label" htmlFor="visibility">Who can see my profile</label>
          <select id="visibility" className="input" {...register("visibility")}><option value="public">All students</option><option value="institution">Only my institution</option><option value="private">Only me</option></select></div>
        </section>
        {msg && <p role="alert" className="err">{msg}</p>}
        <div className="sticky bottom-20 z-10 rounded-2xl border border-line bg-white/95 p-3 shadow-[0_8px_26px_rgba(35,24,20,0.1)] backdrop-blur sm:bottom-4 sm:flex sm:justify-end sm:p-4">
          <button className="btn-primary min-h-11 w-full rounded-xl px-6 font-bold shadow-sm sm:w-auto" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save profile"}</button>
        </div>
      </form>
      {showWs && <WhiteshirtDialog onClose={() => setShowWs(false)} onUse={(url) => { setValue("celebration_url", url, { shouldValidate: true, shouldDirty: true }); setShowWs(false); }} />}
      {confirmRemoveCover && <ConfirmDialog title="Remove your cover image?" confirmLabel="Remove cover" busy={coverUploading} onConfirm={() => void onRemoveCover()} onCancel={() => setConfirmRemoveCover(false)}>Your profile will return to its CampusConnect background. The image file will also be deleted from your cover storage.</ConfirmDialog>}
    </div>
  );
}
