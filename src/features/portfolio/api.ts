import { supabase } from "@/lib/supabase";
import { MAX_INPUT_IMAGE_BYTES, validateImages } from "@/features/social/api";
import { optimizeImage } from "@/lib/image";

export const PORTFOLIO_ASSET_BUCKET = "student-portfolio-assets";
export const PORTFOLIO_TEMPLATES = ["minimal", "modern", "professional", "creative", "developer", "academic"] as const;
export const PORTFOLIO_ITEM_TYPES = ["skill", "project", "education", "experience", "achievement", "certificate"] as const;

export type PortfolioTemplate = typeof PORTFOLIO_TEMPLATES[number];
export type PortfolioItemType = typeof PORTFOLIO_ITEM_TYPES[number];
export type PortfolioFields = {
  id: string;
  owner_id: string;
  slug: string;
  display_name: string;
  avatar_path: string | null;
  headline: string | null;
  summary: string | null;
  contact_email: string | null;
  show_contact_email: boolean;
  location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  template_key: PortfolioTemplate;
  accent_color: string;
  section_order: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
};
export type PortfolioItem = {
  id: string;
  portfolio_id: string;
  item_type: PortfolioItemType;
  content: Record<string, unknown>;
  image_path: string | null;
  sort_order: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};
export type StudentPortfolio = PortfolioFields & { items: PortfolioItem[] };
export type PortfolioInput = Pick<PortfolioFields,
  "slug" | "display_name" | "avatar_path" | "headline" | "summary" | "contact_email" |
  "show_contact_email" | "location" | "website_url" | "linkedin_url" | "github_url" |
  "template_key" | "accent_color" | "section_order" | "is_public"
>;
export type PortfolioItemInput = {
  item_type: PortfolioItemType;
  content: Record<string, unknown>;
  is_public: boolean;
  sort_order: number;
  image_path?: string | null;
};
export type PublicPortfolio = Omit<PortfolioFields, "owner_id" | "created_at" | "updated_at" | "is_public" | "show_contact_email"> & {
  items: Array<Pick<PortfolioItem, "id" | "item_type" | "content" | "image_path" | "sort_order">>;
};

const PROFILE_SELECT = "id,username,display_name,bio,avatar_path,institution_id,faculty,department,academic_level,graduation_year,location,website_url";

function trimmed(value: string | null | undefined): string | null {
  const result = value?.trim() ?? "";
  return result || null;
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validatePortfolio(input: PortfolioInput): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(input.slug)) return "Use a public link slug with 3–30 lowercase letters, numbers, or hyphens.";
  if (input.display_name.trim().length < 1 || input.display_name.trim().length > 100) return "Enter a display name of up to 100 characters.";
  if ((input.headline?.length ?? 0) > 120 || (input.summary?.length ?? 0) > 2000) return "Your headline or summary is too long.";
  if ((input.contact_email?.length ?? 0) > 254 || (input.location?.length ?? 0) > 100) return "Check your contact email and location.";
  if (input.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact_email)) return "Enter a valid contact email.";
  if ([input.website_url, input.linkedin_url, input.github_url].some((value) => (value?.length ?? 0) > 300)) return "Portfolio links must be 300 characters or fewer.";
  if (![input.website_url, input.linkedin_url, input.github_url].every(isHttpsUrl)) return "Portfolio links must use HTTPS.";
  if (input.linkedin_url && !/^https:\/\/(www\.)?linkedin\.com\/\S+$/i.test(input.linkedin_url)) return "Use a LinkedIn profile URL.";
  if (input.github_url && !/^https:\/\/(www\.)?github\.com\/\S+$/i.test(input.github_url)) return "Use a GitHub profile URL.";
  if (input.template_key && !PORTFOLIO_TEMPLATES.includes(input.template_key)) return "Choose a supported portfolio template.";
  if (!/^#[0-9a-f]{6}$/i.test(input.accent_color)) return "Choose a valid accent color.";
  return null;
}

