import { MAX_AVATAR_BYTES, MAX_INPUT_IMAGE_BYTES, validateImages } from "@/features/social/api";
import { optimizeImage } from "@/lib/image";
import { supabase } from "@/lib/supabase";

const BUCKET = "community-covers";

function assertCommunityCoverPath(communityId: string, path: string): void {
  const prefix = `${communityId}/community-cover-`;
  const filename = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (!communityId || !/^[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(filename)) {
    throw new Error("You can only manage this community’s cover image.");
  }
}

export async function communityCoverUrl(communityId: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  assertCommunityCoverPath(communityId, path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error("Could not load the community cover image.");
  return data.signedUrl;
}

export async function uploadCommunityCover(communityId: string, file: File): Promise<string> {
  const problem = validateImages([file], MAX_INPUT_IMAGE_BYTES, 1);
  if (problem) throw new Error(problem);
  const image = await optimizeImage(file, 1600, 0.82);
  if (image.size > MAX_AVATAR_BYTES) throw new Error("That cover image is too large after resizing. Choose a smaller image.");

  const extension = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : "jpg";
  const path = `${communityId}/community-cover-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, { contentType: image.type, upsert: false });
  if (error) {
    const details = error.message.toLowerCase();
    if (details.includes("bucket not found") || error.statusCode === "404") {
      throw new Error("Community cover storage is not set up. Apply migration 20261111000016_community_management.sql in Supabase.");
    }
    if (details.includes("row-level security") || details.includes("row level security") || error.statusCode === "403") {
      throw new Error("Supabase denied this cover upload. Confirm you are the active community owner and migration 20261112000018_enforce_community_settings_managers.sql is applied.");
    }
    throw new Error(`Community cover upload failed: ${error.message}`);
  }
  return path;
}

export async function removeCommunityCover(communityId: string, path: string): Promise<boolean> {
  assertCommunityCoverPath(communityId, path);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return !error;
}
