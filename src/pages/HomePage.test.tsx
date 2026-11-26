import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { session: null as unknown, loading: false } }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/publicSettings", () => ({
  usePublicSettings: () => ({ data: { platform_name: "CampusConnect", registration_open: true } }),
}));

import { HomePage } from "./HomePage";
import { MissionPage } from "./public/pages";

describe("public landing page", () => {
  it("shows the campus introduction and account actions to signed-out visitors", () => {
    auth.value = { session: null, loading: false };
    render(<MemoryRouter initialEntries={["/"]}><HomePage /></MemoryRouter>);

    expect(screen.getByRole("heading", { level: 1, name: /connect\. learn/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our Mission" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our Purpose" })).toBeInTheDocument();
    expect(screen.getByText(/our mission is to connect students across institutions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read our mission/i })).toHaveAttribute("href", "/mission");
    expect(screen.getByRole("link", { name: /join the community/i })).toHaveAttribute("href", "/register");
    expect(screen.getAllByRole("link", { name: /log in/i }).some((link) => link.getAttribute("href") === "/login")).toBe(true);
  });

  it("explains the mission on its own public page", () => {
    auth.value = { session: null, loading: false };
    render(<MemoryRouter><MissionPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { level: 1, name: "A more connected student experience." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connection that leads to growth." })).toBeInTheDocument();
  });

  it("sends signed-in visitors straight to the app", () => {
    auth.value = { session: {}, loading: false };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/app" element={<p>Student activities</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Student activities")).toBeInTheDocument();
  });
});
