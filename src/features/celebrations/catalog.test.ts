import { describe, expect, it } from "vitest";
import { CELEBRATION_LAYOUTS, CELEBRATION_OCCASIONS, CELEBRATION_TEMPLATES, templatesForOccasion } from "./catalog";

describe("Celebration Studio catalog", () => {
  it("provides four different layouts for every requested occasion", () => {
    expect(CELEBRATION_OCCASIONS).toHaveLength(16);
    expect(CELEBRATION_TEMPLATES).toHaveLength(64);

    for (const occasion of CELEBRATION_OCCASIONS) {
      const templates = templatesForOccasion(occasion.id);
      expect(templates).toHaveLength(4);
      expect(new Set(templates.map((template) => template.layout))).toEqual(new Set(CELEBRATION_LAYOUTS.map((layout) => layout.id)));
      expect(new Set(templates.map((template) => template.id)).size).toBe(4);
    }
  });

  it("uses the dedicated Whiteshirt link instead of a birthday gift-link field", () => {
    const birthday = CELEBRATION_OCCASIONS.find((occasion) => occasion.id === "birthday");

    expect(birthday?.fields.map((field) => field.key)).not.toContain("personal_link");
  });
});