import { supabase } from "@/lib/supabase";
import { MAX_AVATAR_BYTES, MAX_INPUT_IMAGE_BYTES, validateImages } from "@/features/social/api";
import { optimizeImage } from "@/lib/image";

export type AvatarUploadStage = "optimizing" | "uploading" | "saving";

export async function uploadProfileAvatar(
  userId: string,
  file: File,
  onStage?: (stage: AvatarUploadStage) => void,
): Promise<string> {
  if (!userId) throw new Error("Sign in to update your profile photo.");
  const validationError = validateImages([file], MAX_INPUT_IMAGE_BYTES, 1);
  if (validationError) throw new Error(validationError);

  onStage?.("optimizing");
  const image = await optimizeImage(file, 512, 0.85);
  if (image.size > MAX_AVATAR_BYTES) {
    throw new Error("That photo is too large even after shrinking. Try a smaller one.");
  }

  const extension = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  onStage?.("uploading");
  const storage = supabase.storage.from("avatars");
  const upload = await storage.upload(path, image, { contentType: image.type, upsert: false });
  if (upload.error) throw new Error("Profile photo upload failed. Please try again.");

  onStage?.("saving");
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) {
    const cleanup = await storage.remove([path]);
    if (cleanup.error) {
      throw new Error("The photo could not be saved, and its uploaded file could not be removed. Please contact support.");
    }
    throw new Error("Could not save your profile photo. Please try again.");
  }
  return path;
}
