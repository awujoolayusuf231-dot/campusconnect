import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function rateKey(secret: string, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Signup email correction function is missing Supabase server configuration.");
    return response({ error: "email_correction_unavailable" }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return response({ error: "invalid_request" }, 413);

  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) return response({ error: "invalid_request" }, 413);
    const parsedBody: unknown = JSON.parse(rawBody);
    if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
      return response({ error: "invalid_request" }, 400);
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return response({ error: "invalid_request" }, 400);
  }

  const userId = body.user_id;
  const oldEmail = typeof body.current_email === "string" ? body.current_email.trim().toLowerCase() : "";
  const newEmail = typeof body.new_email === "string" ? body.new_email.trim().toLowerCase() : "";
  const password = body.password;
  if (typeof userId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    || !isValidEmail(oldEmail)
    || !isValidEmail(newEmail)
    || oldEmail === newEmail
    || typeof password !== "string"
    || password.length < 1
    || password.length > 72) {
    return response({ error: "invalid_request" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const emailRateKey = await rateKey(serviceRoleKey, `email:${oldEmail}`);
  const { data: emailAllowed, error: emailLimitError } = await adminClient.rpc(
    "consume_unverified_signup_email_correction_limit",
    { p_rate_key: emailRateKey, p_limit: 5 },
  );
  if (emailLimitError) {
    console.error("Signup email correction rate limit could not be checked.", emailLimitError.code);
    return response({ error: "email_correction_unavailable" }, 503);
  }
  if (!emailAllowed) return response({ error: "too_many_attempts" }, 429);

  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (clientIp) {
    const ipRateKey = await rateKey(serviceRoleKey, `ip:${clientIp}`);
    const { data: ipAllowed, error: ipLimitError } = await adminClient.rpc(
      "consume_unverified_signup_email_correction_limit",
      { p_rate_key: ipRateKey, p_limit: 30 },
    );
    if (ipLimitError) {
      console.error("Signup email correction IP limit could not be checked.", ipLimitError.code);
      return response({ error: "email_correction_unavailable" }, 503);
    }
    if (!ipAllowed) return response({ error: "too_many_attempts" }, 429);
  }

  const credentialClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: credentialError } = await credentialClient.auth.signInWithPassword({
    email: oldEmail,
    password,
  });
  if (credentialError?.code !== "email_not_confirmed") {
    return response({ error: "invalid_credentials" }, 401);
  }

  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
  const pendingUser = userData.user;
  if (userError
    || !pendingUser
    || pendingUser.email?.trim().toLowerCase() !== oldEmail
    || pendingUser.email_confirmed_at) {
    return response({ error: "invalid_credentials" }, 401);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: false,
  });
  if (updateError) {
    if (updateError.code === "email_exists") return response({ error: "email_unavailable" }, 409);
    console.error("Unverified signup email update failed.", updateError.status);
    return response({ error: "email_update_failed" }, 500);
  }

  return response({ email_updated: true });
});
