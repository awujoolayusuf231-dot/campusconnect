import { useState, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { celebrationUrlSchema } from "@/validation/profile";
import { listActiveInstitutions } from "@/features/institutions/api";
import { MAX_AVATAR_BYTES, MAX_INPUT_IMAGE_BYTES, validateImages } from "@/features/social/api";
import { optimizeImage } from "@/lib/image";
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
  const [showWs, setShowWs] = useState(false);
  const celebrationsOn = useQuery({ queryKey: ["flag", "campus_celebrations"], queryFn: async () => { const { data } = await supabase.from("feature_flags").select("enabled").eq("key", "campus_celebrations").maybeSingle(); return (data as { enabled: boolean } | null)?.enabled ?? false; } });
  const institutions = useQuery({ queryKey: ["institutions", "active"], queryFn: listActiveInstitutions });
  const own = useQuery({ queryKey: ["own-profile", uid], enabled: !!uid, queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single(); if (error) throw error; return data as Record<string, unknown>; } });

  const { register, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
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
    const picked = files?.[0]; if (!picked) return;
    const problem = validateImages([picked], MAX_INPUT_IMAGE_BYTES, 1);
    if (problem) { setAvatarMsg(problem); return; }
    const f = await optimizeImage(picked, 512, 0.85);
    if (f.size > MAX_AVATAR_BYTES) { setAvatarMsg("That photo is too large even after shrinking. Try a smaller one."); return; }
    const ext = f.type === "image/webp" ? "webp" : f.type === "image/png" ? "png" : "jpg";
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) { setAvatarMsg("Upload failed."); return; }
    const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", uid);
    setAvatarMsg(error ? "Could not save the photo." : "Photo updated.");
    void qc.invalidateQueries({ queryKey: ["own-profile"] });
  }

  if (own.isLoading) return <LoadingState label="Preparing your profile" variant="panel" />;
  if (own.isError) return <p role="alert" className="err">Could not load your profile.</p>;
  const field = (name: keyof Values, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} className="input" {...props} {...register(name as Exclude<keyof Values, "show_celebration">)} />{errors[name] && <p className="err">{errors[name]?.message as string}</p>}</div>);
  return (
    <div className="space-y-4">
      <Link to="/app" className="text-sm underline">← Back</Link>
      <h1 className="text-2xl font-semibold">Edit profile</h1>
      <section className="card space-y-2"><label className="label" htmlFor="avatar">Profile photo (JPEG/PNG/WebP; large photos are shrunk automatically)</label>
        <input id="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void onAvatar(e.target.files)} />{avatarMsg && <p role="status" className="text-sm">{avatarMsg}</p>}</section>
      <form className="card space-y-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        {field("display_name", "Name")}
        <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" rows={3} maxLength={280} className="input" {...register("bio")} />{errors.bio && <p className="err">{errors.bio.message}</p>}</div>
        <div><label className="label" htmlFor="institution_id">Institution (self-reported, not verified)</label>
          <select id="institution_id" className="input" {...register("institution_id")}><option value="">None</option>{(institutions.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        {field("faculty", "Faculty / school")}{field("department", "Department / course")}{field("academic_level", "Level (e.g. 300L, ND2)")}
        {field("graduation_year", "Graduation year", { inputMode: "numeric" })}{field("location", "Location (city or state)")}
        {field("interests", "Interests (comma separated, up to 10)")}{field("website_url", "Website (https://…)")}
        {field("celebration_url", "Your whiteshirt.fun celebration board link")}
        {celebrationsOn.data ? (
          <div className="-mt-2 space-y-1">
            <button type="button" className="btn" onClick={() => setShowWs(true)}>Create my celebration board on whiteshirt.fun</button>
            <p className="text-xs text-muted">Opens whiteshirt.fun in a pop-up right here (no new tab). When you finish, paste your board link and we fill it in. CampusConnect only links to your board; it never reads your whiteshirt.fun data.</p>
          </div>) : <p className="-mt-2 text-xs text-muted">Campus Celebrations is currently switched off by the platform.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("show_celebration")} /> Show “Celebrate on whiteshirt.fun” on my profile</label>
        <div><label className="label" htmlFor="visibility">Who can see my profile</label>
          <select id="visibility" className="input" {...register("visibility")}><option value="public">All students</option><option value="institution">Only my institution</option><option value="private">Only me</option></select></div>
        {msg && <p role="alert" className="err">{msg}</p>}
        <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save profile"}</button>
      </form>
      {showWs && <WhiteshirtDialog onClose={() => setShowWs(false)} onUse={(url) => { setValue("celebration_url", url, { shouldValidate: true, shouldDirty: true }); setShowWs(false); }} />}
    </div>
  );
}
