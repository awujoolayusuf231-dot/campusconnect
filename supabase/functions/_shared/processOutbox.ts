import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decideDelivery,
  effectiveAccountStatus,
  isLocalSupabaseUrl,
  preferenceForNotification,
  pushCopy,
  shouldSendPush,
  type DeviceResult,
} from "../process-outbox/pushOutboxLogic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUSH_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const MAX_JOBS = 20;
const MAX_CONCURRENT_JOBS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

type PushJob = {
  outbox_id: number;
  user_id: string;
  notification_type: string;
  entity_type: string | null;
  entity_id: string | null;
  tokens: string[];
};
type FirebaseAccount = { client_email: string; private_key: string; project_id: string };
type PushPreferences = {
  notify_push: boolean;
  notify_follows: boolean;
  notify_likes: boolean;
  notify_comments: boolean;
  notify_community: boolean;
  notify_messages: boolean;
  notify_discussions: boolean;
};

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodePem(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function firebaseAccessToken(account: FirebaseAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: PUSH_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePem(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error("Firebase OAuth token request failed.");
  }
  return result.access_token;
}

async function sendToDevice(
  projectId: string,
  accessToken: string,
  token: string,
  notificationType: string,
  entityType: string | null,
  entityId: string | null,
): Promise<DeviceResult> {
  const copy = pushCopy(notificationType);
  const url = notificationType === "celebration_reminder"
      && entityType === "celebration"
      && entityId
    ? `/app/celebrations/${encodeURIComponent(entityId)}`
    : copy.url;
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            data: { ...copy, url },
            webpush: { headers: { TTL: "86400", Urgency: "normal" } },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const result = await response.json().catch(() => ({}));
    const invalidToken = result?.error?.status === "UNREGISTERED";
    return { ok: response.ok, invalidToken, retryable: !response.ok && !invalidToken };
  } catch {
    return { ok: false, invalidToken: false, retryable: true };
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    difference |= (a[i % (a.length || 1)] ?? 0) ^ (b[i % (b.length || 1)] ?? 0);
  }
  return difference === 0;
}

async function finishJob(
  client: ReturnType<typeof createClient>,
  job: PushJob,
  result: "delivered" | "retry" | "failed",
  error: string | null,
): Promise<void> {
  const { error: finishError } = await client.rpc("finish_push_outbox", {
    p_outbox_id: job.outbox_id,
    p_result: result,
    p_error: error,
  });
  if (finishError) throw new Error(`Could not finish outbox job ${job.outbox_id}.`);
}

async function recheckEligibility(
  client: ReturnType<typeof createClient>,
  job: PushJob,
): Promise<{ eligible: true; tokens: string[] } | { eligible: false; reason: string }> {
  const { data: outbox, error: outboxError } = await client
    .from("push_outbox")
    .select("notification_id")
    .eq("id", job.outbox_id)
    .eq("user_id", job.user_id)
    .maybeSingle();
  if (outboxError) throw new Error("Could not read the claimed outbox row.");
  if (!outbox) return { eligible: false, reason: "outbox_row_missing" };

  const { data: notification, error: notificationError } = await client
    .from("notifications")
    .select("user_id,type,actor_id")
    .eq("id", outbox.notification_id)
    .maybeSingle();
  if (notificationError) throw new Error("Could not read the related notification.");
  if (!notification || notification.user_id !== job.user_id || notification.type !== job.notification_type) {
    return { eligible: false, reason: "notification_missing_or_mismatched" };
  }

  const [preferencesResult, standingResult] = await Promise.all([
    client
      .from("user_preferences")
      .select("notify_push,notify_follows,notify_likes,notify_comments,notify_community,notify_messages,notify_discussions")
      .eq("user_id", job.user_id)
      .maybeSingle(),
    client
      .from("account_standing")
      .select("status,restricted_until")
      .eq("user_id", job.user_id)
      .maybeSingle(),
  ]);
  if (preferencesResult.error) throw new Error("Could not recheck notification preferences.");
  if (standingResult.error) throw new Error("Could not recheck account status.");

  const preference = preferencesResult.data as PushPreferences | null;
  const standing = standingResult.data as { status: string; restricted_until: string | null } | null;
  const accountStatus = effectiveAccountStatus(
    standing?.status ?? null,
    standing?.restricted_until ?? null,
  );
  const categoryPreference = preferenceForNotification(notification.type);
  const categoryEnabled = !categoryPreference || preference?.[categoryPreference] !== false;
  let blocked = false;
  if (notification.actor_id) {
    const [recipientBlockedActor, actorBlockedRecipient] = await Promise.all([
      client
        .from("blocks")
        .select("blocker_id")
        .eq("blocker_id", job.user_id)
        .eq("blocked_id", notification.actor_id)
        .maybeSingle(),
      client
        .from("blocks")
        .select("blocker_id")
        .eq("blocker_id", notification.actor_id)
        .eq("blocked_id", job.user_id)
        .maybeSingle(),
    ]);
    if (recipientBlockedActor.error || actorBlockedRecipient.error) {
      throw new Error("Could not recheck notification block relationships.");
    }
    blocked = Boolean(recipientBlockedActor.data || actorBlockedRecipient.data);
  }

  if (!shouldSendPush({
    pushEnabled: preference?.notify_push !== false,
    categoryEnabled,
    accountStatus,
    blocked,
  })) {
    return { eligible: false, reason: "recipient_not_eligible" };
  }

  const { data: subscriptions, error: subscriptionsError } = await client
    .from("push_subscriptions")
    .select("fcm_token")
    .eq("user_id", job.user_id);
  if (subscriptionsError) throw new Error("Could not recheck active push subscriptions.");
  const tokens = (subscriptions ?? []).map((subscription) => subscription.fcm_token as string);
  if (tokens.length === 0) return { eligible: false, reason: "no_registered_devices" };
  return { eligible: true, tokens };
}

