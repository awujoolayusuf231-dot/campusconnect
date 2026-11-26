import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

import { AuthCallbackPage } from "./AuthCallbackPage";

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={["/auth/callback"]}>
      <CurrentPath />
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/app/profile/edit" element={<p>Profile setup opened</p>} />
        <Route path="/app" element={<p>Campus feed opened</p>} />
        <Route path="/login" element={<p>Login opened</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "student@example.com", email_confirmed_at: "2026-11-26T12:00:00Z" } } },
      error: null,
    });
  });

  it("shows confirmation and lets the user continue profile setup", async () => {
    renderCallback();

    expect(await screen.findByRole("heading", { name: "Email confirmed!" })).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/auth/callback");
    fireEvent.click(screen.getByRole("button", { name: /continue setting up your profile/i }));

    await waitFor(() => expect(screen.getByText("Profile setup opened")).toBeInTheDocument());
  });

  it("offers the campus feed as an alternate destination", async () => {
    renderCallback();

    fireEvent.click(await screen.findByRole("link", { name: "Go to campus feed" }));
    await waitFor(() => expect(screen.getByText("Campus feed opened")).toBeInTheDocument());
  });
});
