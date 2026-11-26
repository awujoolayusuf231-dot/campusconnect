const SIGNATURE_TOLERANCE_SECONDS = 300;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

export function resendOutboxIdFromTags(tags: unknown): string | null {
  let value: unknown = null;
  if (Array.isArray(tags)) {
    const tag = tags.find((item) =>
      typeof item === "object" && item !== null && !Array.isArray(item)
      && (item as Record<string, unknown>).name === "email_outbox_id"
    );
    value = typeof tag === "object" && tag !== null && !Array.isArray(tag)
      ? (tag as Record<string, unknown>).value
      : null;
  } else if (typeof tags === "object" && tags !== null) {
    value = (tags as Record<string, unknown>).email_outbox_id;
  }
  if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) return null;
  try {
    return BigInt(value) <= MAX_BIGINT ? value : null;
  } catch {
    return null;
  }
}

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

export async function verifyResendWebhookSignature(input: {
  secret: string;
  eventId: string;
  timestamp: string;
  signatureHeader: string;
  body: string;
  now?: number;
}): Promise<boolean> {
  if (!input.secret.startsWith("whsec_") || !input.eventId || !/^\d{1,12}$/.test(input.timestamp)) return false;
  const timestampSeconds = Number(input.timestamp);
  if (Math.abs((input.now ?? Date.now()) / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false;

  let keyBytes: Uint8Array;
  try {
    const rawSecret = atob(input.secret.slice("whsec_".length));
    keyBytes = Uint8Array.from(rawSecret, (character) => character.charCodeAt(0));
  } catch {
    return false;
  }
  if (keyBytes.length === 0) return false;

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = new TextEncoder().encode(`${input.eventId}.${input.timestamp}.${input.body}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  const expected = btoa(binary);
  return input.signatureHeader.split(" ").some((entry) => {
    const [version, candidate] = entry.split(",", 2);
    return version === "v1" && typeof candidate === "string" && constantTimeEqual(candidate, expected);
  });
}
