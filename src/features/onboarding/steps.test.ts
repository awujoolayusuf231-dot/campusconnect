import { describe, expect, it } from "vitest";
import { computeOnboarding } from "./steps";

const none = { hasAvatar: false, hasInstitution: false, hasBio: false, following: 0, communities: 0, posts: 0 };
describe("computeOnboarding", () => {
  it("starts at 0%", () => { const r = computeOnboarding(none); expect(r.percent).toBe(0); expect(r.complete).toBe(false); expect(r.steps).toHaveLength(6); });
  it("needs three follows, not one", () => { expect(computeOnboarding({ ...none, following: 2 }).steps.find((s) => s.id === "follow")?.done).toBe(false); expect(computeOnboarding({ ...none, following: 3 }).steps.find((s) => s.id === "follow")?.done).toBe(true); });
  it("completes at 100%", () => { const r = computeOnboarding({ hasAvatar: true, hasInstitution: true, hasBio: true, following: 5, communities: 2, posts: 1 }); expect(r.percent).toBe(100); expect(r.complete).toBe(true); });
  it("rounds partial progress", () => expect(computeOnboarding({ ...none, hasAvatar: true, hasBio: true }).percent).toBe(33));
});
