import { supabase } from "@/lib/supabase";

export interface Community { id: string; name: string; slug: string; description: string | null; category: string; institution_id: string | null; status: string; created_by: string | null; member_count: number; created_at: string }
export interface Member { user_id: string; role: string; status: string; joined_at: string; profile: { username: string; display_name: string; avatar_path: string | null } | null }
export const COMMUNITY_CATEGORIES: [string, string][] = [["institution", "Institution"], ["department", "Department"], ["course", "Course"], ["interest", "Interest"], ["activity", "Campus activity"], ["other", "Other"]];
const COLS = "id,name,slug,description,category,institution_id,status,created_by,member_count,created_at";
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export async function listCommunities(q: string, category: string, page: number, pageSize = 20): Promise<Community[]> {
  let query = supabase.from("communities").select(COLS).in("status", ["active", "archived"]);
  if (q.trim()) query = query.ilike("name", `%${escapeLike(q.trim())}%`);
  if (category) query = query.eq("category", category);
  const { data, error } = await query.order("member_count", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return (data ?? []) as Community[];
}
export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const { data, error } = await supabase.from("communities").select(COLS).eq("slug", slug.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data as Community | null;
}
export async function myCommunityRole(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_community_role", { p_comm: id });
  if (error) throw error;
  return (data as string | null) ?? null;
}
export async function listMembers(id: string): Promise<Member[]> {
  const { data, error } = await supabase.from("community_members").select("user_id,role,status,joined_at,profile:profiles(username,display_name,avatar_path)").eq("community_id", id).order("joined_at").limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Member[];
}
async function rpc(name: string, args: Record<string, unknown>) { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; }
export const createCommunity = (a: { name: string; slug: string; description: string; category: string; institution: string }) =>
  rpc("create_community", { p_name: a.name, p_slug: a.slug, p_description: a.description, p_category: a.category, p_institution: a.institution || null });
export const joinCommunity = (id: string) => rpc("join_community", { p_id: id });
export const leaveCommunity = (id: string) => rpc("leave_community", { p_id: id });
export const updateCommunity = (id: string, description: string) => rpc("community_update", { p_id: id, p_description: description });
export const archiveCommunity = (id: string, archived: boolean) => rpc("community_set_archived", { p_id: id, p_archived: archived });
export const setMember = (comm: string, user: string, action: string, reason?: string) => rpc("community_set_member", { p_comm: comm, p_user: user, p_action: action, p_reason: reason ?? null });
export const setPostState = (post: string, hide: boolean, reason: string) => rpc("community_set_post_state", { p_post: post, p_hide: hide, p_reason: reason });
