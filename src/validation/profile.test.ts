import { describe, expect, it } from "vitest";
import { celebrationUrlSchema, usernameSchema } from "./profile";

describe("celebrationUrlSchema", () => {
  it.each(["https://whiteshirt.fun/adewale", "https://www.whiteshirt.fun/x", "https://whiteshirt.fun"])("accepts %s", (u) => {
    expect(celebrationUrlSchema.safeParse(u).success).toBe(true);
  });
  it.each(["http://whiteshirt.fun/x", "https://whiteshirt.fun.evil.com/x", "https://whiteshirt.fun@evil.com/", "javascript:alert(1)", "https://evil.com/whiteshirt.fun"])("rejects %s", (u) => {
    expect(celebrationUrlSchema.safeParse(u).success).toBe(false);
  });
});
describe("usernameSchema", () => {
  it("normalizes case", () => expect(usernameSchema.parse(" Alice_01 ")).toBe("alice_01"));
  it("rejects short", () => expect(usernameSchema.safeParse("ab").success).toBe(false));
});
