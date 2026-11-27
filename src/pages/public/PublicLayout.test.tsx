import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/lib/publicSettings", () => ({
  usePublicSettings: () => ({ data: { platform_name: "CampusConnect" } }),
}));

import { PublicLayout } from "./PublicLayout";

describe("PublicLayout", () => {
  it("provides accessible official social links while preserving legal links", () => {
    render(<MemoryRouter><PublicLayout><p>Page content</p></PublicLayout></MemoryRouter>);

    const socialSection = screen.getByRole("region", { name: "Follow CampusConnect" });
    const socials = [
      ["TikTok @campus.connect36 (opens in a new tab)", "https://www.tiktok.com/@campus.connect36"],
      ["X @campusconnectai (opens in a new tab)", "https://x.com/campusconnectai"],
      ["Instagram @campus_connectai (opens in a new tab)", "https://www.instagram.com/campus_connectai/"],
    ] as const;

    for (const [label, href] of socials) {
      const link = within(socialSection).getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveTextContent("");
      expect(link.querySelector("svg")).toBeInTheDocument();
    }

    expect(screen.getByRole("navigation", { name: "Legal" })).toHaveTextContent("Community guidelines");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("keeps the public site header sticky above page content", () => {
    render(<MemoryRouter><PublicLayout><p>Page content</p></PublicLayout></MemoryRouter>);

    expect(screen.getByRole("banner")).toHaveClass("sticky", "top-0", "z-40");
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
