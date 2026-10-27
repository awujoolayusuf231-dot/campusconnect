import { describe, expect, it } from "vitest";
import { scrub } from "./observability";

describe("scrub", () => {
  it("removes email addresses", () => expect(scrub("failed for ada@example.com today")).toBe("failed for [email] today"));
  it("removes JWT-like tokens", () => expect(scrub("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijk used")).toBe("token [token] used"));
  it("redacts bearer headers", () => expect(scrub("Authorization: Bearer abc123def")).not.toContain("abc123def"));
  it("redacts bare bearer tokens", () => expect(scrub("sent Bearer abc.def-123 to server")).toBe("sent Bearer [redacted] to server"));
  it("redacts password and apikey assignments", () => { expect(scrub("password=hunter2 ok")).not.toContain("hunter2"); expect(scrub("apikey: sk_live_1234")).not.toContain("sk_live_1234"); });
  it("hides very long opaque strings", () => expect(scrub("key " + "a".repeat(50))).toBe("key [long-string]"));
  it("leaves ordinary text alone", () => expect(scrub("Could not load posts")).toBe("Could not load posts"));
});