export function validatePortfolioItem(input: PortfolioItemInput): string | null {
  const text = (key: string) => {
    const value = input.content[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const bounded = (key: string, max: number) => text(key).length <= max;
  if (!PORTFOLIO_ITEM_TYPES.includes(input.item_type)) return "Choose a supported portfolio section.";
  if (!Number.isInteger(input.sort_order) || input.sort_order < -32768 || input.sort_order > 32767) return "Portfolio item order is out of range.";
  if (input.item_type === "skill") {
    if (!text("name") || !bounded("name", 80) || !bounded("category", 50) || !bounded("description", 300)) return "Add a skill name and keep its details within the limits.";
    if (!["Beginner", "Intermediate", "Advanced", "Expert"].includes(text("proficiency"))) return "Choose a skill proficiency level.";
  } else {
    if (!text("title") || !bounded("title", 120)) return "Enter a title of up to 120 characters.";
    if (!bounded("description", 2000)) return "Descriptions must be 2,000 characters or fewer.";
  }
  for (const key of ["url", "project_url", "github_url", "credential_url"]) {
    if (!isHttpsUrl(input.content[key])) return "Links must use HTTPS.";
  }
  if (input.image_path && !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(input.image_path)) {
    return "The project image path is invalid.";
  }
  return null;
}

export function portfolioCompletion(portfolio: StudentPortfolio | null): number {
  if (!portfolio) return 0;
  const completed = [
    !!portfolio.display_name,
    !!portfolio.headline,
    !!portfolio.summary,
    portfolio.items.some((item) => item.item_type === "education"),
    portfolio.items.some((item) => item.item_type === "skill"),
    portfolio.items.some((item) => item.item_type === "project"),
    portfolio.items.some((item) => item.item_type === "experience"),
  ].filter(Boolean).length;
  return Math.round(completed / 7 * 100);
}

export async function getOwnProfileForPortfolio() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to manage your portfolio.");
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", userData.user.id).single();
  if (error) throw error;
  return data as {
    id: string; username: string; display_name: string; bio: string | null; avatar_path: string | null;
    institution_id: string | null; faculty: string | null; department: string | null;
    academic_level: string | null; graduation_year: number | null; location: string | null; website_url: string | null;
  };
}

export async function getMyPortfolio(): Promise<StudentPortfolio | null> {
  const { data: portfolio, error } = await supabase.from("student_portfolios").select("*").maybeSingle();
  if (error) throw error;
  if (!portfolio) return null;
  const { data: items, error: itemError } = await supabase
    .from("student_portfolio_items").select("*").eq("portfolio_id", portfolio.id)
    .order("sort_order").order("created_at");
  if (itemError) throw itemError;
  return { ...portfolio, items: (items ?? []) as PortfolioItem[] } as StudentPortfolio;
}

export async function savePortfolio(input: PortfolioInput, existingId?: string): Promise<string> {
  const problem = validatePortfolio(input);
  if (problem) throw new Error(problem);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to save your portfolio.");
  const payload = {
    ...input,
    slug: input.slug.trim().toLowerCase(),
    display_name: input.display_name.trim(),
    headline: trimmed(input.headline),
    summary: trimmed(input.summary),
    contact_email: trimmed(input.contact_email),
    location: trimmed(input.location),
    website_url: trimmed(input.website_url),
    linkedin_url: trimmed(input.linkedin_url),
    github_url: trimmed(input.github_url),
  };
  if (existingId) {
    const { data, error } = await supabase.from("student_portfolios").update(payload).eq("id", existingId).select("id").single();
    if (error) throw error;
    return data.id as string;
  }
  const { data, error } = await supabase.from("student_portfolios")
    .insert({ ...payload, owner_id: userData.user.id }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function savePortfolioItem(
  portfolioId: string,
  input: PortfolioItemInput,
  itemId?: string,
  imageFile?: File | null,
  removeImage = false,
): Promise<void> {
  const problem = validatePortfolioItem(input);
  if (problem) throw new Error(problem);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to edit portfolio items.");
  let uploadedPath: string | null = null;
  const oldPath = input.image_path ?? null;
  if (imageFile) {
    if (input.item_type !== "project") throw new Error("Images can only be added to project items.");
    const invalid = validateImages([imageFile], MAX_INPUT_IMAGE_BYTES, 1);
    if (invalid) throw new Error(invalid);
    const optimized = await optimizeImage(imageFile, 1600, 0.82);
    if (optimized.size > 5 * 1024 * 1024) throw new Error("The project image must be smaller than 5 MB after resizing.");
    const extension = optimized.type === "image/webp" ? "webp" : optimized.type === "image/png" ? "png" : "jpg";
    uploadedPath = `${userData.user.id}/${portfolioId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(PORTFOLIO_ASSET_BUCKET)
      .upload(uploadedPath, optimized, { contentType: optimized.type, upsert: false });
    if (error) throw new Error(`Project image upload failed: ${error.message}`);
  }
  const nextPath = uploadedPath ?? (removeImage ? null : oldPath);
  const payload = { ...input, image_path: nextPath };
  try {
    const result = itemId
      ? await supabase.from("student_portfolio_items").update(payload).eq("id", itemId).eq("portfolio_id", portfolioId).select("id").single()
      : await supabase.from("student_portfolio_items").insert({ ...payload, portfolio_id: portfolioId }).select("id").single();
    if (result.error) throw result.error;
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage.from(PORTFOLIO_ASSET_BUCKET).remove([uploadedPath]);
      if (cleanupError) throw new Error("The project item could not be saved, and its uploaded image could not be removed.");
    }
    throw error;
  }
  if ((uploadedPath && oldPath && uploadedPath !== oldPath) || (removeImage && oldPath)) {
    const pathToRemove = oldPath;
    if (pathToRemove) {
      const { error } = await supabase.storage.from(PORTFOLIO_ASSET_BUCKET).remove([pathToRemove]);
      if (error) throw new Error("The item was saved, but its previous project image could not be removed.");
    }
  }
}

export async function deletePortfolioItem(portfolioId: string, item: PortfolioItem): Promise<void> {
  const { error } = await supabase.from("student_portfolio_items").delete().eq("id", item.id).eq("portfolio_id", portfolioId);
  if (error) throw error;
  if (item.image_path) {
    const { error: removeError } = await supabase.storage.from(PORTFOLIO_ASSET_BUCKET).remove([item.image_path]);
    if (removeError) throw new Error("Portfolio item deleted, but its project image could not be removed.");
  }
}

export async function portfolioImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PORTFOLIO_ASSET_BUCKET).createSignedUrl(path, 60);
  if (error) throw new Error(`Could not load a portfolio project image: ${error.message}`);
  return data.signedUrl;
}

export function portfolioAvatarUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}

export async function getPublicPortfolio(slug: string): Promise<PublicPortfolio | null> {
  const { data, error } = await supabase.rpc("get_public_student_portfolio", { p_slug: slug });
  if (error) throw error;
  return (data as PublicPortfolio | null) ?? null;
}
