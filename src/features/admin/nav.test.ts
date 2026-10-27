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
