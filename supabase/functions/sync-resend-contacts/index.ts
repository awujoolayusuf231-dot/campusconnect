import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contactNamesFromMetadata, syncResendContact } from "../_shared/resendContactsLogic.ts";
import { isLocalSupabaseUrl } from "../process-outbox/pushOutboxLogic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const MAX_JOBS = 20;
const MAX_CONCURRENT_JOBS = 3;

type ContactJob = {
  user_id: string;
  revision: number;
  marketing_email_consent: boolean;
  provider_unsubscribed: boolean;
  resubscribe_allowed: boolean;
};

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function finishJob(
  client: ReturnType<typeof createClient>,
  job: ContactJob,
  result: "synced" | "retry" | "failed" | "skipped",
  error: string | null,
  providerContactId: string | null = null,
  observedUnsubscribed = false,
): Promise<void> {
  const { error: finishError } = await client.rpc("finish_resend_contact_sync", {
    p_user_id: job.user_id,
    p_revision: job.revision,
    p_result: result,
    p_error: error,
    p_provider_contact_id: providerContactId,
    p_observed_unsubscribed: observedUnsubscribed,
  });
  if (finishError) throw new Error("contact_sync_status_update_failed");
}

async function syncJob(
  client: ReturnType<typeof createClient>,
  job: ContactJob,
  config: { apiKey: string; segmentId: string },
): Promise<"synced" | "retry" | "failed" | "skipped"> {
  try {
    const { data, error } = await client.auth.admin.getUserById(job.user_id);
    if (error) throw new Error("auth_user_lookup_failed");
    const user = data.user;
    if (!user?.email?.trim()) {
      await finishJob(client, job, "skipped", "recipient_email_missing");
      return "skipped";
    }
    if (!user.email_confirmed_at) {
      await finishJob(client, job, "skipped", "recipient_email_unverified");
      return "skipped";
    }

    const names = contactNamesFromMetadata(user.user_metadata);
    const result = await syncResendContact({
      apiKey: config.apiKey,
      segmentId: config.segmentId,
      email: user.email,
      firstName: names.firstName,
      lastName: names.lastName,
      marketingConsent: job.marketing_email_consent,
      emailVerified: true,
      providerUnsubscribed: job.provider_unsubscribed,
      resubscribeAllowed: job.resubscribe_allowed,
    });
    await finishJob(
      client,
      job,
      result.result,
      result.errorCode,
      result.providerContactId,
      result.providerUnsubscribed,
    );
    return result.result;
  } catch (error) {
    console.error("Resend contact sync job failed.", {
      userId: job.user_id,
      errorCode: error instanceof Error ? error.message : "unknown_error",
    });
    await finishJob(client, job, "retry", "contact_sync_processing_error");
    return "retry";
  }
}

export async function handleResendContactSync(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("CAMPUSCONNECT_CONTACT_SYNC_SECRET") ?? "";
  const providedSecret = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expectedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const segmentId = Deno.env.get("RESEND_AUDIENCE_ID");
  if (!supabaseUrl || !serviceRoleKey || !apiKey || !segmentId) {
    console.error("Resend contact sync is missing server-side configuration.");
    return Response.json({ error: "contact_sync_not_configured" }, { status: 503, headers: corsHeaders });
  }
  if (isLocalSupabaseUrl(supabaseUrl)) {
    return Response.json({ error: "contact_sync_disabled_for_local_supabase" }, { status: 503, headers: corsHeaders });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await client.rpc("claim_resend_contact_sync", { p_limit: MAX_JOBS });
    if (error) throw new Error("contact_sync_claim_failed");
    const jobs = (data ?? []) as ContactJob[];
    let nextIndex = 0;
    const results = new Array<"synced" | "retry" | "failed" | "skipped">(jobs.length);
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_JOBS, jobs.length) }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= jobs.length) return;
        results[index] = await syncJob(client, jobs[index], { apiKey, segmentId });
      }
    }));
    return Response.json({
      claimed: jobs.length,
      synced: results.filter((result) => result === "synced").length,
      failed: results.filter((result) => result === "failed").length,
      retried: results.filter((result) => result === "retry").length,
      skipped: results.filter((result) => result === "skipped").length,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Resend contact sync worker failed.", {
      errorCode: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json({ error: "contact_sync_processing_failed" }, { status: 500, headers: corsHeaders });
  }
}

Deno.serve(handleResendContactSync);
