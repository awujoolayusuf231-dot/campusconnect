import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchMediaUrls, type FeedPost } from "./api";
import { useAuth } from "@/features/auth/AuthProvider";
import { PostCard } from "./components/PostCard";

// Landing page for a shared post link (/app/p/:id). Visibility is decided by the database (RLS), not by this page.
export function PostPage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const q = useQuery({ queryKey: ["post", id], queryFn: async (): Promise<{ post: FeedPost; media: string[] } | null> => {
    const { data, error } = await supabase.from("posts").select("id,author_id,body,created_at,edited_at,like_count,comment_count,repost_count,community_id,status,author:profiles(username,display_name,avatar_path)").eq("id", id).eq("status", "visible").maybeSingle();
    if (error) throw error; if (!data) return null;
    const row = data as unknown as { id: string; author_id: string; body: string; created_at: string; edited_at: string | null; like_count: number; comment_count: number; repost_count: number; community_id: string | null; author: { username: string; display_name: string; avatar_path: string | null } | null };
    const [liked, reposted, media] = await Promise.all([
      supabase.from("post_likes").select("post_id").eq("post_id", id).maybeSingle(),
      supabase.from("reposts").select("post_id").eq("post_id", id).eq("user_id", me).maybeSingle(),
      fetchMediaUrls([id]),
    ]);
    return { media: media[id] ?? [], post: { id: row.id, author_id: row.author_id, body: row.body, created_at: row.created_at, edited_at: row.edited_at, like_count: row.like_count, comment_count: row.comment_count, repost_count: row.repost_count,
      liked_by_me: !!liked.data, reposted_by_me: !!reposted.data, username: row.author?.username ?? "", display_name: row.author?.display_name ?? "Student", avatar_path: row.author?.avatar_path ?? null,
      activity_at: row.created_at, reposter_username: null, reposter_name: null } }; } });
  return (
    <div className="space-y-3">
      <Link to="/app" className="text-sm underline">← Feed</Link>
      {q.isLoading && <p role="status">Loading…</p>}
      {q.isError && <p role="alert" className="err">Could not load this post.</p>}
      {q.data === null && <div className="card">This post is not available. It may have been removed, or you may not be able to see it.</div>}
      {q.data && <PostCard post={q.data.post} images={q.data.media} me={me} defaultOpenComments />}
    </div>
  );
}
