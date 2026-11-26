import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resendContactUnsubscribeFromEvent,
  resendOutboxIdFromTags,
  verifyResendWebhookSignature,
} from "../_shared/resendWebhookLogic.ts";

const MAX_BODY_BYTES = 64 * 1024;
const acceptedEventTypes = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "contact.updated",
]);

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: "payload_too_large" }, 413);

  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Resend webhook is missing server-side configuration.");
    return jsonResponse({ error: "webhook_not_configured" }, 503);
  }

  let body: string;
  let event: Record<string, unknown>;
  try {
    const rawBody = await readBoundedBody(request);
    if (rawBody === null) return jsonResponse({ error: "payload_too_large" }, 413);
    body = rawBody;
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return jsonResponse({ error: "invalid_event" }, 400);
    }
    event = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_event" }, 400);
  }

  const eventId = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  const signatureValid = await verifyResendWebhookSignature({
    secret: webhookSecret,
    eventId,
    timestamp,
    signatureHeader: signature,
    body,
  }).catch((error: unknown) => {
    console.error("Resend webhook signature verification failed.", {
      errorCode: error instanceof Error ? error.name : "unknown_error",
    });
    return false;
  });
  if (!signatureValid) return jsonResponse({ error: "invalid_signature" }, 401);

  if (typeof event.type !== "string" || !acceptedEventTypes.has(event.type)) {
    return jsonResponse({ received: true, ignored: true });
  }
  const data = event.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return jsonResponse({ error: "invalid_event_data" }, 400);
  }
  const eventData = data as Record<string, unknown>;
  const occurredAt = typeof event.created_at === "string" ? event.created_at : null;
  if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
    return jsonResponse({ error: "invalid_event_time" }, 400);
  }

  if (event.type === "contact.updated") {
    const audienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!audienceId) {
      console.error("Resend contact webhook cannot verify its audience.");
      return jsonResponse({ error: "contact_webhook_not_configured" }, 503);
    }
    const unsubscribe = resendContactUnsubscribeFromEvent(eventData, audienceId);
    if (!unsubscribe) {
      return jsonResponse({ received: true, ignored: true });
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.rpc("record_resend_contact_unsubscribe", {
      p_event_id: eventId,
      p_contact_id: unsubscribe.contactId,
      p_audience_id: audienceId,
      p_email: unsubscribe.email,
      p_occurred_at: new Date(occurredAt).toISOString(),
    });
    if (error) {
      console.error("Could not record a Resend contact unsubscribe.", {
        errorCode: error.code ?? "database_error",
      });
      return jsonResponse({ error: "contact_unsubscribe_record_failed" }, 503);
    }
    return jsonResponse({ received: true });
  }

  const rawProviderEmailId = eventData.email_id;
  const providerEmailId = typeof rawProviderEmailId === "string"
    && rawProviderEmailId.length >= 1
    && rawProviderEmailId.length <= 200
    ? rawProviderEmailId
    : null;
  const outboxId = resendOutboxIdFromTags(eventData.tags);
  if (!providerEmailId && !outboxId) {
    return jsonResponse({ received: true, ignored: true, reason: "event_has_no_correlatable_email_id" });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.rpc("record_resend_email_event", {
    p_event_id: eventId,
    p_provider_email_id: providerEmailId,
    p_event_type: event.type,
    p_occurred_at: new Date(occurredAt).toISOString(),
    p_outbox_id: outboxId,
  });
  if (error) {
    console.error("Could not record the Resend delivery event.", { errorCode: error.code ?? "database_error" });
    return jsonResponse({ error: "delivery_event_record_failed" }, 503);
  }
  return jsonResponse({ received: true });
});
