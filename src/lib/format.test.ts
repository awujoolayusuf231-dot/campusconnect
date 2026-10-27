import { describe, expect, it } from "vitest";
import { formatCount, pluralize } from "./format";

describe("formatCount", () => {
  it("keeps small numbers exact", () => { expect(formatCount(0)).toBe("0"); expect(formatCount(999)).toBe("999"); expect(formatCount(9999)).toBe("9999"); });
  it("abbreviates large numbers", () => { expect(formatCount(12_500)).toBe("12.5K"); expect(formatCount(2_000_000)).toBe("2M"); });
});
describe("pluralize", () => {
  it("handles one and many", () => { expect(pluralize(1, "follower")).toBe("1 follower"); expect(pluralize(2, "follower")).toBe("2 followers"); expect(pluralize(0, "post")).toBe("0 posts"); });
});
