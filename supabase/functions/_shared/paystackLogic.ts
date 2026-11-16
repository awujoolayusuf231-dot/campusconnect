export type CheckoutRequest = {
  planCode: "plus" | "pro";
  billingInterval: "month" | "year";
};

export type CheckoutPlan = {
  amount: number;
  currency: string;
  billingInterval: "month" | "year";
  intervalCount: number;
};

export type VerifiedTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  id: number;
};

export function parseCheckoutRequest(value: unknown): CheckoutRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const planCode = input.plan_code;
  const billingInterval = input.billing_interval;
  if ((planCode !== "plus" && planCode !== "pro")
      || (billingInterval !== "month" && billingInterval !== "year")) return null;
  return { planCode, billingInterval };
}

export function parseCheckoutPlan(value: unknown): CheckoutPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  const amount = typeof plan.amount_minor === "string" && /^\d+$/.test(plan.amount_minor)
    ? Number(plan.amount_minor)
    : plan.amount_minor;
  const intervalCount = plan.interval_count;
  if (
    typeof amount !== "number"
    || !Number.isSafeInteger(amount)
    || amount <= 0
    || typeof plan.currency !== "string"
    || !/^[A-Z]{3}$/.test(plan.currency)
    || (plan.billing_interval !== "month" && plan.billing_interval !== "year")
    || typeof intervalCount !== "number"
    || !Number.isSafeInteger(intervalCount)
    || intervalCount <= 0
  ) return null;
  return {
    amount,
    currency: plan.currency,
    billingInterval: plan.billing_interval,
    intervalCount,
  };
}

export function isValidReference(value: unknown): value is string {
  return typeof value === "string" && /^cc_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parsePaystackCallbackUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[\da-f]{128}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function isValidPaystackSignature(
  rawBody: string | Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const supplied = hexToBytes(signature);
  if (!supplied) return false;
  const bodyBytes = typeof rawBody === "string" ? new TextEncoder().encode(rawBody) : rawBody;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, bodyBytes),
  );
  return constantTimeEqual(expected, supplied);
}

export function matchesExpectedTransaction(
  transaction: VerifiedTransaction,
  expected: { reference: string; amount: number | string; currency: string },
): boolean {
  const expectedAmount = typeof expected.amount === "number"
    ? expected.amount
    : /^\d+$/.test(expected.amount) ? Number(expected.amount) : Number.NaN;
  return transaction.reference === expected.reference
    && Number.isSafeInteger(transaction.amount)
    && Number.isSafeInteger(expectedAmount)
    && transaction.amount === expectedAmount
    && transaction.currency === expected.currency;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
