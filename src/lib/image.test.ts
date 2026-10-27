import { describe, expect, it } from "vitest";
import { fitWithin } from "./image";

describe("fitWithin", () => {
  it("scales the longest side down to the limit and keeps the ratio", () => { expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 }); expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 }); });
  it("never enlarges small images", () => expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 }));
  it("handles degenerate sizes", () => expect(fitWithin(0, 0, 1600)).toEqual({ width: 1, height: 1 }));
});