async function processJob(
  client: ReturnType<typeof createClient>,
  account: FirebaseAccount,
  accessToken: string,
  job: PushJob,
): Promise<"delivered" | "retry" | "failed"> {
  try {
    const eligibility = await recheckEligibility(client, job);
    if (!eligibility.eligible) {
      const reason = eligibility.reason === "recipient_not_eligible"
        ? "recipient_preferences_status_or_block"
        : eligibility.reason;
      await finishJob(client, job, "failed", reason);
      return "failed";
    }

    const results = await Promise.all(
      eligibility.tokens.map((token) =>
        sendToDevice(
          account.project_id,
          accessToken,
          token,
          job.notification_type,
          job.entity_type,
          job.entity_id,
        )
      ),
    );
    let invalidTokenCleanupFailed = false;
    for (const [index, result] of results.entries()) {
      if (!result.invalidToken) continue;
      const { error } = await client
        .from("push_subscriptions")
        .delete()
        .eq("fcm_token", eligibility.tokens[index])
        .eq("user_id", job.user_id);
      if (error) {
        console.error("Could not remove an invalid push subscription.", { outboxId: job.outbox_id });
        invalidTokenCleanupFailed = true;
      }
    }

    const decision = invalidTokenCleanupFailed
      ? { result: "retry" as const, error: "invalid_token_cleanup_failed" }
      : decideDelivery(results);
    await finishJob(client, job, decision.result, decision.error);
    return decision.result;
  } catch (error) {
    console.error("Push outbox job processing failed.", {
      outboxId: job.outbox_id,
      detail: error instanceof Error ? error.message : "unknown_error",
    });
    await finishJob(client, job, "retry", "push_worker_processing_error");
    return "retry";
  }
}

async function processJobs(
  client: ReturnType<typeof createClient>,
  account: FirebaseAccount,
  accessToken: string,
  jobs: PushJob[],
): Promise<{ outcomes: Array<"delivered" | "retry" | "failed">; completionFailed: boolean }> {
  const outcomes = new Array<"delivered" | "retry" | "failed">(jobs.length);
  let nextIndex = 0;
  let completionFailed = false;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_JOBS, jobs.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= jobs.length) return;
      try {
        outcomes[index] = await processJob(client, account, accessToken, jobs[index]);
      } catch {
        completionFailed = true;
        console.error("Could not finish a claimed push outbox job.", { outboxId: jobs[index].outbox_id });
      }
    }
  });
  await Promise.all(workers);
  return { outcomes, completionFailed };
}

export async function handleProcessOutbox(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("PUSH_WORKER_SECRET");
  const providedSecret = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expectedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!supabaseUrl || !serviceRoleKey || !firebaseJson) {
    console.error("Push worker is missing server-side credentials.");
    return Response.json({ error: "Push worker is not configured." }, { status: 500, headers: corsHeaders });
  }
  if (isLocalSupabaseUrl(supabaseUrl)) {
    return Response.json(
      { error: "Push delivery is disabled for local Supabase environments." },
      { status: 503, headers: corsHeaders },
    );
  }

  let account: FirebaseAccount;
  try {
    account = JSON.parse(firebaseJson) as FirebaseAccount;
  } catch {
    return Response.json({ error: "Firebase service account is not valid JSON." }, { status: 500, headers: corsHeaders });
  }
  if (
    typeof account.client_email !== "string"
    || typeof account.private_key !== "string"
    || typeof account.project_id !== "string"
    || !account.client_email
    || !account.private_key
    || !account.project_id
  ) {
    return Response.json({ error: "Firebase service account is incomplete." }, { status: 500, headers: corsHeaders });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { error: reminderError } = await client.rpc("queue_due_celebration_reminders");
    if (reminderError) {
      throw new Error("Could not queue reminders; confirm Migration 27 is applied.");
    }
    const { data, error } = await client.rpc("claim_push_outbox", { p_limit: MAX_JOBS });
    if (error) throw new Error("Could not claim push outbox rows; confirm Migration 28 is applied.");
    const jobs = (data ?? []) as PushJob[];
    if (!jobs.length) {
      return Response.json({ claimed: 0, delivered: 0, failed: 0, retried: 0 }, { headers: corsHeaders });
    }

    let accessToken: string;
    try {
      accessToken = await firebaseAccessToken(account);
    } catch {
      const finishes = await Promise.allSettled(
        jobs.map((job) => finishJob(client, job, "retry", "firebase_oauth_request_failed")),
      );
      if (finishes.some((finish) => finish.status === "rejected")) {
        throw new Error("Firebase OAuth failed and one or more claimed jobs could not be requeued.");
      }
      throw new Error("Firebase OAuth failed; claimed push jobs were queued for retry.");
    }

    const { outcomes, completionFailed } = await processJobs(client, account, accessToken, jobs);
    if (completionFailed) {
      return Response.json(
        { error: "Some claimed push jobs could not be completed; their leases will expire for retry." },
        { status: 500, headers: corsHeaders },
      );
    }
    return Response.json({
      claimed: jobs.length,
      delivered: outcomes.filter((outcome) => outcome === "delivered").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
      retried: outcomes.filter((outcome) => outcome === "retry").length,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Push outbox processing failed.", {
      detail: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Push outbox processing failed." },
      { status: 500, headers: corsHeaders },
    );
  }
}
