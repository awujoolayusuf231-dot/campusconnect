import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  activityEmailCopy,
  appUrl,
  brandedEmailHtml,
  emailPreferenceForNotification,
  isImportantPlatformEmail,
  sendWithResend,
  shouldSendActivityEmail,
} from "../email-outbox/emailOutboxLogic.ts";
import { effectiveAccountStatus, isLocalSupabaseUrl } from "../process-outbox/pushOutboxLogic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const MAX_JOBS = 20;
const MAX_CONCURRENT_JOBS = 3;

type EmailJob = {
  outbox_id: number;
  user_id: string;
  message_type: "welcome" | "activity";
  notification_id: number | null;
};
type NotificationRow = {
  id: number;
  user_id: string;
  type: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown> | null;
};
type UserProfile = { display_name: string | null; username: string | null };
type EmailPreferences = {
  notify_email: boolean;
  notify_follows: boolean;
  notify_likes: boolean;
  notify_comments: boolean;
  notify_community: boolean;
  notify_messages: boolean;
  notify_discussions: boolean;
  notify_followed_posts: boolean;
  notify_celebrations: boolean;
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

function profileName(profile: UserProfile | null): string {
  return profile?.display_name?.trim().slice(0, 60)
    || profile?.username?.trim().slice(0, 30)
    || "there";
}

async function finishJob(
  client: ReturnType<typeof createClient>,
  job: EmailJob,
  result: "accepted" | "retry" | "failed" | "skipped",
  error: string | null,
  providerEmailId: string | null = null,
): Promise<void> {
  const { error: finishError } = await client.rpc("finish_email_outbox", {
    p_outbox_id: job.outbox_id,
    p_result: result,
    p_error: error,
    p_provider_email_id: providerEmailId,
  });
  if (finishError) throw new Error("Could not update the email outbox status.");
}

async function loadNotification(
  client: ReturnType<typeof createClient>,
  job: EmailJob,
): Promise<NotificationRow> {
  if (!job.notification_id) throw new Error("activity_notification_missing");
  const { data, error } = await client
    .from("notifications")
    .select("id,user_id,type,actor_id,entity_type,entity_id,data")
    .eq("id", job.notification_id)
    .eq("user_id", job.user_id)
    .maybeSingle();
  if (error) throw new Error("notification_lookup_failed");
  if (!data) throw new Error("notification_missing");
  return data as NotificationRow;
}

async function accountStatus(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("account_standing")
    .select("status,restricted_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("account_status_lookup_failed");
  const standing = data as { status: string; restricted_until: string | null } | null;
  return effectiveAccountStatus(standing?.status ?? null, standing?.restricted_until ?? null);
}

async function actorIsBlocked(
  client: ReturnType<typeof createClient>,
  recipientId: string,
  actorId: string | null,
): Promise<boolean> {
  if (!actorId || actorId === recipientId) return false;
  const [recipientBlocksActor, actorBlocksRecipient] = await Promise.all([
    client.from("blocks").select("blocker_id").eq("blocker_id", recipientId).eq("blocked_id", actorId).maybeSingle(),
    client.from("blocks").select("blocker_id").eq("blocker_id", actorId).eq("blocked_id", recipientId).maybeSingle(),
  ]);
  if (recipientBlocksActor.error || actorBlocksRecipient.error) throw new Error("block_status_lookup_failed");
  return Boolean(recipientBlocksActor.data || actorBlocksRecipient.data);
}

async function emailPreferences(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<EmailPreferences | null> {
  const { data, error } = await client
    .from("user_preferences")
    .select("notify_email,notify_follows,notify_likes,notify_comments,notify_community,notify_messages,notify_discussions,notify_followed_posts,notify_celebrations")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("email_preferences_lookup_failed");
  return data as EmailPreferences | null;
}

async function sendJob(
  client: ReturnType<typeof createClient>,
  job: EmailJob,
  config: { apiKey: string; from: string; appUrl: string },
): Promise<"accepted" | "retry" | "failed" | "skipped"> {
  try {
    const { data: userData, error: userError } = await client.auth.admin.getUserById(job.user_id);
    if (userError) throw new Error("auth_user_lookup_failed");
    const user = userData.user;
    if (!user?.email || !user.email_confirmed_at) {
      await finishJob(client, job, "skipped", "recipient_unverified_or_missing");
      return "skipped";
    }

    const [status, profileResult] = await Promise.all([
      accountStatus(client, job.user_id),
      client.from("profiles").select("display_name,username").eq("id", job.user_id).maybeSingle(),
    ]);
    if (profileResult.error) throw new Error("profile_lookup_failed");
    const recipientName = profileName(profileResult.data as UserProfile | null);
    let subject: string;
    let heading: string;
    let body: string;
    let path = "/app";
    let buttonLabel = "Open CampusConnect";

    if (job.message_type === "welcome") {
      if (status !== "active" && status !== "restricted") {
        await finishJob(client, job, "skipped", "account_not_eligible");
        return "skipped";
      }
      subject = "Welcome to CampusConnect";
      heading = "Welcome to CampusConnect";
      body = "Your email is verified and your campus community is ready to explore.";
    } else {
      const notification = await loadNotification(client, job);
      const preferences = await emailPreferences(client, job.user_id);
      const categoryPreference = emailPreferenceForNotification(notification.type);
      const categoryEnabled = !categoryPreference || preferences?.[categoryPreference as keyof EmailPreferences] !== false;
      const importantPlatformNotice = isImportantPlatformEmail(notification.type);
      const blocked = importantPlatformNotice
        ? false
        : await actorIsBlocked(client, job.user_id, notification.actor_id);
      if (!shouldSendActivityEmail({
        emailEnabled: preferences?.notify_email === true,
        categoryEnabled,
        accountStatus: status,
        blocked,
        importantPlatformNotice,
      })) {
        await finishJob(client, job, "skipped", "recipient_preferences_status_or_block");
        return "skipped";
      }

      const actorProfile = notification.actor_id
        ? await client.from("profiles").select("display_name,username").eq("id", notification.actor_id).maybeSingle()
        : { data: null, error: null };
      if (actorProfile.error) throw new Error("actor_profile_lookup_failed");
      const actor = actorProfile.data as UserProfile | null;
      const copy = activityEmailCopy({
        type: notification.type,
        actorName: actor?.display_name || actor?.username || null,
        actorUsername: actor?.username ?? null,
        entityType: notification.entity_type,
        entityId: notification.entity_id,
        data: notification.data,
      });
      subject = copy.subject;
      heading = copy.heading;
      body = copy.body;
      path = copy.path;
      buttonLabel = notification.type === "announcement" || notification.type === "moderation_warning"
        ? "Review notification"
        : "View update";
    }

    const result = await sendWithResend({
      apiKey: config.apiKey,
      from: config.from,
      to: user.email,
      subject,
      html: brandedEmailHtml({
        recipientName,
        heading,
        body,
        buttonLabel,
        buttonUrl: appUrl(config.appUrl, path),
      }),
      idempotencyKey: `campusconnect-email-outbox-${job.outbox_id}`,
      outboxId: job.outbox_id,
    });
    await finishJob(client, job, result.result, result.errorCode, result.providerEmailId);
    return result.result;
  } catch (error) {
    console.error("Email outbox job failed.", {
      outboxId: job.outbox_id,
      errorCode: error instanceof Error ? error.message : "unknown_error",
    });
    await finishJob(client, job, "retry", "email_worker_processing_error");
    return "retry";
  }
}

function processJobs(
  client: ReturnType<typeof createClient>,
  jobs: EmailJob[],
  config: { apiKey: string; from: string; appUrl: string },
): Promise<Array<"accepted" | "retry" | "failed" | "skipped">> {
  const outcomes = new Array<"accepted" | "retry" | "failed" | "skipped">(jobs.length);
  let nextIndex = 0;
  return Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_JOBS, jobs.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= jobs.length) return;
      outcomes[index] = await sendJob(client, jobs[index], config);
    }
  })).then(() => outcomes);
}

