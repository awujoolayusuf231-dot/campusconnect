import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { session: null as unknown, loading: false } }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/publicSettings", () => ({
  usePublicSettings: () => ({ data: { platform_name: "CampusConnect", registration_open: true } }),
}));

import { HomePage } from "./HomePage";

describe("public landing page", () => {
  it("shows the campus introduction and account actions to signed-out visitors", () => {
    auth.value = { session: null, loading: false };
    render(<MemoryRouter initialEntries={["/"]}><HomePage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /your campus, connected/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /i already have an account/i })).toHaveAttribute("href", "/login");
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
