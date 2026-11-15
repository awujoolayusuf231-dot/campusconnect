import { AccessToken } from "npm:livekit-server-sdk@2.9.6";
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
    console.error("LiveKit token service is missing required server configuration.");
    return response({ error: "livekit_not_configured" }, 503);
  }

  let roomId: string;
  let canPublish: boolean;
  try {
    const body = await request.json() as { room_id?: unknown; can_publish?: unknown };
    if (typeof body.room_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.room_id)
      || typeof body.can_publish !== "boolean") {
      return response({ error: "invalid_request" }, 400);
    }
    roomId = body.room_id;
    canPublish = body.can_publish;
  } catch {
    return response({ error: "invalid_request" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: "unauthorized" }, 401);

  const { data, error } = await userClient.rpc("voice_authorize_token", {
    p_room: roomId,
    p_can_publish: canPublish,
  });
  if (error || !data?.length) {
    if (error) console.warn("LiveKit token authorization denied.", error.code);
    return response({ error: "room_access_denied" }, 403);
  }

  const authorized = data[0] as { livekit_room: string; participant_role: string };
  const participantCanPublish = ["host", "cohost", "speaker"].includes(authorized.participant_role);
  if (canPublish && !participantCanPublish) return response({ error: "speaker_permission_required" }, 403);

  const token = new AccessToken(liveKitKey, liveKitSecret, {
    identity: userData.user.id,
    ttl: "10m",
  });
  token.addGrant({
    roomJoin: true,
    room: authorized.livekit_room,
    canPublish: canPublish && participantCanPublish,
    canSubscribe: true,
    canPublishData: true,
  });

  try {
    const jwt = await token.toJwt();
    return response({ url: liveKitUrl, token: jwt });
  } catch (error) {
    console.error("LiveKit token could not be created.", error);
    return response({ error: "token_creation_failed" }, 500);
  }
});
