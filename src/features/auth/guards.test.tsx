import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { session: null as unknown, role: "student", loading: false } }));
vi.mock("./AuthProvider", () => ({ useAuth: () => auth.value }));
import { RequireAuth, RequireStaff } from "./guards";

const tree = (guard: ReactElement, path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/" element={<p>home</p>} />
      <Route element={guard}><Route path="/admin" element={<p>admin area</p>} /><Route path="/feed" element={<p>feed</p>} /></Route>
    </Routes>
  </MemoryRouter>
);

describe("route guards", () => {
  it("redirects anonymous users to login", () => {
    auth.value = { session: null, role: "student", loading: false };
    render(tree(<RequireAuth />, "/feed"));
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
  it("keeps students out of /admin", () => {
    auth.value = { session: {}, role: "student", loading: false };
    render(tree(<RequireStaff />, "/admin"));
    expect(screen.queryByText("admin area")).not.toBeInTheDocument();
    expect(screen.getByText("home")).toBeInTheDocument();
  });
  it("lets moderators reach the admin shell", () => {
    auth.value = { session: {}, role: "moderator", loading: false };
    render(tree(<RequireStaff />, "/admin"));
    expect(screen.getByText("admin area")).toBeInTheDocument();
  });
});
