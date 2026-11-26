import { describe, expect, it, vi } from "vitest";
import { contactNamesFromMetadata, syncResendContact } from "./resendContactsLogic";

function contact(id: string, unsubscribed: boolean, updatedAt = "2026-01-01T00:00:00.000Z") {
  return new Response(JSON.stringify({ id, unsubscribed, updated_at: updatedAt }), { status: 200 });
}

function baseInput(fetcher: typeof fetch) {
  return {
    apiKey: "test_key",
    segmentId: "segment-1",
    email: "  STUDENT@example.com ",
    firstName: "Ada",
    lastName: "Okafor",
    marketingConsent: false,
    emailVerified: false,
    providerUnsubscribed: false,
    resubscribeAllowed: false,
    fetcher,
  };
}

describe("Resend contact sync", () => {
  it("uses explicit names or derives first and last names from the signup display name", () => {
    expect(contactNamesFromMetadata({ display_name: "Ada Augusta Okafor" })).toEqual({
      firstName: "Ada",
      lastName: "Augusta Okafor",
    });
    expect(contactNamesFromMetadata({ first_name: "Ada", last_name: "Okafor", display_name: "Other Name" })).toEqual({
      firstName: "Ada",
      lastName: "Okafor",
    });
  });

  it("keeps unverified or non-consenting contacts unsubscribed", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(contact("contact-1", true));
    const result = await syncResendContact(baseInput(fetcher));
    const createCall = fetcher.mock.calls[1];

    expect(result).toMatchObject({ result: "synced", providerContactId: "contact-1" });
    expect(String(createCall[0])).toBe("https://api.resend.com/contacts");
    expect(JSON.parse(String(createCall[1]?.body))).toEqual({
      email: "student@example.com",
      first_name: "Ada",
      last_name: "Okafor",
      unsubscribed: true,
      segments: [{ id: "segment-1" }],
    });
  });

  it("creates verified opted-in contacts as subscribed", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: "contact", id: "contact-2" }), { status: 200 }));
    const result = await syncResendContact({
      ...baseInput(fetcher),
      marketingConsent: true,
      emailVerified: true,
    });

    expect(result.result).toBe("synced");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      unsubscribed: false,
      segments: [{ id: "segment-1" }],
    });
  });

  it("keeps opted-in but unverified contacts unsubscribed", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "contact-unverified" }), { status: 200 }));
    await syncResendContact({
      ...baseInput(fetcher),
      marketingConsent: true,
      emailVerified: false,
    });

    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).unsubscribed).toBe(true);
  });

  it("updates duplicate/existing contacts without overriding an unsubscribe", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(contact("contact-3", true, "2026-01-03T00:00:00.000Z"))
      .mockResolvedValueOnce(contact("contact-3", true))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const result = await syncResendContact({
      ...baseInput(fetcher),
      marketingConsent: true,
      emailVerified: true,
    });

    expect(result).toMatchObject({ result: "synced", providerUnsubscribed: true });
    expect(fetcher.mock.calls[1][0]).toBe("https://api.resend.com/contacts/contact-3");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      first_name: "Ada",
      last_name: "Okafor",
      unsubscribed: true,
    });
    expect(fetcher.mock.calls[2][0]).toBe("https://api.resend.com/contacts/contact-3/segments/segment-1");
  });

  it("allows explicit consent granted after an older unsubscribe", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(contact("contact-4", true, "2026-01-01T00:00:00.000Z"))
      .mockResolvedValueOnce(contact("contact-4", false))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const result = await syncResendContact({
      ...baseInput(fetcher),
      marketingConsent: true,
      emailVerified: true,
      resubscribeAllowed: true,
    });

    expect(result).toMatchObject({ result: "synced", providerUnsubscribed: false });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).unsubscribed).toBe(false);
  });

  it("retries duplicate-create races and transient provider failures", async () => {
    const duplicateFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(contact("contact-5", true))
      .mockResolvedValueOnce(contact("contact-5", true))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const duplicate = await syncResendContact(baseInput(duplicateFetch));
    expect(duplicate.result).toBe("synced");

    const temporaryFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(syncResendContact(baseInput(temporaryFetch))).resolves.toMatchObject({
      result: "retry",
      errorCode: "resend_contact_http_503",
    });

    const permanentFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await expect(syncResendContact(baseInput(permanentFetch))).resolves.toMatchObject({
      result: "failed",
      errorCode: "resend_contact_http_422",
    });
  });

  it("retries when adding an existing contact to the configured segment fails temporarily", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(contact("contact-segment", false))
      .mockResolvedValueOnce(contact("contact-segment", false))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(syncResendContact({
      ...baseInput(fetcher),
      marketingConsent: true,
      emailVerified: true,
    })).resolves.toMatchObject({
      result: "retry",
      errorCode: "resend_contact_segment_http_503",
    });
  });

  it("does not automatically resubscribe a known provider unsubscribe", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(contact("contact-6", true))
      .mockResolvedValueOnce(contact("contact-6", true))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const result = await syncResendContact({
      ...baseInput(fetcher),
      marketingConsent: true,
      emailVerified: true,
      providerUnsubscribed: true,
    });
    expect(result).toMatchObject({ result: "synced", providerUnsubscribed: true });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).unsubscribed).toBe(true);
  });
});
