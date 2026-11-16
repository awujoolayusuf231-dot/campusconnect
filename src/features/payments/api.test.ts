import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

import { formatSubscriptionPrice, parseSubscriptionPlan } from "./api";

describe("subscription plan values", () => {
  it("parses configured minor-unit prices without trusting unsafe amounts", () => {
    expect(parseSubscriptionPlan({
      code: "plus",
      display_name: "Plus",
      amount_minor: "500000",
      currency: "NGN",
      billing_interval: "year",
      interval_count: 1,
    })).toEqual({
      code: "plus",
      display_name: "Plus",
      amount_minor: 500000,
      currency: "NGN",
      billing_interval: "year",
      interval_count: 1,
    });
    expect(parseSubscriptionPlan({
      code: "pro",
      display_name: "Pro",
      amount_minor: Number.MAX_SAFE_INTEGER + 1,
      currency: "NGN",
      billing_interval: "month",
      interval_count: 1,
    })).toBeNull();
    expect(parseSubscriptionPlan({
      code: "plus",
      display_name: "Plus",
      amount_minor: 0,
      currency: "NGN",
      billing_interval: "month",
      interval_count: 1,
    })).toBeNull();
    expect(parseSubscriptionPlan({
      code: "plus",
      display_name: "Plus",
      amount_minor: 100,
      currency: "NG",
      billing_interval: "month",
      interval_count: 1,
    })).toBeNull();
  });

  it("formats provider minor units using the currency's fractional digits", () => {
    expect(formatSubscriptionPrice(500000, "NGN")).toContain("5,000");
    expect(() => formatSubscriptionPrice(-1, "NGN")).toThrow("The subscription price is invalid.");
  });
});
