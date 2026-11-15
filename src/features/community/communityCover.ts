import { MAX_AVATAR_BYTES, MAX_INPUT_IMAGE_BYTES, validateImages } from "@/features/social/api";
import { optimizeImage } from "@/lib/image";
import { supabase } from "@/lib/supabase";

const BUCKET = "community-covers";
const REQUIRED_COVER_MIGRATIONS = "20261016000007_guard_account_status_visibility.sql, 20261018000008_social_core_posts_reports_moderation.sql, 20261022000009_phase5_communities_notifications_messaging.sql, 20261111000016_community_management.sql, 20261111145500_community_social_security_hardening.sql, 20261112000017_require_active_members_for_community_posts.sql, and 20261112000018_enforce_community_settings_managers.sql";

async function verifyCoverUploadAccess(communityId: string): Promise<void> {
  const [roleResult, postingResult] = await Promise.all([
    supabase.rpc("my_community_role", { p_comm: communityId }),
    supabase.rpc("account_can_post"),
  ]);
  if (roleResult.error || postingResult.error) {
    throw new Error(`Could not verify community cover permissions. Confirm the community migrations are applied in order: ${REQUIRED_COVER_MIGRATIONS}`);
  }
  if (roleResult.data !== "owner") {
    throw new Error("Only an active community owner can upload a community cover.");
  }
  if (postingResult.data !== true) {
    throw new Error("Your account is currently unable to post, so it cannot upload a community cover. Contact a CampusConnect administrator if this seems incorrect.");
  }
}

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
  if (error) {
    throw new Error(`Could not load the community cover image (HTTP ${error.statusCode ?? "unknown"}: ${error.message})`);
  }
  return data.signedUrl;
}

export async function uploadCommunityCover(communityId: string, file: File): Promise<string> {
  const problem = validateImages([file], MAX_INPUT_IMAGE_BYTES, 1);
  if (problem) throw new Error(problem);
  const image = await optimizeImage(file, 1600, 0.82);
  if (image.size > MAX_AVATAR_BYTES) throw new Error("That cover image is too large after resizing. Choose a smaller image.");
  await verifyCoverUploadAccess(communityId);

  const extension = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : "jpg";
  const path = `${communityId}/community-cover-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, { contentType: image.type, upsert: false });
  if (error) {
    const details = error.message.toLowerCase();
    if (details.includes("bucket not found") || error.statusCode === "404") {
      throw new Error("Community cover storage is not set up. Apply migration 20261111000016_community_management.sql in Supabase.");
    }
    if (details.includes("row-level security") || details.includes("row level security") || error.statusCode === "403") {
      throw new Error(`Storage denied the cover upload (HTTP ${error.statusCode ?? "unknown"}: ${error.message}) even though the app verified an active owner account that can post. Check the community-covers INSERT policies, especially community_covers_insert_manager, and apply any missing migrations in order: ${REQUIRED_COVER_MIGRATIONS}`);
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
