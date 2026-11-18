import { supabase } from "@/lib/supabase";
import type { FeedPost, FeedScope, FeedVariant } from "@/features/social/api";
import type { CelebrationField, CelebrationOccasion, StudioTemplate } from "./catalog";

export const CELEBRATION_IMAGE_BUCKET = "celebration-images";
export const MAX_CELEBRATION_IMAGE_BYTES = 5 * 1024 * 1024;
export const CELEBRATION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const CELEBRATION_CATEGORIES = [
  "birthday", "induction", "convocation", "sign_out", "wedding", "engagement",
  "naming_ceremony", "graduation", "anniversary", "promotion_achievement",
  "award_recognition", "housewarming", "baby_shower", "retirement",
  "cultural_celebration", "other", "achievement",
] as const;
export type CelebrationCategory = typeof CELEBRATION_CATEGORIES[number] | (string & {});
export type CelebrationVisibility = "public" | "followers" | "institution" | "private";
export type CelebrationDetails = Record<string, string>;
export type CelebrationStatus = "draft" | "published" | "cancelled";
export type CelebrationTheme = {
  background: string;
  accent: string;
  text: string;
  align: "left" | "center" | "right";
  font: "serif" | "sans" | "display";
  photoX: number;
  photoY: number;
  photoScale: number;
  layout?: "portrait" | "editorial" | "luxury" | "celebration";
  titleSize?: "small" | "medium" | "large";
  fullBleedPhoto?: boolean;
  showDecorations?: boolean;
  showCountdown?: boolean;
  qrValue?: string;
  extraText?: string;
  institutionName?: string;
};
export type CelebrationCard = {
  id: string;
  owner_id: string;
  title: string;
  category: CelebrationCategory;
  celebrant_name: string;
  celebration_at: string;
  timezone: string;
  message: string;
  venue: string | null;
  whiteshirt_url: string | null;
  template_id: string;
  customization: CelebrationTheme;
  details: CelebrationDetails;
  visibility: CelebrationVisibility;
  photo_path: string | null;
  status: CelebrationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SaveCelebrationInput = Omit<CelebrationCard, "id" | "owner_id" | "published_at" | "created_at" | "updated_at" | "status" | "photo_path" | "details" | "visibility"> & {
  id?: string;
  photoPath?: string | null;
  imageFile?: File | null;
  keepCurrentPublication?: boolean;
  details?: CelebrationDetails;
  visibility?: CelebrationVisibility;
  publish: boolean;
};
export type FeedCelebration = {
  id: string;
  title: string;
  category: CelebrationCategory;
  celebrant_name: string;
  celebration_at: string;
  timezone: string;
  message: string;
  venue: string | null;
  whiteshirt_url: string | null;
  template_id: string;
  customization: CelebrationTheme;
  details: CelebrationDetails;
  visibility: CelebrationVisibility;
  photo_path: string | null;
  created_at: string;
  published_at: string;
  creator_name: string;
  creator_username: string | null;
};
export type FeedTimelineItem =
  | { item_type: "post"; item_id: string; activity_at: string; item: FeedPost; rank_score?: number; ranked_at?: string; feed_variant?: FeedVariant }
  | { item_type: "celebration"; item_id: string; activity_at: string; item: FeedCelebration };
export type FeedTimelineCursor = {
  activity_at: string;
  item_type: FeedTimelineItem["item_type"];
  item_id: string;
  rank_score?: number;
  ranked_at?: string;
  feed_variant?: FeedVariant;
};
export type CelebrationReminder = { id: string; card_id: string; user_id: string; remind_before_minutes: number; reminder_at: string };
export type CelebrationCatalog = { occasions: CelebrationOccasion[]; templates: StudioTemplate[] };
type CelebrationOccasionRow = {
  id: string; label: string; eyebrow: string; primary_name: string; title_placeholder: string;
  message_placeholder: string; fields: CelebrationField[]; palette: [string, string, string, string];
  accent: string; text_color: string; image: string; icon: CelebrationOccasion["icon"];
  emotional_line: string; is_active: boolean;
};
type CelebrationTemplateRow = {
  id: string; occasion_id: string; name: string; description: string;
  layout: StudioTemplate["layout"]; background: string; accent: string; text_color: string;
  font: StudioTemplate["font"]; is_active: boolean; is_featured: boolean;
  preview_image_url: string | null;
};

const CARD_SELECT = "id,owner_id,title,category,celebrant_name,celebration_at,timezone,message,venue,whiteshirt_url,template_id,customization,details,visibility,photo_path,status,published_at,created_at,updated_at";

export function validateCelebrationImage(file: File): string | null {
  if (!CELEBRATION_IMAGE_TYPES.includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size <= 0 || file.size > MAX_CELEBRATION_IMAGE_BYTES) return "The image must be smaller than 5 MB.";
  return null;
}

export async function listCelebrationCatalog(): Promise<CelebrationCatalog> {
  const [occasionResult, templateResult] = await Promise.all([
    supabase.from("celebration_occasions").select("id,label,eyebrow,primary_name,title_placeholder,message_placeholder,fields,palette,accent,text_color,image,icon,emotional_line,is_active").eq("is_active", true).order("sort_order"),
    supabase.from("celebration_templates").select("id,occasion_id,name,description,layout,background,accent,text_color,font,is_active,is_featured,preview_image_url").eq("is_active", true).order("sort_order"),
  ]);
  if (occasionResult.error) throw occasionResult.error;
  if (templateResult.error) throw templateResult.error;
  return mapCelebrationCatalog(occasionResult.data ?? [], templateResult.data ?? []);
}

export async function listCelebrationCatalogForAdmin(): Promise<CelebrationCatalog> {
  const [occasionResult, templateResult] = await Promise.all([
    supabase.from("celebration_occasions").select("id,label,eyebrow,primary_name,title_placeholder,message_placeholder,fields,palette,accent,text_color,image,icon,emotional_line,is_active").order("sort_order"),
    supabase.from("celebration_templates").select("id,occasion_id,name,description,layout,background,accent,text_color,font,is_active,is_featured,preview_image_url").order("occasion_id").order("sort_order"),
  ]);
  if (occasionResult.error) throw occasionResult.error;
  if (templateResult.error) throw templateResult.error;
  return mapCelebrationCatalog(occasionResult.data ?? [], templateResult.data ?? []);
}

function mapCelebrationCatalog(occasions: CelebrationOccasionRow[], templates: CelebrationTemplateRow[]): CelebrationCatalog {
  return {
    occasions: occasions.map((row) => ({
      id: row.id, label: row.label, eyebrow: row.eyebrow, primaryName: row.primary_name,
      titlePlaceholder: row.title_placeholder, messagePlaceholder: row.message_placeholder,
      fields: row.fields, palette: row.palette, accent: row.accent, text: row.text_color,
      image: row.image, icon: row.icon, emotionalLine: row.emotional_line, is_active: row.is_active,
    })),
    templates: templates.map((row) => ({
      id: row.id, occasion_id: row.occasion_id, name: row.name, description: row.description,
      layout: row.layout, background: row.background, accent: row.accent, text: row.text_color,
      font: row.font, is_active: row.is_active, is_featured: row.is_featured,
      preview_image_url: row.preview_image_url,
    })),
  };
}

export async function saveCelebrationOccasion(occasion: CelebrationOccasion): Promise<void> {
  const { error } = await supabase.from("celebration_occasions").upsert({
    id: occasion.id,
    label: occasion.label,
    eyebrow: occasion.eyebrow,
    primary_name: occasion.primaryName,
    title_placeholder: occasion.titlePlaceholder,
    message_placeholder: occasion.messagePlaceholder,
    fields: occasion.fields,
    palette: occasion.palette,
    accent: occasion.accent,
    text_color: occasion.text,
    image: occasion.image,
    icon: occasion.icon,
    emotional_line: occasion.emotionalLine,
    is_active: occasion.is_active ?? true,
  });
  if (error) throw error;
}

export async function saveCelebrationTemplate(template: StudioTemplate): Promise<void> {
  const { error } = await supabase.from("celebration_templates").upsert({
    id: template.id,
    occasion_id: template.occasion_id,
    name: template.name,
    description: template.description,
    layout: template.layout,
    background: template.background,
    accent: template.accent,
    text_color: template.text,
    font: template.font,
    is_active: template.is_active ?? true,
    is_featured: template.is_featured ?? false,
    preview_image_url: template.preview_image_url ?? null,
  });
  if (error) throw error;
}

export async function uploadCelebrationTemplatePreview(occasionId: string, templateId: string, file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a JPEG, PNG or WebP preview image smaller than 5 MB.");
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${occasionId}/${templateId}.${extension}`;
  const { error } = await supabase.storage.from("celebration-template-previews").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("celebration-template-previews").getPublicUrl(path);
  return data.publicUrl;
}

export function validateCelebration(input: SaveCelebrationInput): string | null {
  if (input.title.trim().length < 3 || input.title.trim().length > 120) return "Title must be between 3 and 120 characters.";
  if (input.celebrant_name.trim().length < 1 || input.celebrant_name.trim().length > 100) return "Enter the celebrant's name.";
  if (!input.celebration_at || Number.isNaN(new Date(input.celebration_at).getTime())) return "Choose a valid celebration date and time.";
  if (!input.timezone || input.timezone.length > 64) return "Choose a valid timezone.";
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(new Date(input.celebration_at));
  } catch {
    return "Choose a valid timezone.";
  }
  if (input.message.length > 2000) return "Message must be 2,000 characters or fewer.";
  if ((input.venue?.length ?? 0) > 200) return "Venue must be 200 characters or fewer.";
  if (!input.whiteshirt_url?.trim()) return "A Whiteshirt.fun celebration board link is required.";
  if (!/^https:\/\/(www\.)?whiteshirt\.fun(?:\/[A-Za-z0-9._~%/-]*)?$/i.test(input.whiteshirt_url.trim())) return "Use a valid HTTPS whiteshirt.fun link.";
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(input.template_id)) return "Choose a celebration template.";
  if (!["public", "followers", "institution", "private"].includes(input.visibility ?? "public")) return "Choose a supported audience.";
  const { background, accent, text, align, font, photoX, photoY, photoScale } = input.customization;
  if (![background, accent, text].every((color) => /^#[0-9a-f]{6}$/i.test(color))) return "Choose valid template colors.";
  if (!["left", "center", "right"].includes(align) || !["serif", "sans", "display"].includes(font)) return "Choose supported text styling.";
  if (![photoX, photoY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100) || !Number.isFinite(photoScale) || photoScale < 0.6 || photoScale > 1.6) return "Reset the image position or size to a supported value.";
  if (Object.entries(input.details ?? {}).some(([key, value]) => !/^[a-z][a-z0-9_]{0,39}$/.test(key) || value.length > 300)) return "Check the additional celebration details.";
  if ((input.customization.extraText?.length ?? 0) > 300) return "Additional poster text must be 300 characters or fewer.";
  if ((input.customization.institutionName?.length ?? 0) > 120) return "Institution name must be 120 characters or fewer.";
  if ((input.customization.qrValue?.length ?? 0) > 500 || (input.customization.qrValue && !/^https:\/\//i.test(input.customization.qrValue))) return "QR links must use HTTPS and be under 500 characters.";
  if (input.imageFile) {
    const imageError = validateCelebrationImage(input.imageFile);
    if (imageError) return imageError;
  }
  return null;
}

function rpcCardArgs(input: SaveCelebrationInput, cardId: string | null, photoPath: string | null, status: CelebrationStatus) {
  return {
    p_card_id: cardId,
    p_payload: {
      title: input.title.trim(),
      category: input.category,
      celebrant_name: input.celebrant_name.trim(),
      celebration_at: input.celebration_at,
      timezone: input.timezone,
      message: input.message.trim(),
      venue: input.venue?.trim() || null,
      whiteshirt_url: input.whiteshirt_url?.trim() || null,
      template_id: input.template_id,
      customization: input.customization,
      details: input.details ?? {},
      visibility: input.visibility ?? "public",
      photo_path: photoPath,
      status,
    },
  };
}

async function saveCardRpc(input: SaveCelebrationInput, cardId: string | null, photoPath: string | null, status: CelebrationStatus): Promise<string> {
  const { data, error } = await supabase.rpc("save_celebration_studio_card", rpcCardArgs(input, cardId, photoPath, status));
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The celebration card could not be saved.");
  return data;
}

export async function saveCelebrationCard(input: SaveCelebrationInput): Promise<string> {
  const problem = validateCelebration(input);
  if (problem) throw new Error(problem);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sign in to save a celebration card.");

  const initialStatus: CelebrationStatus = input.publish && (!input.imageFile || input.keepCurrentPublication) ? "published" : "draft";
  const previousPhoto = input.photoPath ?? null;
  const initialPath = input.imageFile && !input.id ? null : previousPhoto;
  const cardId = await saveCardRpc(input, input.id ?? null, initialPath, initialStatus);
  if (!input.imageFile) return cardId;

  const file = input.imageFile;
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const photoPath = `${userId}/${cardId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(CELEBRATION_IMAGE_BUCKET).upload(photoPath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(`The card was saved, but its image could not be uploaded: ${uploadError.message}`);
  let savedId: string;
  try {
    savedId = await saveCardRpc(input, cardId, photoPath, input.publish ? "published" : "draft");
  } catch (error) {
    const { error: removeError } = await supabase.storage.from(CELEBRATION_IMAGE_BUCKET).remove([photoPath]);
    if (removeError) throw new Error(`The image was uploaded, but the card could not be updated and cleanup failed: ${removeError.message}`);
    throw error;
  }
  if (previousPhoto && previousPhoto !== photoPath) {
    const { error: removeError } = await supabase.storage.from(CELEBRATION_IMAGE_BUCKET).remove([previousPhoto]);
    if (removeError) throw new Error(`The card was saved, but the replaced image could not be removed: ${removeError.message}`);
  }
  return savedId;
}

export async function listMyCelebrations(): Promise<CelebrationCard[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return [];
  const { data, error } = await supabase.from("celebration_cards").select(CARD_SELECT)
    .eq("owner_id", userData.user.id).order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as CelebrationCard[];
}

export async function getCelebration(id: string): Promise<CelebrationCard | null> {
  const { data, error } = await supabase.from("celebration_cards").select(CARD_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as CelebrationCard | null;
}

export async function getCelebrationImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(CELEBRATION_IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  if (!data.signedUrl) throw new Error("The celebration image is unavailable.");
  return data.signedUrl;
}

export async function deleteCelebrationCard(card: CelebrationCard): Promise<void> {
  if (card.photo_path) {
    const { error: imageError } = await supabase.storage.from(CELEBRATION_IMAGE_BUCKET).remove([card.photo_path]);
    if (imageError) throw imageError;
  }
  const { error } = await supabase.rpc("delete_celebration_card", { p_card_id: card.id });
  if (error) throw error;
}

export async function fetchFeedTimeline(scope: FeedScope, cursor: FeedTimelineCursor | null, limit = 20): Promise<FeedTimelineItem[]> {
  if (scope === "for_you") {
    const { data, error } = await supabase.rpc("get_ranked_feed", {
      p_before_score: cursor?.rank_score ?? null,
      p_before: cursor?.activity_at ?? null,
      p_before_id: cursor?.item_id ?? null,
      p_as_of: cursor?.ranked_at ?? null,
      p_variant: cursor?.feed_variant ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as (FeedPost & { rank_score: number | string; ranked_at: string; feed_variant: FeedVariant })[]).map((row) => {
      const score = Number(row.rank_score);
      if (!Number.isFinite(score) || !row.ranked_at
        || !["chronological", "trending", "ranked"].includes(row.feed_variant)) {
        throw new Error("The ranked feed returned an invalid cursor.");
      }
      return {
        item_type: "post",
        item_id: row.id,
        activity_at: row.activity_at,
        item: row,
        rank_score: score,
        ranked_at: row.ranked_at,
        feed_variant: row.feed_variant,
      };
    });
  }

  const { data, error } = await supabase.rpc("feed_timeline", {
    p_scope: scope,
    p_before: cursor?.activity_at ?? null,
    p_before_type: cursor?.item_type ?? null,
    p_before_id: cursor?.item_id ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  const items: FeedTimelineItem[] = [];
  for (const row of (data ?? []) as { item_type: string; item_id: string; activity_at: string; item: unknown }[]) {
    if (row.item_type === "post") items.push({ item_type: "post", item_id: row.item_id, activity_at: row.activity_at, item: row.item as FeedPost });
    if (row.item_type === "celebration") items.push({ item_type: "celebration", item_id: row.item_id, activity_at: row.activity_at, item: row.item as FeedCelebration });
  }
  return items;
}

export async function listMyCelebrationReminders(): Promise<CelebrationReminder[]> {
  const { data, error } = await supabase.from("celebration_reminders")
    .select("id,card_id,user_id,remind_before_minutes,reminder_at").order("reminder_at");
  if (error) throw error;
  return (data ?? []) as CelebrationReminder[];
}

export async function addCelebrationReminder(cardId: string, minutes: number): Promise<void> {
  const { error } = await supabase.rpc("add_celebration_reminder", { p_card_id: cardId, p_remind_before_minutes: minutes });
  if (error) throw error;
}

export async function cancelCelebrationReminder(cardId: string, minutes: number): Promise<void> {
  const { error } = await supabase.rpc("cancel_celebration_reminder", { p_card_id: cardId, p_remind_before_minutes: minutes });
  if (error) throw error;
}

export async function listUpcomingCelebrations(category?: CelebrationCategory): Promise<CelebrationCard[]> {
  let query = supabase.from("celebration_cards").select(CARD_SELECT).eq("status", "published")
    .gt("celebration_at", new Date().toISOString())
    .order("celebration_at", { ascending: true }).limit(100);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CelebrationCard[];
}

export async function listRecentPublishedCelebrations(category?: CelebrationCategory): Promise<CelebrationCard[]> {
  let query = supabase.from("celebration_cards").select(CARD_SELECT).eq("status", "published")
    .order("published_at", { ascending: false }).limit(6);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CelebrationCard[];
}
