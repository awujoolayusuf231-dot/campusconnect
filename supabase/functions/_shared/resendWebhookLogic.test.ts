import { describe, expect, it } from "vitest";
import {
  resendContactUnsubscribeFromEvent,
  resendOutboxIdFromTags,
  verifyResendWebhookSignature,
} from "./resendWebhookLogic";

async function signatureFor(secret: Uint8Array, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("Resend webhook signatures", () => {
  it("extracts a valid outbox ID from Resend's tagged event payload", () => {
    expect(resendOutboxIdFromTags([
      { name: "category", value: "activity" },
      { name: "email_outbox_id", value: "42" },
    ])).toBe("42");
    expect(resendOutboxIdFromTags({ email_outbox_id: "9223372036854775807" }))
      .toBe("9223372036854775807");
    expect(resendOutboxIdFromTags([{ name: "email_outbox_id", value: "9223372036854775808" }]))
      .toBeNull();
    expect(resendOutboxIdFromTags([{ name: "email_outbox_id", value: "../42" }]))
      .toBeNull();
  });

  it("accepts only unsubscribe events from the configured audience", () => {
    const data = {
      id: "contact-123",
      email: "student@example.com",
      segment_ids: ["segment-1"],
      unsubscribed: true,
    };
    expect(resendContactUnsubscribeFromEvent(data, "segment-1")).toEqual({
      contactId: "contact-123",
      email: "student@example.com",
    });
    expect(resendContactUnsubscribeFromEvent({
      ...data,
      audience_id: "legacy-audience",
    }, "legacy-audience")).toEqual({
      contactId: "contact-123",
      email: "student@example.com",
    });
    expect(resendContactUnsubscribeFromEvent({ ...data, unsubscribed: false }, "segment-1")).toBeNull();
    expect(resendContactUnsubscribeFromEvent(data, "another-segment")).toBeNull();
    expect(resendContactUnsubscribeFromEvent({ ...data, email: "invalid" }, "segment-1")).toBeNull();
  });

  it("accepts a valid recent signature and rejects changed or stale payloads", async () => {
    const now = 1_800_000_000_000;
    const timestamp = String(Math.floor(now / 1000));
    const eventId = "evt_123";
    const body = JSON.stringify({ type: "email.delivered" });
    const secretBytes = new TextEncoder().encode("test-only-webhook-secret");
    const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
    const signature = await signatureFor(secretBytes, `${eventId}.${timestamp}.${body}`);
    const input = {
      secret,
      eventId,
      timestamp,
      signatureHeader: `v1,${signature}`,
      body,
      now,
    };

    await expect(verifyResendWebhookSignature(input)).resolves.toBe(true);
    await expect(verifyResendWebhookSignature({ ...input, body: `${body} ` })).resolves.toBe(false);
    await expect(verifyResendWebhookSignature({ ...input, now: now + 600_000 })).resolves.toBe(false);
  });
});
