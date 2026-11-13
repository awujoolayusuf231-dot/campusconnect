import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store, max-age=0",
};

const pathPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...corsHeaders, "Allow": "GET, OPTIONS" },
    });
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const path = new URL(request.url).searchParams.get("path");
  if (!path || !pathPattern.test(path)) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    console.error("Post image function is missing Supabase environment configuration");
    return new Response("Image service unavailable", { status: 500, headers: corsHeaders });
  }

  const viewerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await viewerClient.auth.getUser(token);
  if (authError || !userData.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { data: image, error: storageError } = await viewerClient.storage
    .from("post-images")
    .download(path);
  if (storageError || !image) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const contentType = image.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return new Response("Unsupported media type", { status: 415, headers: corsHeaders });
  }

  return new Response(image, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
