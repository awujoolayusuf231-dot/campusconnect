import { describe, expect, it } from "vitest";
import { portfolioCompletion, validatePortfolio, validatePortfolioItem, type PortfolioInput } from "@/features/portfolio/api";

const validPortfolio: PortfolioInput = {
  slug: "student-name",
  display_name: "Student Name",
  avatar_path: null,
  headline: null,
  summary: null,
  contact_email: null,
  show_contact_email: false,
  location: null,
  website_url: null,
  linkedin_url: null,
  github_url: null,
  template_key: "modern",
  accent_color: "#c52b3a",
  section_order: ["projects", "skills", "education"],
  is_public: false,
};

describe("portfolio input validation", () => {
  it("accepts a safe private portfolio and rejects unsafe links or slugs", () => {
    expect(validatePortfolio(validPortfolio)).toBeNull();
    expect(validatePortfolio({ ...validPortfolio, slug: "bad_slug" })).toContain("slug");
    expect(validatePortfolio({ ...validPortfolio, website_url: "javascript:alert(1)" })).toContain("HTTPS");
  });

  it("requires a supported skill proficiency and bounded item ordering", () => {
    expect(validatePortfolioItem({
      item_type: "skill", content: { name: "Research", proficiency: "Advanced" },
      is_public: false, sort_order: 0,
    })).toBeNull();
    expect(validatePortfolioItem({
      item_type: "skill", content: { name: "Research", proficiency: "Superstar" },
      is_public: false, sort_order: 0,
    })).toContain("proficiency");
    expect(validatePortfolioItem({
      item_type: "project", content: { title: "Work" },
      is_public: false, sort_order: 32768,
    })).toContain("order");
  });

  it("derives completion only from saved profile details and item types", () => {
    expect(portfolioCompletion(null)).toBe(0);
    const portfolio = {
      ...validPortfolio,
      id: "portfolio", owner_id: "owner", created_at: "", updated_at: "",
      display_name: "Name", headline: "Developer", summary: "About",
      items: [{ item_type: "project" }, { item_type: "skill" }],
    } as Parameters<typeof portfolioCompletion>[0];
    expect(portfolioCompletion(portfolio)).toBe(71);
  });
});
