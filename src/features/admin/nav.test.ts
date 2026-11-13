import { describe, expect, it } from "vitest";
import { visibleNav } from "./nav";

describe("visibleNav", () => {
  it("shows nothing without permissions", () => expect(visibleNav([])).toEqual([]));
  it("moderator (users.view only) sees Users but not Dashboard", () => {
    const labels = visibleNav(["users.view"]).flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual(["Users"]);
  });
  it("reports.manage shows the Reports page", () => {
    expect(visibleNav(["reports.manage"]).flatMap((s) => s.items.map((i) => i.label))).toEqual(["Reports"]);
  });
  it("shows question review and catalog only with their respective permissions", () => {
    expect(visibleNav(["past_questions.review"]).flatMap((s) => s.items.map((i) => i.label))).toContain("Question review");
    expect(visibleNav(["past_questions.review"]).flatMap((s) => s.items.map((i) => i.label))).not.toContain("Academic catalog");
    expect(visibleNav(["past_questions.manage"]).flatMap((s) => s.items.map((i) => i.label))).toContain("Academic catalog");
  });
  it("shows Study Notes review only with its review permission", () => {
    const labels = visibleNav(["study_notes.review"]).flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toContain("Study Notes review");
    expect(labels).not.toContain("Question review");
  });
  it("admin-style permissions show communities and announcements", () => {
    const labels = visibleNav(["communities.manage", "announcements.manage"]).flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual(["Communities", "Announcements"]);
  });
  it("owner-only pages need their own permissions", () => {
    const labels = visibleNav(["settings.manage", "audit.view", "staff.view", "institutions.manage", "opportunities.manage"]).flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual(expect.arrayContaining(["Settings and flags", "Audit log", "Staff", "Institutions", "Opportunities"]));
  });
  it("a moderator never sees platform pages", () => {
    const labels = visibleNav(["users.view", "content.moderate", "reports.manage"]).flatMap((s) => s.items.map((i) => i.label));
    expect(labels).not.toContain("Settings and flags"); expect(labels).not.toContain("Audit log"); expect(labels).not.toContain("Staff");
  });
  it("analytics + users sees both", () => {
    expect(visibleNav(["analytics.view", "users.view"]).flatMap((s) => s.items)).toHaveLength(2);
  });
});
