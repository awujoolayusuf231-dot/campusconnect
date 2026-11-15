import { describe, expect, it } from "vitest";
import { validateCelebration, type SaveCelebrationInput } from "./api";

const card: SaveCelebrationInput = {
  title: "Happy birthday",
  category: "birthday",
  celebrant_name: "Amina",
  celebration_at: "2026-11-20T12:00:00.000Z",
  timezone: "Africa/Lagos",
  message: "Wishing you a wonderful year.",
  venue: null,
  whiteshirt_url: null,
  template_id: "birthday-balloons",
  customization: {
    background: "#8e2433",
    accent: "#ffd166",
    text: "#fffaf2",
    align: "center",
    font: "display",
    photoX: 50,
    photoY: 72,
    photoScale: 1,
  },
  photoPath: null,
  publish: true,
};

describe("Celebration card validation", () => {
  it("accepts a valid occasion-specific card", () => {
    expect(validateCelebration(card)).toBeNull();
  });

  it("rejects unsupported Whiteshirt hosts and non-HTTPS links", () => {
    expect(validateCelebration({ ...card, whiteshirt_url: "http://whiteshirt.fun/card" })).toMatch(/whiteshirt/i);
    expect(validateCelebration({ ...card, whiteshirt_url: "https://example.com/card" })).toMatch(/whiteshirt/i);
  });

  it("rejects invalid theme colors and photo placement values", () => {
    expect(validateCelebration({ ...card, customization: { ...card.customization, background: "red" } })).toMatch(/colors/i);
    expect(validateCelebration({ ...card, customization: { ...card.customization, photoScale: 2 } })).toMatch(/image position/i);
  });
});
