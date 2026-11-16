import { supabase } from "@/lib/supabase";
import { listMyCommunities } from "@/features/community/api";

export interface VoiceRoom {
  id: string;
  host_id: string;
  community_id: string | null;
  title: string;
  description: string;
  category: string;
  room_type: "personal" | "community" | "group";
  visibility: "public" | "followers" | "community" | "invite_only";
  status: "scheduled" | "live" | "ended" | "cancelled";
  mic_mode: "open" | "host_controlled";
  scheduled_at: string;
  created_at: string;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function listVoiceRooms(page = 0): Promise<VoiceRoom[]> {
  const { data, error } = await supabase.from("voice_rooms").select("*").in("status", ["live", "scheduled"])
    .order("status", { ascending: true }).order("scheduled_at", { ascending: true })
    .range(page * 20, page * 20 + 19);
  if (error) throw error;
  return (data ?? []) as VoiceRoom[];
}

export const createVoiceRoom = (input: {
  title: string; description: string; category: string; roomType: string;
  visibility: string; communityId: string | null; projectId: string | null; scheduledAt: string;
}) => rpc<string>("create_voice_room", {
  p_title: input.title, p_description: input.description, p_category: input.category,
  p_room_type: input.roomType, p_visibility: input.visibility, p_community_id: input.communityId,
  p_project_id: input.projectId, p_scheduled_at: input.scheduledAt,
});

export const joinVoiceRoom = (roomId: string) => rpc<string>("voice_join_room", { p_room: roomId });
export const requestToSpeak = (roomId: string) => rpc<void>("voice_request_to_speak", { p_room: roomId });
export const resolveRaisedHand = (roomId: string, userId: string, approve: boolean) =>
  rpc<void>("voice_resolve_hand", { p_room: roomId, p_user: userId, p_approve: approve });
export const setVoiceMicMode = (roomId: string, mode: "open" | "host_controlled") =>
  rpc<void>("voice_set_mic_mode", { p_room: roomId, p_mode: mode });
export async function syncVoiceRoomPermissions(roomId: string) {
  const { error } = await supabase.functions.invoke("livekit-room-control", { body: { room_id: roomId } });
  if (error) throw error;
}
export const setVoiceMemberRole = (roomId: string, userId: string, role: string) =>
  rpc<void>("voice_set_member_role", { p_room: roomId, p_user: userId, p_role: role });
export const endVoiceRoom = (roomId: string) => rpc<void>("voice_end_room", { p_room: roomId });
export const leaveVoiceRoom = (roomId: string) => rpc<void>("voice_leave_room", { p_room: roomId });
export const respondToVoiceInvitation = (invitationId: string, accept: boolean) =>
  rpc<void>("respond_voice_invitation", { p_invitation: invitationId, p_accept: accept });

export async function listMyVoiceCommunities(userId: string) {
  return listMyCommunities(userId);
}

export async function listMyVoiceProjects(userId: string) {
  const { data: memberships, error: memberError } = await supabase.from("project_members").select("project_id").eq("user_id", userId);
  if (memberError) throw memberError;
  const ids = [...new Set((memberships ?? []).map((membership) => membership.project_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from("projects").select("id,title").in("id", ids);
  if (error) throw error;
  return data ?? [];
}

export async function getVoiceToken(roomId: string, canPublish: boolean) {
  const { data, error } = await supabase.functions.invoke("livekit-token", { body: { room_id: roomId, can_publish: canPublish } });
  if (error) throw error;
  const result = data as { url: string; token: string };
  if (!result.url || !result.token) throw new Error("LiveKit did not return a room token.");
  return result;
}

export async function uploadVoiceCover(userId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Cover images must be 5 MB or smaller.");
  const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from("collaboration-assets").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function sendVoiceMessage(roomId: string, body: string) {
  const { error } = await supabase.from("voice_room_messages").insert({ room_id: roomId, body });
  if (error) throw error;
}
