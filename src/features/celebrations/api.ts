import { supabase } from "@/lib/supabase";
import type { FeedPost, FeedScope } from "@/features/social/api";

export const CELEBRATION_IMAGE_BUCKET = "celebration-images";
export const MAX_CELEBRATION_IMAGE_BYTES = 5 * 1024 * 1024;
export const CELEBRATION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const CELEBRATION_CATEGORIES = [
  "birthday", "convocation", "graduation", "induction", "sign_out",
  "naming_ceremony", "wedding", "anniversary", "achievement", "other",
] as const;
export type CelebrationCategory = typeof CELEBRATION_CATEGORIES[number];
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
  photo_path: string | null;
  status: CelebrationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SaveCelebrationInput = Omit<CelebrationCard, "id" | "owner_id" | "published_at" | "created_at" | "updated_at" | "status" | "photo_path"> & {
  id?: string;
  photoPath?: string | null;
  imageFile?: File | null;
  keepCurrentPublication?: boolean;
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
  photo_path: string | null;
  created_at: string;
  published_at: string;
  creator_name: string;
  creator_username: string | null;
};
export type FeedTimelineItem =
  | { item_type: "post"; item_id: string; activity_at: string; item: FeedPost; rank_score?: number; ranked_at?: string }
  | { item_type: "celebration"; item_id: string; activity_at: string; item: FeedCelebration };
export type FeedTimelineCursor = {
  activity_at: string;
  item_type: FeedTimelineItem["item_type"];
  item_id: string;
  rank_score?: number;
  ranked_at?: string;
};
export type CelebrationReminder = { id: string; card_id: string; user_id: string; remind_before_minutes: number; reminder_at: string };

const CARD_SELECT = "id,owner_id,title,category,celebrant_name,celebration_at,timezone,message,venue,whiteshirt_url,template_id,customization,photo_path,status,published_at,created_at,updated_at";
const TEMPLATE_IDS = [
  "birthday-balloons", "birthday-editorial", "birthday-confetti",
  "convocation-classic", "graduation-honors", "graduation-modern",
  "induction-professional", "signout-campus", "naming-soft",
  "wedding-romance", "anniversary-elegant", "achievement-bold", "other-celebration",
];

export function validateCelebrationImage(file: File): string | null {
  if (!CELEBRATION_IMAGE_TYPES.includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size <= 0 || file.size > MAX_CELEBRATION_IMAGE_BYTES) return "The image must be smaller than 5 MB.";
  return null;
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
  if (input.whiteshirt_url && !/^https:\/\/(www\.)?whiteshirt\.fun(?:\/[A-Za-z0-9._~%/-]*)?$/i.test(input.whiteshirt_url)) return "Use a valid HTTPS whiteshirt.fun link.";
  if (!TEMPLATE_IDS.includes(input.template_id)) return "Choose a celebration template.";
  const { background, accent, text, align, font, photoX, photoY, photoScale } = input.customization;
  if (![background, accent, text].every((color) => /^#[0-9a-f]{6}$/i.test(color))) return "Choose valid template colors.";
  if (!["left", "center", "right"].includes(align) || !["serif", "sans", "display"].includes(font)) return "Choose supported text styling.";
  if (![photoX, photoY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100) || !Number.isFinite(photoScale) || photoScale < 0.6 || photoScale > 1.6) return "Reset the image position or size to a supported value.";
  if (input.imageFile) {
    const imageError = validateCelebrationImage(input.imageFile);
    if (imageError) return imageError;
  }
  return null;
}

function rpcCardArgs(input: SaveCelebrationInput, cardId: string | null, photoPath: string | null, status: CelebrationStatus) {
  return {
    p_card_id: cardId,
    p_title: input.title.trim(),
    p_category: input.category,
    p_celebrant_name: input.celebrant_name.trim(),
    p_celebration_at: input.celebration_at,
    p_timezone: input.timezone,
    p_message: input.message.trim(),
    p_venue: input.venue?.trim() || null,
    p_whiteshirt_url: input.whiteshirt_url?.trim() || null,
    p_template_id: input.template_id,
    p_customization: input.customization,
    p_photo_path: photoPath,
    p_status: status,
  };
}

async function saveCardRpc(input: SaveCelebrationInput, cardId: string | null, photoPath: string | null, status: CelebrationStatus): Promise<string> {
  const { data, error } = await supabase.rpc("save_celebration_card", rpcCardArgs(input, cardId, photoPath, status));
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
    const { data, error } = await supabase.rpc("feed_ranked_posts", {
      p_before_score: cursor?.rank_score ?? null,
      p_before: cursor?.activity_at ?? null,
      p_before_id: cursor?.item_id ?? null,
      p_as_of: cursor?.ranked_at ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as (FeedPost & { rank_score: number | string; ranked_at: string })[]).map((row) => {
      const score = Number(row.rank_score);
      if (!Number.isFinite(score) || !row.ranked_at) throw new Error("The ranked feed returned an invalid cursor.");
      return {
        item_type: "post",
        item_id: row.id,
        activity_at: row.activity_at,
        item: row,
        rank_score: score,
        ranked_at: row.ranked_at,
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
