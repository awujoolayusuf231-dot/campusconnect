import { RoomServiceClient } from "npm:livekit-server-sdk@2.9.6";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const liveKitUrl = Deno.env.get("LIVEKIT_URL");
  const liveKitKey = Deno.env.get("LIVEKIT_API_KEY");
  const liveKitSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!supabaseUrl || !anonKey || !liveKitUrl || !liveKitKey || !liveKitSecret) {
    console.error("LiveKit room control is missing required server configuration.");
    return response({ error: "livekit_not_configured" }, 503);
  }

  let roomId: string;
  try {
    const body = await request.json() as { room_id?: unknown };
    if (typeof body.room_id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.room_id)) {
      return response({ error: "invalid_request" }, 400);
    }
    roomId = body.room_id;
  } catch {
    return response({ error: "invalid_request" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: "unauthorized" }, 401);

  const { data, error } = await userClient.rpc("voice_list_publish_permissions", { p_room: roomId });
  if (error || !data?.length) {
    if (error) console.warn("LiveKit room permission sync denied or failed.", error.code);
    return response({ error: error?.code === "42501" ? "room_manager_required" : "room_not_found" }, error?.code === "42501" ? 403 : 404);
  }

  const permissions = data as Array<{
    livekit_room: string;
    participant_identity: string;
    can_publish: boolean;
  }>;
  const livekitRoom = permissions[0].livekit_room;
  const permissionByIdentity = new Map(permissions.map((item) => [item.participant_identity, item.can_publish]));
  const apiUrl = liveKitUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  const roomService = new RoomServiceClient(apiUrl, liveKitKey, liveKitSecret);

  try {
    const participants = await roomService.listParticipants(livekitRoom);
    await Promise.all(participants.map((participant) => roomService.updateParticipant(
      livekitRoom,
      participant.identity,
      {
        permission: {
          canPublish: permissionByIdentity.get(participant.identity) ?? false,
          canSubscribe: true,
          canPublishData: true,
        },
      },
    )));
    return response({ synchronized: participants.length });
  } catch (error) {
    console.error("LiveKit participant permissions could not be synchronized.", {
      roomId,
      detail: error instanceof Error ? error.message : "unknown_error",
    });
    return response({ error: "livekit_permission_sync_failed" }, 502);
  }
});
