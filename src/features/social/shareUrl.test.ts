import { describe, expect, it } from "vitest";
import { postShareUrl } from "./api";

describe("postShareUrl", () => {
  it("builds an in-app deep link on the given origin", () => expect(postShareUrl("abc-123", "https://campus.example.ng")).toBe("https://campus.example.ng/app/p/abc-123"));
});
