import { supabase, supabasePublishableKey, supabaseUrl } from "@/lib/supabase";
import { optimizeImage } from "@/lib/image";

export type FeedScope = "for_you" | "all" | "following" | "institution";
export type FeedVariant = "chronological" | "trending" | "ranked";
export type MainPostVisibility = "public" | "followers" | "institution" | "private";
export type PostVisibility = MainPostVisibility | "community";
export interface FeedPost {
  id: string; author_id: string; body: string; created_at: string; edited_at: string | null;
  like_count: number; comment_count: number; repost_count: number; liked_by_me: boolean; reposted_by_me: boolean;
  username: string; display_name: string; avatar_path: string | null;
  activity_at: string; reposter_username: string | null; reposter_name: string | null;
}
export interface MutedUser {
  id: string;
  username: string | null;
  display_name: string;
}
export interface Cursor { created_at: string; id: string }
export interface CommentRow {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  parent_comment_id: string | null;
  like_count: number;
  repost_count: number;
  metrics: { impressions: number; views: number } | null;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  author: { username: string; display_name: string; avatar_path: string | null } | null;
  replies: CommentRow[];
}

export const FEED_PAGE = 20;
export const COMMENT_PAGE_SIZE = 50;
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
  if (scope === "for_you") throw new Error("Use the ranked timeline API for the For you feed.");
  const { data, error } = await supabase.rpc("feed_posts", { p_scope: scope, p_before: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function recordPostViews(views: { postId: string; dwellMs: number }[]): Promise<void> {
  const dwellByPost = new Map<string, number>();
  for (const view of views) {
    if (!view.postId || !Number.isFinite(view.dwellMs) || view.dwellMs <= 0) continue;
    dwellByPost.set(view.postId, (dwellByPost.get(view.postId) ?? 0) + Math.floor(view.dwellMs));
  }

  const entries = [...dwellByPost.entries()];
  for (let start = 0; start < entries.length; start += 50) {
    const batch = entries.slice(start, start + 50);
    const { error } = await supabase.rpc("record_post_views", {
      p_post_ids: batch.map(([postId]) => postId),
      p_dwell_ms: batch.map(([, dwellMs]) => Math.min(dwellMs, 600000)),
    });
    if (error) throw error;
  }
}

export interface HashtagSuggestion { tag: string; post_count: number }
export interface TrendingHashtag { tag: string; posts: number; authors: number }
export interface PostImpressionDay { day: string; impressions: number; unique_viewers: number }
export interface PostImpressionTotals { impressions: number; days_counted: number }
export interface PostAnalytics {
  days: PostImpressionDay[];
  reach: number | null;
  totals: PostImpressionTotals | null;
}
export interface PublicPostMetrics {
  post_id: string;
  impressions: number;
  views: number;
  saved_by_me: boolean;
}
export interface MentionStudent {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
}
export interface SocialAccountAnalytics {
  profile_views: number;
  profile_views_28d: number;
  profile_unique_viewers_28d: number | null;
  post_impressions: number;
  comment_impressions: number;
  total_impressions: number;
  post_views: number;
  comment_views: number;
  total_views: number;
  post_likes: number;
  comment_likes: number;
  total_likes: number;
  comments_received: number;
  replies_received: number;
  post_reposts: number;
  comment_reshares: number;
  total_engagement: number;
}

export async function searchStudents(query: string, limit = 8): Promise<MentionStudent[]> {
  const { data, error } = await supabase.rpc("discover_students", {
    p_query: query,
    p_institution: null,
    p_department: null,
    p_level: null,
    p_interest: null,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as MentionStudent[];
}

export async function fetchMySocialAnalytics(): Promise<SocialAccountAnalytics> {
  const { data, error } = await supabase.rpc("my_social_analytics", { p_days: 28 });
  if (error) throw error;
  const row = (data as Record<string, number | string | null>[] | null)?.[0];
  if (!row) throw new Error("Your account analytics were not returned.");
  const numberValue = (key: keyof SocialAccountAnalytics) => {
    const value = row[key];
    return value === null && key === "profile_unique_viewers_28d" ? null : Number(value ?? 0);
  };
  return {
    profile_views: numberValue("profile_views") ?? 0,
    profile_views_28d: numberValue("profile_views_28d") ?? 0,
    profile_unique_viewers_28d: numberValue("profile_unique_viewers_28d"),
    post_impressions: numberValue("post_impressions") ?? 0,
    comment_impressions: numberValue("comment_impressions") ?? 0,
    total_impressions: numberValue("total_impressions") ?? 0,
    post_views: numberValue("post_views") ?? 0,
    comment_views: numberValue("comment_views") ?? 0,
    total_views: numberValue("total_views") ?? 0,
    post_likes: numberValue("post_likes") ?? 0,
    comment_likes: numberValue("comment_likes") ?? 0,
    total_likes: numberValue("total_likes") ?? 0,
    comments_received: numberValue("comments_received") ?? 0,
    replies_received: numberValue("replies_received") ?? 0,
    post_reposts: numberValue("post_reposts") ?? 0,
    comment_reshares: numberValue("comment_reshares") ?? 0,
    total_engagement: numberValue("total_engagement") ?? 0,
  };
}

export async function fetchPostPublicMetrics(postIds: string[]): Promise<Record<string, PublicPostMetrics>> {
  if (postIds.length === 0) return {};
  const uniqueIds = [...new Set(postIds)];
  const batches: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += 100) batches.push(uniqueIds.slice(index, index + 100));
  const results = await Promise.all(batches.map(async (batch) => {
    const { data, error } = await supabase.rpc("post_public_metrics", { p_post_ids: batch });
    if (error) throw error;
    return ((data ?? []) as {
      post_id: string; impressions: number | string; views: number | string; saved_by_me: boolean;
    }[]).map((row) => [row.post_id, {
      post_id: row.post_id,
      impressions: Number(row.impressions),
      views: Number(row.views),
      saved_by_me: row.saved_by_me,
    }] as const);
  }));
  return Object.fromEntries(results.flat());
}

export async function fetchSavedPosts(page = 0, pageSize = FEED_PAGE): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("saved_posts", {
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function fetchPostsByHashtag(tag: string, cursor: Cursor | null, limit = FEED_PAGE): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("posts_by_hashtag", {
    p_tag: tag,
    p_before: cursor?.created_at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function searchHashtags(prefix: string, limit = 8): Promise<HashtagSuggestion[]> {
  const { data, error } = await supabase.rpc("search_hashtags", { p_prefix: prefix, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as { tag: string; post_count: number | string }[]).map((row) => ({
    tag: row.tag,
    post_count: Number(row.post_count),
  }));
}

export async function fetchTrendingHashtags(days = 7, limit = 10): Promise<TrendingHashtag[]> {
  const { data, error } = await supabase.rpc("trending_hashtags", { p_days: days, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as { tag: string; posts: number | string; authors: number | string }[]).map((row) => ({
    tag: row.tag,
    posts: Number(row.posts),
    authors: Number(row.authors),
  }));
}

export async function fetchPostAnalytics(postId: string): Promise<PostAnalytics> {
  const [daysResult, reachResult, totalsResult] = await Promise.all([
    supabase.rpc("post_impression_stats", { p_post: postId, p_days: 28 }),
    supabase.rpc("post_reach", { p_post: postId, p_days: 28 }),
    supabase.rpc("my_posts_impression_totals", { p_post_ids: [postId] }),
  ]);
  if (daysResult.error) throw daysResult.error;
  if (reachResult.error) throw reachResult.error;
  if (totalsResult.error) throw totalsResult.error;

  const totalsRow = ((totalsResult.data ?? []) as { impressions: number | string; days_counted: number | string }[])[0];
  const reach = reachResult.data === null ? null : Number(reachResult.data);
  if (reach !== null && !Number.isFinite(reach)) throw new Error("The post reach response was invalid.");

  return {
    days: ((daysResult.data ?? []) as { day: string; impressions: number | string; unique_viewers: number | string }[]).map((row) => ({
      day: row.day,
      impressions: Number(row.impressions),
      unique_viewers: Number(row.unique_viewers),
    })),
    reach,
    totals: totalsRow ? { impressions: Number(totalsRow.impressions), days_counted: Number(totalsRow.days_counted) } : null,
  };
}

export async function fetchMediaPaths(postIds: string[]): Promise<Record<string, string[]>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase.from("post_media").select("post_id,storage_path,position").in("post_id", postIds).order("position");
  if (error) throw error;
  const rows = (data ?? []) as { post_id: string; storage_path: string; position: number }[];
  if (rows.length === 0) return {};
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    (out[r.post_id] ??= []).push(r.storage_path);
  }
  return out;
}

export async function fetchPostImage(path: string, signal?: AbortSignal): Promise<Blob> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sign in to view this image.");

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/post-image?path=${encodeURIComponent(path)}`,
    {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      ...(signal ? { signal } : {}),
    },
  );
  if (!response.ok) throw new Error("This image is no longer available.");
  return response.blob();
}

export async function createPost(
  body: string,
  files: File[],
  communityId?: string,
  visibility: PostVisibility = "public",
): Promise<{ failedImages: number }> {
  const problem = validateImages(files);
  if (problem) throw new Error(problem);
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("forbidden");
  const postVisibility = communityId ? "community" : visibility;
  const { data, error } = await supabase.from("posts")
    .insert({ body: body.trim(), visibility: postVisibility, ...(communityId ? { community_id: communityId } : {}) })
    .select("id").single();
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
export const replyToComment = (postId: string, body: string, parentCommentId: string) =>
  rpc("reply_to_comment", { p_post: postId, p_body: body, p_parent_comment: parentCommentId });
export const likeComment = (commentId: string) => rpc("comment_like", { p_comment: commentId });
export const unlikeComment = (commentId: string) => rpc("comment_unlike", { p_comment: commentId });
export const repostComment = (commentId: string) => rpc("repost_comment", { p_comment: commentId });
export const unrepostComment = (commentId: string) => rpc("unrepost_comment", { p_comment: commentId });
export const savePost = (postId: string) => rpc("save_post", { p_post: postId });
export const unsavePost = (postId: string) => rpc("unsave_post", { p_post: postId });
export const recordPostDetailView = (postId: string) => rpc("record_post_detail_view", { p_post: postId });
export const recordCommentImpressions = (commentIds: string[]) =>
  rpc("record_comment_impressions", { p_comment_ids: commentIds });
export const recordProfileView = (profileId: string) => rpc("record_profile_view", { p_profile: profileId });
export const deleteComment = (id: string) => rpc("delete_own_comment", { p_comment: id });
export const followUser = (id: string) => rpc("follow_user", { p_target: id });
export const unfollowUser = (id: string) => rpc("unfollow_user", { p_target: id });
export type ReportTarget = "user" | "post" | "comment" | "community" | "message" | "opportunity" | "assignment_discussion" | "assignment_discussion_reply";
export const submitReport = (type: ReportTarget, target: string, category: string, explanation: string) =>
  type === "assignment_discussion" || type === "assignment_discussion_reply"
    ? rpc("submit_assignment_discussion_report", { p_type: type, p_target: target, p_category: category, p_explanation: explanation || null })
    : rpc("submit_report", { p_type: type, p_target: target, p_category: category, p_explanation: explanation || null });
export async function blockUser(id: string) {
  const { error } = await supabase.from("blocks").insert({ blocked_id: id });
  if (error) throw error;
}
export async function muteUser(id: string) {
  const { error } = await supabase.rpc("mute_user", { p_user_id: id });
  if (error) throw error;
}
export async function unmuteUser(id: string) {
  const { error } = await supabase.rpc("unmute_user", { p_user_id: id });
  if (error) throw error;
}
export async function listMutedUsers(): Promise<MutedUser[]> {
  const { data: mutedRows, error: mutedError } = await supabase
    .from("muted_users")
    .select("muted_user_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (mutedError) throw mutedError;
  const ids = (mutedRows ?? []).map((row) => (row as { muted_user_id: string }).muted_user_id);
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,username,display_name")
    .in("id", ids);
  if (profilesError) throw profilesError;
  const byId = new Map((profiles ?? []).map((profile) => {
    const row = profile as { id: string; username: string; display_name: string };
    return [row.id, row] as const;
  }));
  return ids.map((id) => {
    const profile = byId.get(id);
    return {
      id,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? "Student",
    };
  });
}

export async function fetchComments(postId: string, page = 0, pageSize = COMMENT_PAGE_SIZE): Promise<CommentRow[]> {
  const columns = "id,author_id,body,created_at,edited_at,parent_comment_id,like_count,repost_count,author:profiles!comments_author_id_fkey(username,display_name,avatar_path)";
  const { data, error } = await supabase.from("comments")
    .select(columns)
    .eq("post_id", postId).eq("status", "visible").is("parent_comment_id", null)
    .order("created_at").range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  const roots = (data ?? []) as unknown as Omit<CommentRow, "liked_by_me" | "reposted_by_me" | "replies" | "metrics">[];
  const rootIds = roots.map((comment) => comment.id);
  if (rootIds.length === 0) return [];

  const { data: replyData, error: replyError } = await supabase.from("comments")
    .select(columns)
    .eq("post_id", postId).eq("status", "visible").in("parent_comment_id", rootIds)
    .order("created_at");
  if (replyError) throw replyError;
  const replies = (replyData ?? []) as unknown as Omit<CommentRow, "liked_by_me" | "reposted_by_me" | "replies" | "metrics">[];
  const ids = [...rootIds, ...replies.map((comment) => comment.id)];
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  const liked = new Set<string>();
  const reposted = new Set<string>();
  const analytics = new Map<string, { impressions: number; views: number }>();
  if (userId) {
    const analyticsBatches: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) analyticsBatches.push(ids.slice(index, index + 100));
    const [likesResult, repostsResult, analyticsResults] = await Promise.all([
      supabase.from("comment_likes").select("comment_id").eq("user_id", userId).in("comment_id", ids),
      supabase.from("comment_reposts").select("comment_id").eq("user_id", userId).in("comment_id", ids),
      Promise.all(analyticsBatches.map((batch) => supabase.rpc("my_comment_analytics", { p_comment_ids: batch }))),
    ]);
    if (likesResult.error) throw likesResult.error;
    if (repostsResult.error) throw repostsResult.error;
    for (const result of analyticsResults) if (result.error) throw result.error;
    (likesResult.data ?? []).forEach((row) => liked.add(row.comment_id as string));
    (repostsResult.data ?? []).forEach((row) => reposted.add(row.comment_id as string));
    analyticsResults.flatMap((result) => (result.data ?? []) as { comment_id: string; impressions: number | string; views: number | string }[])
      .forEach((row) => analytics.set(row.comment_id, {
        impressions: Number(row.impressions),
        views: Number(row.views),
      }));
  }
  const repliesByParent = new Map<string, CommentRow[]>();
  for (const reply of replies) {
    const row: CommentRow = { ...reply, metrics: analytics.get(reply.id) ?? null, liked_by_me: liked.has(reply.id), reposted_by_me: reposted.has(reply.id), replies: [] };
    if (reply.parent_comment_id) repliesByParent.set(reply.parent_comment_id, [...(repliesByParent.get(reply.parent_comment_id) ?? []), row]);
  }
  return roots.map((comment) => ({
    ...comment,
    metrics: analytics.get(comment.id) ?? null,
    liked_by_me: liked.has(comment.id),
    reposted_by_me: reposted.has(comment.id),
    replies: repliesByParent.get(comment.id) ?? [],
  }));
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
