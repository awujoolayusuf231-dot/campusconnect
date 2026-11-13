import { supabase } from "@/lib/supabase";
import { MAX_AVATAR_BYTES } from "@/features/social/api";
import { optimizeImage } from "@/lib/image";

const PRIVATE_BUCKET = "profile-covers";
const PUBLIC_BUCKET = "avatars";
const PRIVATE_PATH_PREFIX = "private-cover-";

export type CoverUploadStage = "optimizing" | "uploading" | "saving";

export function isLegacyProfileCover(path: string | null): boolean {
  return !!path && bucketForPath(path) === PUBLIC_BUCKET;
}

function assertOwnedPath(userId: string, path: string): void {
  const [folder, filename, ...extra] = path.split("/");
  if (!userId || folder !== userId || extra.length > 0
    || !/^(?:cover|private-cover)-[a-zA-Z0-9-]+\.(?:jpg|png|webp)$/.test(filename ?? "")) {
    throw new Error("You can only manage your own cover image.");
  }
}

function bucketForPath(path: string): string {
  return path.slice(path.indexOf("/") + 1).startsWith(PRIVATE_PATH_PREFIX)
    ? PRIVATE_BUCKET
    : PUBLIC_BUCKET;
}

function uploadFailureMessage(error: { message: string; statusCode?: string; error?: string }): string {
  const details = `${error.message} ${error.error ?? ""}`.toLowerCase();
  if (details.includes("bucket not found") || error.statusCode === "404") {
    return "Private cover storage is not set up yet. Apply migration 20261111000015_private_profile_covers.sql in Supabase, then try again.";
  }
  if (details.includes("row-level security") || details.includes("row level security") || error.statusCode === "403") {
    return "Supabase denied the cover upload. Confirm migration 20261111000015_private_profile_covers.sql and its profile-covers Storage policies are applied.";
  }
  return `Cover image upload failed: ${error.message || "Supabase Storage returned an unknown error."}`;
}

export async function resolveProfileCoverUrl(ownerId: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  assertOwnedPath(ownerId, path);
  const bucket = bucketForPath(path);
  if (bucket === PUBLIC_BUCKET) {
    return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(path, 60);
  if (error) throw new Error("Could not load this cover image.");
  return data.signedUrl;
}

export async function uploadProfileCover(
  userId: string,
  file: File,
  previousPath: string | null,
  onStage?: (stage: CoverUploadStage) => void,
): Promise<{ path: string; previousImageRemoved: boolean }> {
  if (!userId) throw new Error("Sign in to update your cover image.");
  if (previousPath) assertOwnedPath(userId, previousPath);

  onStage?.("optimizing");
  const image = await optimizeImage(file, 1600, 0.82);
  if (image.size > MAX_AVATAR_BYTES) {
    throw new Error("That image is too large to upload. Choose a smaller image.");
  }
  const extension = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${PRIVATE_PATH_PREFIX}${crypto.randomUUID()}.${extension}`;
  onStage?.("uploading");
  const upload = await supabase.storage.from(PRIVATE_BUCKET).upload(path, image, { contentType: image.type, upsert: false });
  if (upload.error) throw new Error(uploadFailureMessage(upload.error));

  onStage?.("saving");
  const { error } = await supabase.from("profiles").update({ cover_path: path }).eq("id", userId);
  if (error) {
    const cleanup = await supabase.storage.from(PRIVATE_BUCKET).remove([path]);
    if (cleanup.error) {
      throw new Error("The cover could not be saved, and its uploaded file could not be removed. Please contact support.");
    }
    throw new Error("Could not save your cover image. Please try again.");
  }

  if (!previousPath || previousPath === path) return { path, previousImageRemoved: true };
  const { error: removeError } = await supabase.storage.from(bucketForPath(previousPath)).remove([previousPath]);
  return { path, previousImageRemoved: !removeError };
}

export async function migrateLegacyProfileCover(
  userId: string,
  path: string,
): Promise<{ path: string; previousImageRemoved: boolean }> {
  assertOwnedPath(userId, path);
  if (bucketForPath(path) !== PUBLIC_BUCKET) return { path, previousImageRemoved: true };
  const { data: image, error: downloadError } = await supabase.storage.from(PUBLIC_BUCKET).download(path);
  if (downloadError || !image) throw new Error("Could not read the existing cover image for migration.");
  const file = new File([image], path.split("/").pop() ?? "cover", { type: image.type });
  const optimized = await optimizeImage(file, 1600, 0.82);
  if (optimized.size > MAX_AVATAR_BYTES) throw new Error("The existing cover is too large to migrate. Replace it with a smaller image.");

  const extension = optimized.type === "image/webp" ? "webp" : optimized.type === "image/png" ? "png" : "jpg";
  const newPath = `${userId}/${PRIVATE_PATH_PREFIX}${crypto.randomUUID()}.${extension}`;
  const privateStorage = supabase.storage.from(PRIVATE_BUCKET);
  const upload = await privateStorage.upload(newPath, optimized, { contentType: optimized.type, upsert: false });
  if (upload.error) throw new Error("Could not move the existing cover into private storage.");

  const { data: updated, error: updateError } = await supabase.from("profiles")
    .update({ cover_path: newPath }).eq("id", userId).eq("cover_path", path).select("id").maybeSingle();
  if (updateError || !updated) {
    const cleanup = await privateStorage.remove([newPath]);
    if (cleanup.error) throw new Error("The profile changed during migration, and the new stored file could not be removed.");
    throw new Error("The profile cover changed before migration finished. Refresh and try again.");
  }

  const { error: removeError } = await supabase.storage.from(PUBLIC_BUCKET).remove([path]);
  return { path: newPath, previousImageRemoved: !removeError };
}

export async function removeProfileCover(userId: string, path: string): Promise<boolean> {
  assertOwnedPath(userId, path);
  const { error } = await supabase.from("profiles").update({ cover_path: null }).eq("id", userId);
  if (error) throw new Error("Could not remove your cover image. Please try again.");

  const { error: removeError } = await supabase.storage.from(bucketForPath(path)).remove([path]);
  return !removeError;
}
