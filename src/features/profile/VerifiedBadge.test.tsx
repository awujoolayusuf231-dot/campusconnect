import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerifiedBadge } from "./VerifiedBadge";
import { isVerifiedUsername } from "./verifiedAccounts";

describe("verified account badge", () => {
  it("recognizes only the designated usernames, regardless of casing or leading @", () => {
    expect(isVerifiedUsername("dewalexict")).toBe(true);
    expect(isVerifiedUsername("@AMPUS_ONNECT")).toBe(true);
    expect(isVerifiedUsername("campusconnect")).toBe(false);
    expect(isVerifiedUsername("another_user")).toBe(false);
    expect(isVerifiedUsername(null)).toBe(false);
  });

  it("renders a blue badge only for designated accounts", () => {
    const { rerender } = render(<VerifiedBadge username="dewalexict" />);
    const badge = screen.getByRole("img", { name: "CampusConnect verified account" });
    expect(badge).toBeVisible();
    expect(badge.querySelector("svg")).toHaveAttribute("fill", "#1877F2");

    rerender(<VerifiedBadge username="ampus_onnect" />);
    expect(screen.getByRole("img", { name: "CampusConnect verified account" })).toBeVisible();

    rerender(<VerifiedBadge username="regular_student" />);
    expect(screen.queryByRole("img", { name: "CampusConnect verified account" })).not.toBeInTheDocument();
  });
});
