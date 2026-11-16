import { describe, expect, it } from "vitest";
import {
  decideDelivery,
  effectiveAccountStatus,
  isLocalSupabaseUrl,
  preferenceForNotification,
  shouldSendPush,
} from "./pushOutboxLogic";

describe("push outbox decisions", () => {
  it("rechecks category preferences for all user-controlled notification groups", () => {
    expect(preferenceForNotification("follow")).toBe("notify_follows");
    expect(preferenceForNotification("repost")).toBe("notify_likes");
    expect(preferenceForNotification("discussion_reply")).toBe("notify_discussions");
    expect(preferenceForNotification("celebration_reminder")).toBeNull();
  });

  it("allows only eligible accounts with push enabled and no block", () => {
    const eligible = {
      pushEnabled: true,
      categoryEnabled: true,
      accountStatus: "active",
      blocked: false,
    };
    expect(shouldSendPush(eligible)).toBe(true);
    expect(shouldSendPush({ ...eligible, accountStatus: "restricted" })).toBe(true);
    expect(shouldSendPush({ ...eligible, pushEnabled: false })).toBe(false);
    expect(shouldSendPush({ ...eligible, categoryEnabled: false })).toBe(false);
    expect(shouldSendPush({ ...eligible, accountStatus: "suspended" })).toBe(false);
    expect(shouldSendPush({ ...eligible, blocked: true })).toBe(false);
  });

  it("treats expired restrictions as active, matching account_effective_status", () => {
    const now = Date.parse("2026-01-02T00:00:00Z");
    expect(effectiveAccountStatus("restricted", "2026-01-01T00:00:00Z", now)).toBe("active");
    expect(effectiveAccountStatus("suspended", null, now)).toBe("suspended");
  });

  it("blocks local and non-HTTPS Supabase URLs from real push delivery", () => {
    expect(isLocalSupabaseUrl("http://kong:8000")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("https://example.supabase.co")).toBe(false);
  });

  it("retries total transient failures but avoids retrying successful partial delivery", () => {
    expect(decideDelivery([])).toEqual({ result: "failed", error: "no_registered_devices" });
    expect(decideDelivery([{
      ok: false,
      invalidToken: false,
      retryable: true,
      failureCode: "UNAVAILABLE",
    }])).toEqual({ result: "retry", error: "fcm_delivery_failed:UNAVAILABLE" });
    expect(decideDelivery([
      { ok: true, invalidToken: false, retryable: false, failureCode: null },
      { ok: false, invalidToken: false, retryable: true, failureCode: "UNAVAILABLE" },
    ])).toEqual({ result: "delivered", error: null });
    expect(decideDelivery([{
      ok: false,
      invalidToken: true,
      retryable: false,
      failureCode: "UNREGISTERED",
    }]).result).toBe("failed");
  });
});