export async function handleEmailOutbox(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });

  const expectedSecret = Deno.env.get("CAMPUSCONNECT_EMAIL_WORKER_SECRET") ?? "";
  const providedSecret = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expectedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const appBaseUrl = Deno.env.get("CAMPUSCONNECT_APP_URL");
  if (!supabaseUrl || !serviceRoleKey || !apiKey || !from || !appBaseUrl) {
    console.error("Email outbox worker is missing server-side configuration.");
    return Response.json({ error: "email_worker_not_configured" }, { status: 503, headers: corsHeaders });
  }
  if (isLocalSupabaseUrl(supabaseUrl)) {
    return Response.json({ error: "email_delivery_disabled_for_local_supabase" }, { status: 503, headers: corsHeaders });
  }

  let validatedAppUrl: string;
  try {
    const parsedAppUrl = new URL(appBaseUrl);
    if (parsedAppUrl.protocol !== "https:" || !parsedAppUrl.hostname || parsedAppUrl.username || parsedAppUrl.password) {
      throw new Error("invalid_app_origin");
    }
    if (from.length > 254 || /[\r\n]/.test(from)) throw new Error("invalid_sender");
    validatedAppUrl = parsedAppUrl.origin;
    appUrl(validatedAppUrl, "/app");
  } catch {
    return Response.json({ error: "invalid_campusconnect_app_url" }, { status: 503, headers: corsHeaders });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await client.rpc("claim_email_outbox", { p_limit: MAX_JOBS });
    if (error) throw new Error("Could not claim email outbox rows; confirm the email delivery migration is applied.");
    const jobs = (data ?? []) as EmailJob[];
    if (jobs.length === 0) {
      return Response.json({ claimed: 0, accepted: 0, failed: 0, retried: 0, skipped: 0 }, { headers: corsHeaders });
    }
    const outcomes = await processJobs(client, jobs, { apiKey, from, appUrl: validatedAppUrl });
    return Response.json({
      claimed: jobs.length,
      accepted: outcomes.filter((outcome) => outcome === "accepted").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
      retried: outcomes.filter((outcome) => outcome === "retry").length,
      skipped: outcomes.filter((outcome) => outcome === "skipped").length,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Email outbox processing failed.", {
      errorCode: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json({ error: "email_outbox_processing_failed" }, { status: 500, headers: corsHeaders });
  }
}
