import {
  jsonResponse,
  paystackSecret,
  serviceClient,
  verifyPaystackTransaction,
} from "../_shared/paystack.ts";
import {
  isValidPaystackSignature,
  isValidReference,
  matchesExpectedTransaction,
  sha256Hex,
} from "../_shared/paystackLogic.ts";

async function readBodyWithinLimit(request: Request, limit: number): Promise<Uint8Array | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const secret = paystackSecret();
  const admin = serviceClient();
  if (!secret || !admin) return jsonResponse({ error: "payments_not_configured" }, 503);

  const rawBody = await readBodyWithinLimit(request, 262144);
  if (!rawBody) return jsonResponse({ error: "event_too_large" }, 413);
  if (!await isValidPaystackSignature(rawBody, request.headers.get("x-paystack-signature"), secret)) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let event: { event?: unknown; data?: Record<string, unknown> };
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonResponse({ error: "invalid_event" }, 400);
  }
  if (typeof event.event !== "string" || !event.data || typeof event.data !== "object") {
    return jsonResponse({ error: "invalid_event" }, 400);
  }
  const reference = event.data.reference;
  const bodyHash = await sha256Hex(rawBody);
  const eventKey = `webhook:${bodyHash}`;
  if (event.event !== "charge.success") {
    if (!isValidReference(reference)) return jsonResponse({ received: true });
    const { error } = await admin.rpc("record_paystack_event", {
      p_event_key: eventKey,
      p_event_type: event.event.slice(0, 100),
      p_reference: reference,
      p_evidence_sha256: bodyHash,
      p_outcome: "ignored",
    });
    return error
      ? jsonResponse({ error: "event_record_failed" }, 500)
      : jsonResponse({ received: true });
  }
  if (!isValidReference(reference)) return jsonResponse({ error: "invalid_event" }, 400);

  const transaction = await verifyPaystackTransaction(reference, secret);
  if (!transaction) return jsonResponse({ error: "provider_verification_failed" }, 502);
  const { data: payment, error: paymentError } = await admin
    .from("subscription_payment_attempts")
    .select("reference,amount_minor,currency")
    .eq("reference", reference)
    .maybeSingle();
  if (paymentError || !payment) {
    const { error } = await admin.rpc("record_paystack_event", {
      p_event_key: eventKey,
      p_event_type: event.event,
      p_reference: reference,
      p_evidence_sha256: bodyHash,
      p_outcome: "unmatched",
    });
    return error
      ? jsonResponse({ error: "event_record_failed" }, 500)
      : jsonResponse({ received: true });
  }
  if (!matchesExpectedTransaction(transaction, payment)) {
    const { error } = await admin.rpc("record_paystack_event", {
      p_event_key: eventKey,
      p_event_type: event.event,
      p_reference: reference,
      p_evidence_sha256: bodyHash,
      p_outcome: "mismatch",
    });
    return error
      ? jsonResponse({ error: "event_record_failed" }, 500)
      : jsonResponse({ received: true });
  }
  if (!["success", "failed", "abandoned"].includes(transaction.status)) {
    const { error } = await admin.rpc("record_paystack_event", {
      p_event_key: eventKey,
      p_event_type: event.event,
      p_reference: reference,
      p_evidence_sha256: bodyHash,
      p_outcome: "ignored",
    });
    return error
      ? jsonResponse({ error: "event_record_failed" }, 500)
      : jsonResponse({ received: true });
  }

  const { error } = await admin.rpc("finalize_paystack_payment", {
    p_reference: reference,
    p_provider_transaction_id: transaction.id,
    p_provider_status: transaction.status,
    p_amount_minor: transaction.amount,
    p_currency: transaction.currency,
    p_event_key: eventKey,
    p_event_type: event.event,
    p_evidence_sha256: bodyHash,
  });
  if (error) {
    console.warn("Paystack webhook could not be recorded.", error.code);
    return jsonResponse({ error: "event_processing_failed" }, 500);
  }
  return jsonResponse({ received: true });
});
