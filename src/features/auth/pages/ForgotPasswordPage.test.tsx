import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } },
}));

import { ForgotPasswordPage } from "./ForgotPasswordPage";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests a recovery link through the configured Supabase SMTP flow", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "student@example.com",
      { redirectTo: `${window.location.origin}/reset-password` },
    ));
    expect(await screen.findByRole("status")).toHaveTextContent(/if that email is registered/i);
  });

  it("surfaces provider failures without revealing account existence", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: "SMTP unavailable" } });
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t send the reset link/i);
    expect(screen.queryByText(/registered address/i)).not.toBeInTheDocument();
  });
});
