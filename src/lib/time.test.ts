import { describe, expect, it } from "vitest";
import { timeAgo } from "./time";

describe("timeAgo", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("handles seconds", () => expect(timeAgo("2026-10-20T11:59:40Z", now)).toBe("just now"));
  it("handles minutes", () => expect(timeAgo("2026-10-20T11:55:00Z", now)).toContain("5 minutes ago"));
  it("handles hours", () => expect(timeAgo("2026-10-20T09:00:00Z", now)).toContain("3 hours ago"));
});
