import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.45.0";
import { parsePaystackCallbackUrl, type VerifiedTransaction } from "./paystackLogic.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export function paystackSecret(): string | null {
  return Deno.env.get("PAYSTACK_SECRET_KEY") || null;
}

export function paystackCallbackUrl(): string | null {
  return parsePaystackCallbackUrl(Deno.env.get("PAYSTACK_CALLBACK_URL"));
}

export async function verifyPaystackTransaction(
  reference: string,
  secret: string,
): Promise<VerifiedTransaction | null> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" } },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const body = await response.json() as {
      status?: unknown;
      data?: Record<string, unknown>;
    };
    const data = body.data;
    if (
      body.status !== true
      || !data
      || typeof data.reference !== "string"
      || typeof data.status !== "string"
      || typeof data.amount !== "number"
      || !Number.isSafeInteger(data.amount)
      || typeof data.currency !== "string"
      || typeof data.id !== "number"
      || !Number.isSafeInteger(data.id)
    ) return null;
    return {
      reference: data.reference,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      id: data.id,
    };
  } catch {
    return null;
  }
}
