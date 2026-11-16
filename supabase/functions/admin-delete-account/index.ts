import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Account deletion function is missing Supabase server configuration.");
    return response({ error: "account_deletion_not_configured" }, 503);
  }

  let targetId: string;
  try {
    const body = await request.json() as { user_id?: unknown };
    if (typeof body.user_id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.user_id)) {
      return response({ error: "invalid_request" }, 400);
    }
    targetId = body.user_id;
  } catch {
    return response({ error: "invalid_request" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: "unauthorized" }, 401);

  const { error: approvalError } = await userClient.rpc("admin_begin_account_deletion", {
    p_target: targetId,
  });
  if (approvalError) {
    const status = approvalError.code === "42501" ? 403 : 409;
    return response({ error: approvalError.message }, status);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: deletionError } = await adminClient.auth.admin.deleteUser(targetId);
  if (deletionError) {
    const { error: restoreError } = await userClient.rpc("admin_restore_account_deletion", {
      p_target: targetId,
    });
    if (restoreError) {
      console.error("Account deletion failed and its request could not be restored.", {
        targetId,
        deleteCode: deletionError.status,
        restoreCode: restoreError.code,
      });
      return response({ error: "account_deletion_failed_request_restore_failed" }, 500);
    }
    console.error("Account deletion failed; request was restored.", {
      targetId,
      code: deletionError.status,
    });
    return response({ error: "account_deletion_failed_request_restored" }, 500);
  }

  return response({ deleted: true });
});
