import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  paystackSecret,
  serviceClient,
  verifyPaystackTransaction,
} from "../_shared/paystack.ts";
import { isValidReference, matchesExpectedTransaction, sha256Hex } from "../_shared/paystackLogic.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const user = await authenticatedUser(request);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);
  let reference: unknown;
  try {
    reference = (await request.json() as Record<string, unknown>).reference;
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (!isValidReference(reference)) return jsonResponse({ error: "invalid_request" }, 400);

  const secret = paystackSecret();
  const admin = serviceClient();
  if (!secret || !admin) return jsonResponse({ error: "payments_not_configured" }, 503);

  const { data: payment, error: paymentError } = await admin
    .from("subscription_payment_attempts")
    .select("reference,user_id,amount_minor,currency,status")
    .eq("reference", reference)
    .maybeSingle();
  if (paymentError || !payment || payment.user_id !== user.id) {
    return jsonResponse({ error: "payment_not_found" }, 404);
  }

  const transaction = await verifyPaystackTransaction(reference, secret);
  if (!transaction) return jsonResponse({ error: "provider_verification_failed" }, 502);
  const evidenceHash = await sha256Hex(JSON.stringify(transaction));
  const eventKey = `verify:${reference}:${transaction.id}:${transaction.status}:${evidenceHash}`;
  if (!matchesExpectedTransaction(transaction, payment)) {
    const { error } = await admin.rpc("record_paystack_event", {
      p_event_key: eventKey,
      p_event_type: "transaction.verify",
      p_reference: reference,
      p_evidence_sha256: evidenceHash,
      p_outcome: "mismatch",
    });
    if (error) return jsonResponse({ error: "payment_update_failed" }, 500);
    return jsonResponse({ error: "payment_mismatch" }, 409);
  }
  if (!["success", "failed", "abandoned"].includes(transaction.status)) {
    const { error } = await admin.rpc("record_paystack_event", {
      p_event_key: eventKey,
      p_event_type: "transaction.verify",
      p_reference: reference,
      p_evidence_sha256: evidenceHash,
      p_outcome: "ignored",
    });
    if (error) return jsonResponse({ error: "payment_update_failed" }, 500);
    return jsonResponse({ error: "payment_not_final" }, 409);
  }

  const { data: outcome, error: finalizeError } = await admin.rpc(
    "finalize_paystack_payment",
    {
      p_reference: reference,
      p_provider_transaction_id: transaction.id,
      p_provider_status: transaction.status,
      p_amount_minor: transaction.amount,
      p_currency: transaction.currency,
      p_event_key: eventKey,
      p_event_type: "transaction.verify",
      p_evidence_sha256: evidenceHash,
    },
  );
  if (finalizeError || !outcome) {
    if (finalizeError) console.warn("Paystack verification could not be recorded.", finalizeError.code);
    return jsonResponse({ error: "payment_update_failed" }, 500);
  }
  if (transaction.status !== "success") {
    return jsonResponse({ error: "payment_not_successful" }, 409);
  }
  return jsonResponse({ status: "verified", reference });
});
