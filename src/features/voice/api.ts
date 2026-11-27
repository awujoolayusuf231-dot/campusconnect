import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
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
  live_started_at: string | null;
  ended_at?: string | null;
  created_at: string;
}

export interface VoicePresence {
  room_id: string;
  title: string;
  host_display_name: string | null;
  host_avatar_path: string | null;
  participant_count: number | null;
  can_join: boolean;
}

export function formatVoiceDuration(startedAt: string | null, endedAt: string | null, now = Date.now()): string {
  if (!startedAt) return "00:00:00";
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "00:00:00";
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
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

export async function listActiveVoicePresence(): Promise<VoicePresence[]> {
  const { data, error } = await supabase.rpc("voice_active_presence");
  if (error) throw error;
  return (data ?? []) as VoicePresence[];
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
  if (!error) return;
  if (error.name === "FunctionsFetchError") {
    console.error("LiveKit room-control Edge Function could not be reached.", error.message);
    throw new Error(
      "Could not reach the livekit-room-control Edge Function. Confirm it is deployed to this Supabase project with the current CORS and gateway JWT settings.",
    );
  }
  throw error;
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
  if (error instanceof FunctionsFetchError) {
    console.error("LiveKit token Edge Function could not be reached.", error.message);
    throw new Error("Could not reach the livekit-token Edge Function. Confirm it is deployed to this Supabase project and check the network connection.");
  }
  if (error instanceof FunctionsHttpError) {
    const response = error.context;
    if (response instanceof Response) {
      const body = await response.clone().text();
      let code: string | undefined;
      try {
        const parsed: unknown = JSON.parse(body);
        if (typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string") {
          code = parsed.error;
        }
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) throw parseError;
      }
      console.error("LiveKit token Edge Function returned an error.", { status: response.status, code });
      switch (code) {
        case "livekit_not_configured":
          throw new Error("LiveKit is not configured for this Supabase project. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET, then deploy livekit-token.");
        case "voice_database_not_ready":
          throw new Error("Voice Spaces token authorization is missing from this database. Apply migrations 20261115000033 and 20261115000035.");
        case "room_not_live":
          throw new Error("Only the host can start a scheduled Voice Space. Check that you are signed in as its host.");
        case "join_room_before_token":
          throw new Error("Voice Space membership could not be established. Apply migrations 20261115000033 and 20261115000035.");
        case "speaker_permission_required":
          throw new Error("Speaker permission was not granted. Confirm migration 20261115000035 is applied, then retry.");
        case "room_access_denied":
          throw new Error("Supabase denied access to this Voice Space. Confirm the room is joinable and your account is allowed to join.");
        case "unauthorized":
          throw new Error("Supabase could not validate your session for the LiveKit token function. Refresh your session or sign in again; if it persists, check the function's Supabase project URL and anon key.");
        case "token_creation_failed":
          throw new Error("LiveKit could not create a token. Verify LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET belong to the same LiveKit project.");
        default:
          throw new Error(`livekit-token returned HTTP ${response.status}${code ? ` (${code})` : ""}. Check Supabase Edge Function logs.`);
      }
    }
    throw new Error("livekit-token returned an error without a readable response. Check Supabase Edge Function logs.");
  }
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
