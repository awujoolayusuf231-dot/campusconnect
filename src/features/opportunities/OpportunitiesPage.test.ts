import { describe, expect, it } from "vitest";
import { daysLeft, isSafeExternalUrl } from "./OpportunitiesPage";

describe("isSafeExternalUrl", () => {
  it.each(["https://acme.example/apply", "https://whiteshirt.fun/x?a=1"])("accepts %s", (u) => expect(isSafeExternalUrl(u)).toBe(true));
  it.each(["javascript:alert(1)", "http://acme.example", "data:text/html,hi", "https://", "", null, "https://a b.com"])("rejects %s", (u) => expect(isSafeExternalUrl(u as string | null)).toBe(false));
});
describe("daysLeft", () => {
  const now = new Date("2026-10-20T09:00:00");
  it("no deadline", () => expect(daysLeft(null, now)).toBeNull());
  it("tomorrow", () => expect(daysLeft("2026-10-21", now)).toBe("2 days left"));
  it("today", () => expect(daysLeft("2026-10-20", now)).toBe("1 day left"));
});
