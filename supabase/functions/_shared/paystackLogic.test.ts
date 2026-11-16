import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isValidPaystackSignature,
  matchesExpectedTransaction,
  parsePaystackCallbackUrl,
  parseCheckoutPlan,
  parseCheckoutRequest,
} from "./paystackLogic";

describe("Paystack subscription payment decisions", () => {
  it("accepts only a valid SHA-512 signature over the exact webhook body", async () => {
    const secret = "test-only-secret";
    const rawBody = '{"event":"charge.success","data":{"reference":"cc_ref"}}';
    const signature = createHmac("sha512", secret).update(rawBody).digest("hex");

    await expect(isValidPaystackSignature(rawBody, signature, secret)).resolves.toBe(true);
    await expect(isValidPaystackSignature(`${rawBody} `, signature, secret)).resolves.toBe(false);
    await expect(isValidPaystackSignature(rawBody, "not-a-signature", secret)).resolves.toBe(false);
    await expect(isValidPaystackSignature(rawBody, null, secret)).resolves.toBe(false);
  });

  it("verifies webhook bytes without decoding or normalizing the request body", async () => {
    const secret = "test-only-secret";
    const rawBytes = new Uint8Array([0x7b, 0xff, 0x7d]);
    const signature = createHmac("sha512", secret).update(rawBytes).digest("hex");

    await expect(isValidPaystackSignature(rawBytes, signature, secret)).resolves.toBe(true);
    await expect(isValidPaystackSignature(new TextDecoder().decode(rawBytes), signature, secret))
      .resolves.toBe(false);
  });

  it("accepts only a plan code and never takes a client price or tier override", () => {
    expect(parseCheckoutRequest({
      plan_code: "plus",
      billing_interval: "month",
      amount: 1,
      amount_minor: 1,
      tier: "free",
    })).toEqual({ planCode: "plus", billingInterval: "month" });
    expect(parseCheckoutRequest({ plan_code: "free", billing_interval: "month" })).toBeNull();
    expect(parseCheckoutRequest({ plan_code: "plus", billing_interval: "year", amount: "1" }))
      .toEqual({ planCode: "plus", billingInterval: "year" });
    expect(parseCheckoutRequest({ plan_code: "plus" })).toBeNull();
  });

  it("accepts only valid server-configured checkout prices", () => {
    expect(parseCheckoutPlan({
      amount_minor: "500000",
      currency: "NGN",
      billing_interval: "year",
      interval_count: 1,
    })).toEqual({
      amount: 500000,
      currency: "NGN",
      billingInterval: "year",
      intervalCount: 1,
    });
    expect(parseCheckoutPlan({
      amount_minor: Number.MAX_SAFE_INTEGER + 1,
      currency: "NGN",
      billing_interval: "year",
      interval_count: 1,
    })).toBeNull();
  });

  it("allows only HTTPS payment callbacks outside localhost", () => {
    expect(parsePaystackCallbackUrl("https://campusconnect.example/app/subscribe"))
      .toBe("https://campusconnect.example/app/subscribe");
    expect(parsePaystackCallbackUrl("http://campusconnect.example/app/subscribe")).toBeNull();
    expect(parsePaystackCallbackUrl("http://localhost:5173/app/subscribe"))
      .toBe("http://localhost:5173/app/subscribe");
  });

  it("requires Paystack's verified reference, amount, and currency to match backend pricing", () => {
    const expected = { reference: "ref", amount: 500000, currency: "NGN" };
    expect(matchesExpectedTransaction({
      ...expected,
      status: "failed",
      id: 17,
    }, expected)).toBe(true);
    expect(matchesExpectedTransaction({
      reference: "ref",
      amount: 500000,
      currency: "NGN",
      status: "success",
      id: 17,
    }, { ...expected, amount: "500000" })).toBe(true);
    expect(matchesExpectedTransaction({
      reference: "ref",
      amount: 1,
      currency: "NGN",
      status: "success",
      id: 17,
    }, expected)).toBe(false);
  });

});
