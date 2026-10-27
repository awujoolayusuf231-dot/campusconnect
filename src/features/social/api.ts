import { supabase } from "@/lib/supabase";
import { optimizeImage } from "@/lib/image";

export type FeedScope = "all" | "following" | "institution";
export interface FeedPost {
  id: string; author_id: string; body: string; created_at: string; edited_at: string | null;
  like_count: number; comment_count: number; repost_count: number; liked_by_me: boolean; reposted_by_me: boolean;
  username: string; display_name: string; avatar_path: string | null;
  activity_at: string; reposter_username: string | null; reposter_name: string | null;
}
export interface Cursor { created_at: string; id: string }
export interface CommentRow { id: string; author_id: string; body: string; created_at: string; edited_at: string | null; author: { username: string; display_name: string } | null }

export const FEED_PAGE = 20;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;   // storage bucket limit (after optimisation)
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;       // storage bucket limit (after optimisation)
export const MAX_INPUT_IMAGE_BYTES = 15 * 1024 * 1024; // what a student may pick; it is shrunk before upload

export function validateImages(files: File[], maxBytes = MAX_INPUT_IMAGE_BYTES, maxCount = 4): string | null {
  if (files.length > maxCount) return `You can attach up to ${maxCount} image${maxCount === 1 ? "" : "s"}.`;
  for (const f of files) {
    if (!(f.type in IMAGE_TYPES)) return "Only JPEG, PNG or WebP images are allowed.";
    if (f.size > maxBytes) return `Each image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`;
  }
  return null;
}

export function avatarUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}

export async function fetchFeed(scope: FeedScope, cursor: Cursor | null, limit = FEED_PAGE): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("feed_posts", { p_scope: scope, p_before: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function fetchMediaUrls(postIds: string[]): Promise<Record<string, string[]>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase.from("post_media").select("post_id,storage_path,position").in("post_id", postIds).order("position");
  if (error) throw error;
  const rows = (data ?? []) as { post_id: string; storage_path: string; position: number }[];
  if (rows.length === 0) return {};
  const { data: signed } = await supabase.storage.from("post-images").createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const byPath = new Map<string, string>((signed ?? []).map((s) => [s.path ?? "", s.signedUrl] as [string, string]));
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const url = byPath.get(r.storage_path);
    if (url) (out[r.post_id] ??= []).push(url);
  }
  return out;
}

export async function createPost(body: string, files: File[], communityId?: string): Promise<{ failedImages: number }> {
  const problem = validateImages(files);
  if (problem) throw new Error(problem);
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("forbidden");
  const { data, error } = await supabase.from("posts").insert({ body: body.trim(), ...(communityId ? { community_id: communityId } : {}) }).select("id").single();
  if (error) throw error;
  const postId = (data as { id: string }).id;
  let position = 0; let failed = 0;
  for (const original of files) {
    const f = await optimizeImage(original, 1600, 0.82);
    if (f.size > MAX_POST_IMAGE_BYTES) { failed++; continue; }
    const path = `${uid}/${crypto.randomUUID()}.${IMAGE_TYPES[f.type] ?? "jpg"}`;
    const up = await supabase.storage.from("post-images").upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) { failed++; continue; }
    const ins = await supabase.from("post_media").insert({ post_id: postId, storage_path: path, position });
    if (ins.error) { failed++; await supabase.storage.from("post-images").remove([path]); continue; }
    position++;
  }
  return { failedImages: failed };
}

async function rpc(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export const likePost = (postId: string) => rpc("like_post", { p_post: postId });
export const unlikePost = (postId: string) => rpc("unlike_post", { p_post: postId });
export const repostPost = (postId: string) => rpc("repost_post", { p_post: postId });
export const unrepostPost = (postId: string) => rpc("unrepost_post", { p_post: postId });
export const deletePost = (postId: string) => rpc("delete_own_post", { p_post: postId });
export const addComment = (postId: string, body: string) => rpc("add_comment", { p_post: postId, p_body: body });
export const deleteComment = (id: string) => rpc("delete_own_comment", { p_comment: id });
export const followUser = (id: string) => rpc("follow_user", { p_target: id });
export const unfollowUser = (id: string) => rpc("unfollow_user", { p_target: id });
export type ReportTarget = "user" | "post" | "comment" | "community" | "message" | "opportunity";
export const submitReport = (type: ReportTarget, target: string, category: string, explanation: string) =>
  rpc("submit_report", { p_type: type, p_target: target, p_category: category, p_explanation: explanation || null });
export async function blockUser(id: string) {
  const { error } = await supabase.from("blocks").insert({ blocked_id: id });
  if (error) throw error;
}

export async function fetchComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase.from("comments")
    .select("id,author_id,body,created_at,edited_at,author:profiles(username,display_name)")
    .eq("post_id", postId).eq("status", "visible").order("created_at").limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as CommentRow[];
}

export const REPORT_CATEGORIES: [string, string][] = [
  ["spam", "Spam"], ["harassment", "Harassment or bullying"], ["hate", "Hate speech"], ["sexual_content", "Sexual content"],
  ["violence", "Violence or threats"], ["self_harm", "Self-harm"], ["impersonation", "Impersonation"], ["misinformation", "Misinformation"], ["other", "Something else"],
];

export interface ProfileStats { follower_count: number; following_count: number; post_count: number; repost_total: number; is_following: boolean; follows_me: boolean }
export interface Connection { user_id: string; username: string; display_name: string; avatar_path: string | null; bio: string | null; institution_id: string | null; is_following: boolean }
export async function fetchProfileStats(userId: string): Promise<ProfileStats | null> {
  const { data, error } = await supabase.rpc("get_profile_stats", { p_user: userId });
  if (error) throw error;
  const row = (data as ProfileStats[] | null)?.[0];
  return row ? { ...row, follower_count: Number(row.follower_count), following_count: Number(row.following_count), post_count: Number(row.post_count), repost_total: Number(row.repost_total) } : null;
}
export async function listConnections(userId: string, kind: "followers" | "following", page: number, pageSize = 30): Promise<Connection[]> {
  const { data, error } = await supabase.rpc("list_connections", { p_user: userId, p_kind: kind, p_limit: pageSize, p_offset: page * pageSize });
  if (error) throw error;
  return (data ?? []) as Connection[];
}
export async function fetchProfileReposts(userId: string, limit = 20): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("profile_reposts", { p_user: userId, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}
export const postShareUrl = (postId: string, origin: string = window.location.origin) => `${origin}/app/p/${postId}`;
