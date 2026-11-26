export type ContactSyncResult = {
  result: "synced" | "retry" | "failed";
  providerContactId: string | null;
  providerUnsubscribed: boolean;
  errorCode: string | null;
};

type ResendContact = {
  id: string;
  unsubscribed: boolean;
};

type ProviderResponse =
  | { kind: "contact"; contact: ResendContact }
  | { kind: "missing" }
  | { kind: "error"; result: "retry" | "failed"; errorCode: string };

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, 80);
  return name || null;
}

export function contactNamesFromMetadata(metadata: unknown): { firstName: string | null; lastName: string | null } {
  if (!isRecord(metadata)) return { firstName: null, lastName: null };
  const firstName = cleanName(metadata.first_name);
  const lastName = cleanName(metadata.last_name);
  if (firstName || lastName) return { firstName, lastName };
  const displayName = cleanName(metadata.display_name ?? metadata.full_name ?? metadata.name);
  if (!displayName) return { firstName: null, lastName: null };
  const [first, ...rest] = displayName.split(/\s+/);
  return { firstName: cleanName(first), lastName: cleanName(rest.join(" ")) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function providerError(status: number): ProviderResponse {
  return {
    kind: "error",
    result: retryableStatus(status) ? "retry" : "failed",
    errorCode: `resend_contact_http_${status}`,
  };
}

async function requestContact(input: {
  apiKey: string;
  url: string;
  method: "GET" | "POST" | "PATCH";
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
}): Promise<ProviderResponse> {
  try {
    const response = await input.fetcher(input.url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (input.method === "GET" && response.status === 404) return { kind: "missing" };
    if (!response.ok) return providerError(response.status);

    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || typeof payload.id !== "string"
      || input.method === "GET" && typeof payload.unsubscribed !== "boolean") {
      return { kind: "error", result: "retry", errorCode: "resend_contact_invalid_response" };
    }
    return {
      kind: "contact",
      contact: {
        id: payload.id,
        unsubscribed: payload.unsubscribed === true,
      },
    };
  } catch (error) {
    return {
      kind: "error",
      result: "retry",
      errorCode: error instanceof Error && error.name === "TimeoutError"
        ? "resend_contact_timeout"
        : "resend_contact_network_error",
    };
  }
}

async function addContactToSegment(input: {
  apiKey: string;
  contactId: string;
  segmentId: string;
  fetcher: typeof fetch;
}): Promise<{ result: "ok" } | { result: "retry" | "failed"; errorCode: string }> {
  try {
    const response = await input.fetcher(
      `https://api.resend.com/contacts/${encodeURIComponent(input.contactId)}/segments/${encodeURIComponent(input.segmentId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.ok || response.status === 409) return { result: "ok" };
    return {
      result: retryableStatus(response.status) ? "retry" : "failed",
      errorCode: `resend_contact_segment_http_${response.status}`,
    };
  } catch (error) {
    return {
      result: "retry",
      errorCode: error instanceof Error && error.name === "TimeoutError"
        ? "resend_contact_segment_timeout"
        : "resend_contact_segment_network_error",
    };
  }
}

export async function syncResendContact(input: {
  apiKey: string;
  segmentId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  marketingConsent: boolean;
  emailVerified: boolean;
  providerUnsubscribed: boolean;
  resubscribeAllowed: boolean;
  fetcher?: typeof fetch;
}): Promise<ContactSyncResult> {
  const email = input.email.trim().toLowerCase();
  const baseUrl = "https://api.resend.com/contacts";
  const emailUrl = `${baseUrl}/${encodeURIComponent(email)}`;
  const fetcher = input.fetcher ?? fetch;
  const contactBody: Record<string, unknown> = {};
  if (input.firstName) contactBody.first_name = input.firstName;
  if (input.lastName) contactBody.last_name = input.lastName;
  const optedInAndVerified = input.marketingConsent && input.emailVerified;

  const lookup = await requestContact({ apiKey: input.apiKey, url: emailUrl, method: "GET", fetcher });
  if (lookup.kind === "error") {
    return { result: lookup.result, providerContactId: null, providerUnsubscribed: false, errorCode: lookup.errorCode };
  }
  if (lookup.kind === "missing") {
    const created = await requestContact({
      apiKey: input.apiKey,
      url: baseUrl,
      method: "POST",
      body: {
        email,
        ...contactBody,
        unsubscribed: !optedInAndVerified || input.providerUnsubscribed,
        segments: [{ id: input.segmentId }],
      },
      fetcher,
    });
    if (created.kind === "contact") {
      return {
        result: "synced",
        providerContactId: created.contact.id,
        providerUnsubscribed: input.providerUnsubscribed,
        errorCode: null,
      };
    }
    if (created.kind === "error" && created.errorCode === "resend_contact_http_409") {
      const duplicate = await requestContact({ apiKey: input.apiKey, url: emailUrl, method: "GET", fetcher });
      if (duplicate.kind === "contact") {
        return updateExisting(duplicate.contact);
      }
      if (duplicate.kind === "error") {
        return { result: duplicate.result, providerContactId: null, providerUnsubscribed: false, errorCode: duplicate.errorCode };
      }
      return { result: "retry", providerContactId: null, providerUnsubscribed: false, errorCode: "resend_contact_duplicate_lookup_missing" };
    }
    if (created.kind === "error") {
      return { result: created.result, providerContactId: null, providerUnsubscribed: false, errorCode: created.errorCode };
    }
    return { result: "retry", providerContactId: null, providerUnsubscribed: false, errorCode: "resend_contact_create_unexpected_response" };
  }

  return updateExisting(lookup.contact);

  async function updateExisting(contact: ResendContact): Promise<ContactSyncResult> {
    const observedProviderUnsubscribe = contact.unsubscribed
      && optedInAndVerified
      && !input.providerUnsubscribed
      && !input.resubscribeAllowed;
    const keepUnsubscribed = !optedInAndVerified || input.providerUnsubscribed || observedProviderUnsubscribe;
    const updated = await requestContact({
      apiKey: input.apiKey,
      url: `${baseUrl}/${encodeURIComponent(contact.id)}`,
      method: "PATCH",
      body: {
        ...contactBody,
        ...(keepUnsubscribed ? { unsubscribed: true } : {}),
        ...(contact.unsubscribed && optedInAndVerified && !keepUnsubscribed ? { unsubscribed: false } : {}),
      },
      fetcher,
    });
    if (updated.kind === "contact") {
      const segment = await addContactToSegment({
        apiKey: input.apiKey,
        contactId: updated.contact.id,
        segmentId: input.segmentId,
        fetcher,
      });
      if (segment.result !== "ok") {
        return {
          result: segment.result,
          providerContactId: updated.contact.id,
          providerUnsubscribed: false,
          errorCode: segment.errorCode,
        };
      }
      return {
        result: "synced",
        providerContactId: updated.contact.id,
        providerUnsubscribed: input.providerUnsubscribed || observedProviderUnsubscribe,
        errorCode: null,
      };
    }
    if (updated.kind === "error") {
      return { result: updated.result, providerContactId: null, providerUnsubscribed: false, errorCode: updated.errorCode };
    }
    return { result: "retry", providerContactId: null, providerUnsubscribed: false, errorCode: "resend_contact_update_unexpected_response" };
  }
}
