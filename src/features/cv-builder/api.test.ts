import { describe, expect, it } from "vitest";
import {
  newCvContent,
  newCvEntry,
  newCvSection,
  parseCvContent,
  validateCv,
  type CvContent,
} from "@/features/cv-builder/api";

describe("CV content validation", () => {
  it("creates distinct section and entry identities for reorderable records", () => {
    const first = newCvSection("education");
    const second = newCvSection("education");
    expect(first.id).not.toBe(second.id);
    expect(newCvEntry().id).not.toBe(newCvEntry().id);
  });

  it("accepts a minimal CV while rejecting unsupported templates and unsafe links", () => {
    const content = newCvContent();
    expect(validateCv("My CV", "modern_professional", content)).toBeNull();
    expect(validateCv("My CV", "not-a-template", content)).toContain("template");
    const withUnsafeLink: CvContent = {
      ...content,
      sections: [{
        ...newCvSection("projects"),
        entries: [{ ...newCvEntry(), url: "javascript:alert(1)" }],
      }],
    };
    expect(validateCv("My CV", "modern_professional", withUnsafeLink)).toContain("HTTPS");
  });

  it("surfaces malformed saved CV JSON instead of silently turning it into an empty document", () => {
    expect(() => parseCvContent({ full_name: "Student", sections: "not-an-array" })).toThrow("invalid saved content");
  });

  it("rejects documents that exceed the database's JSON size limit", () => {
    const content = { ...newCvContent(), summary: "x".repeat(2000), sections: Array.from({ length: 12 }, (_, index) => ({
      ...newCvSection("projects"),
      id: `section-${index}`,
      entries: Array.from({ length: 30 }, () => ({
        ...newCvEntry(),
        description: "x".repeat(2000),
      })),
    })) };
    expect(validateCv("Large CV", "modern_professional", content)).toContain("too large");
  });
});
