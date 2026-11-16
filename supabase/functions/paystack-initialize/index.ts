import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  paystackCallbackUrl,
  paystackSecret,
  serviceClient,
} from "../_shared/paystack.ts";
import { parseCheckoutPlan, parseCheckoutRequest } from "../_shared/paystackLogic.ts";

async function failCheckout(
  admin: NonNullable<ReturnType<typeof serviceClient>>,
  reference: string,
  reason: "provider_unavailable" | "provider_initialization_failed" | "invalid_plan_configuration",
): Promise<boolean> {
  const { data, error } = await admin.rpc("fail_paystack_checkout", {
    p_reference: reference,
    p_reason: reason,
  });
  if (error || data !== true) console.error("Could not mark Paystack checkout failed.", error?.code ?? "not_pending");
  return !error && data === true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const user = await authenticatedUser(request);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);
  if (!user.email || !user.email_confirmed_at) return jsonResponse({ error: "verified_email_required" }, 400);

  let checkout: ReturnType<typeof parseCheckoutRequest>;
  try {
    checkout = parseCheckoutRequest(await request.json());
  } catch {
    checkout = null;
  }
  if (!checkout) return jsonResponse({ error: "invalid_request" }, 400);

  const secret = paystackSecret();
  const admin = serviceClient();
  const callbackUrl = paystackCallbackUrl();
  if (!secret || !admin || !callbackUrl) return jsonResponse({ error: "payments_not_configured" }, 503);

  const reference = `cc_${crypto.randomUUID()}`;
  const { data: reservation, error: reserveError } = await admin.rpc(
    "reserve_paystack_checkout",
    {
      p_user_id: user.id,
      p_plan_code: checkout.planCode,
      p_billing_interval: checkout.billingInterval,
      p_reference: reference,
    },
  );
  if (reserveError || !reservation?.length) {
    if (reserveError) console.warn("Paystack checkout reservation failed.", reserveError.code);
    return jsonResponse({ error: "plan_unavailable" }, 409);
  }

  const plan = parseCheckoutPlan(reservation[0]);
  if (!plan) {
    console.error("Paystack checkout received invalid plan configuration.");
    if (!await failCheckout(admin, reference, "invalid_plan_configuration")) {
      return jsonResponse({ error: "payment_state_update_failed" }, 500);
    }
    return jsonResponse({ error: "plan_configuration_invalid" }, 500);
  }
  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: plan.amount,
        currency: plan.currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          plan_code: checkout.planCode,
          billing_interval: plan.billingInterval,
          interval_count: plan.intervalCount,
        },
      }),
    });
  } catch {
    if (!await failCheckout(admin, reference, "provider_unavailable")) {
      return jsonResponse({ error: "payment_state_update_failed" }, 500);
    }
    return jsonResponse({ error: "payment_provider_unavailable" }, 502);
  }

  let result: { status?: unknown; data?: { authorization_url?: unknown } };
  try {
    result = await providerResponse.json();
  } catch {
    result = {};
  }
  if (
    !providerResponse.ok
    || result.status !== true
    || typeof result.data?.authorization_url !== "string"
  ) {
    if (!await failCheckout(admin, reference, "provider_initialization_failed")) {
      return jsonResponse({ error: "payment_state_update_failed" }, 500);
    }
    return jsonResponse({ error: "payment_initialization_failed" }, 502);
  }

  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(result.data.authorization_url);
  } catch {
    if (!await failCheckout(admin, reference, "provider_initialization_failed")) {
      return jsonResponse({ error: "payment_state_update_failed" }, 500);
    }
    return jsonResponse({ error: "payment_initialization_failed" }, 502);
  }
  if (authorizationUrl.protocol !== "https:" || authorizationUrl.hostname !== "checkout.paystack.com") {
    if (!await failCheckout(admin, reference, "provider_initialization_failed")) {
      return jsonResponse({ error: "payment_state_update_failed" }, 500);
    }
    return jsonResponse({ error: "payment_initialization_failed" }, 502);
  }

  return jsonResponse({
    authorization_url: authorizationUrl.toString(),
    reference,
  });
});
