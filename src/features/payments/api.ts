import { supabase } from "@/lib/supabase";

export type PaidPlanCode = "plus" | "pro";
export type BillingInterval = "month" | "year";

export interface SubscriptionPlan {
  code: PaidPlanCode;
  display_name: string;
  amount_minor: number;
  currency: string;
  billing_interval: BillingInterval;
  interval_count: number;
}

export interface MySubscription {
  plan_code: "free" | PaidPlanCode;
  display_name: string;
  status: "active" | "canceled" | "expired";
  billing_interval: BillingInterval | null;
  current_period_start: string | null;
  current_period_end: string | null;
}

function parseMinorAmount(value: unknown): number | null {
  const amount = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function parseSubscriptionPlan(value: unknown): SubscriptionPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const amount = parseMinorAmount(row.amount_minor);
  if (
    (row.code !== "plus" && row.code !== "pro")
    || typeof row.display_name !== "string"
    || amount === null
    || amount === 0
    || typeof row.currency !== "string"
    || !/^[A-Z]{3}$/.test(row.currency)
    || (row.billing_interval !== "month" && row.billing_interval !== "year")
    || typeof row.interval_count !== "number"
    || !Number.isSafeInteger(row.interval_count)
    || row.interval_count < 1
  ) return null;
  return {
    code: row.code,
    display_name: row.display_name,
    amount_minor: amount,
    currency: row.currency,
    billing_interval: row.billing_interval,
    interval_count: row.interval_count,
  };
}

export function formatSubscriptionPrice(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("The subscription price is invalid.");
  }
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amountMinor / (10 ** fractionDigits));
}

export async function fetchActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from("subscription_plans")
    .select("code,display_name,amount_minor,currency,billing_interval,interval_count")
    .in("code", ["plus", "pro"])
    .eq("is_active", true)
    .order("amount_minor");
  if (error) throw error;
  const plans = (data ?? []).map(parseSubscriptionPlan);
  if (plans.some((plan) => plan === null)) throw new Error("A subscription plan is configured incorrectly.");
  return plans.filter((plan): plan is SubscriptionPlan => plan !== null);
}

export async function fetchMySubscription(): Promise<MySubscription> {
  const { data, error } = await supabase.rpc("my_subscription");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object") throw new Error("Your subscription status was not returned.");
  const value = row as Record<string, unknown>;
  const planCode = value.plan_code;
  const displayName = value.display_name;
  const status = value.status;
  const billingInterval = value.billing_interval;
  const periodStart = value.current_period_start;
  const periodEnd = value.current_period_end;
  if (
    (planCode !== "free" && planCode !== "plus" && planCode !== "pro")
    || typeof displayName !== "string"
    || (status !== "active" && status !== "canceled" && status !== "expired")
    || (billingInterval !== null && billingInterval !== "month" && billingInterval !== "year")
    || (periodStart !== null && typeof periodStart !== "string")
    || (periodEnd !== null && typeof periodEnd !== "string")
  ) throw new Error("Your subscription status is invalid.");
  return {
    plan_code: planCode,
    display_name: displayName,
    status,
    billing_interval: billingInterval,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  };
}

export async function startPaystackCheckout(planCode: PaidPlanCode, billingInterval: BillingInterval): Promise<string> {
  const { data, error } = await supabase.functions.invoke("paystack-initialize", {
    body: { plan_code: planCode, billing_interval: billingInterval },
  });
  if (error) throw error;
  const result = data as { authorization_url?: unknown } | null;
  if (typeof result?.authorization_url !== "string") {
    throw new Error("Paystack did not return a checkout link.");
  }
  let url: URL;
  try {
    url = new URL(result.authorization_url);
  } catch {
    throw new Error("Paystack returned an invalid checkout link.");
  }
  if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") {
    throw new Error("Paystack returned an unsafe checkout link.");
  }
  return url.toString();
}

export async function verifyPaystackCheckout(reference: string): Promise<void> {
  if (!/^cc_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) {
    throw new Error("The payment reference is invalid.");
  }
  const { data, error } = await supabase.functions.invoke("paystack-verify", { body: { reference } });
  if (error) throw error;
  if ((data as { status?: unknown } | null)?.status !== "verified") {
    throw new Error("Paystack could not confirm this payment.");
  }
}
