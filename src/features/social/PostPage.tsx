import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchMediaPaths, type FeedPost } from "./api";
import { useAuth } from "@/features/auth/AuthProvider";
import { PostCard } from "./components/PostCard";
import { LoadingState } from "@/app/LoadingState";

// Landing page for a shared post link (/app/p/:id). Visibility is decided by the database (RLS), not by this page.
export function PostPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["post", id], queryFn: async (): Promise<{ post: FeedPost; media: string[] } | null> => {
    const { data: identity, error: identityError } = await supabase.from("posts")
      .select("author_id").eq("id", id).eq("status", "visible").maybeSingle();
    if (identityError) throw new Error(identityError.message);
    if (!identity) return null;
    const { data: visibleProfile, error: profileError } = await supabase.from("profiles")
      .select("id").eq("id", identity.author_id).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!visibleProfile) return null;
    const { data, error } = await supabase.from("posts")
      .select("id,author_id,body,created_at,edited_at,like_count,comment_count,repost_count,community_id,status,author:profiles!posts_author_id_fkey(username,display_name,avatar_path)")
      .eq("id", id).eq("status", "visible").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as { id: string; author_id: string; body: string; created_at: string; edited_at: string | null; like_count: number; comment_count: number; repost_count: number; community_id: string | null; author: { username: string; display_name: string; avatar_path: string | null } | null };
    if (!row.author) return null;
    const [liked, reposted, media] = await Promise.all([
      supabase.from("post_likes").select("post_id").eq("post_id", id).eq("user_id", me).maybeSingle(),
      supabase.from("reposts").select("post_id").eq("post_id", id).eq("user_id", me).maybeSingle(),
      fetchMediaPaths([id]),
    ]);
    if (liked.error) throw new Error(liked.error.message);
    if (reposted.error) throw new Error(reposted.error.message);
    return { media: media[id] ?? [], post: { id: row.id, author_id: row.author_id, body: row.body, created_at: row.created_at, edited_at: row.edited_at, like_count: row.like_count, comment_count: row.comment_count, repost_count: row.repost_count,
      liked_by_me: !!liked.data, reposted_by_me: !!reposted.data, username: row.author?.username ?? "", display_name: row.author?.display_name ?? "Student", avatar_path: row.author?.avatar_path ?? null,
      activity_at: row.created_at, reposter_username: null, reposter_name: null } }; },
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (q.isLoading || (!q.isError && q.data !== null)) return;
    qc.removeQueries({ queryKey: ["comments", id] });
  }, [id, q.data, q.isError, q.isLoading, qc]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-muted transition hover:bg-white hover:text-primary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <Link to="/app" className="text-sm font-semibold text-primary hover:underline">Campus feed</Link>
      </div>
      <header className="rounded-2xl border border-[#f0dadd] bg-gradient-to-r from-[#fff7f6] via-white to-[#fff3f1] px-4 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary"><MessageCircle size={14} aria-hidden="true" /> Post discussion</p>
        <h1 className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">Full post</h1>
      </header>
      {q.isLoading && <LoadingState label="Finding this post" variant="panel" />}
      {q.isError && <div role="alert" className="card"><p className="font-bold">Could not load this post.</p><button className="btn mt-3" onClick={() => void q.refetch()}>Try again</button></div>}
      {q.data === null && <div role="status" className="card text-sm text-muted">This post is not available. It may have been removed, or you may not be able to see it.</div>}
      {q.isFetching && !q.isLoading && <LoadingState label="Checking post access" variant="panel" />}
      {q.data && !q.isFetching && !q.isError && <PostCard post={q.data.post} images={q.data.media} me={me} defaultOpenComments fullPost trackImpression />}
    </main>
  );
}
