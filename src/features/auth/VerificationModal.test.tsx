import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      resend: mocks.resend,
    },
    functions: { invoke: mocks.invoke },
  },
}));

import { VerificationModal } from "./VerificationModal";

describe("VerificationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { email_updated: true }, error: null });
    mocks.resend.mockResolvedValue({ error: null });
  });

  it("verifies the signup password before correcting the address and resending", async () => {
    const onEmailUpdated = vi.fn();
    render(
      <MemoryRouter>
        <VerificationModal email="old@example.com" userId="pending-user-id" onEmailUpdated={onEmailUpdated} onCancel={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /wrong email/i }));
    fireEvent.change(screen.getByLabelText("Correct email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Signup password"), { target: { value: "ExamplePassword1" } });
    fireEvent.click(screen.getByRole("button", { name: /update email and resend/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("correct-unverified-signup-email", {
      body: {
        user_id: "pending-user-id",
        current_email: "old@example.com",
        new_email: "new@example.com",
        password: "ExamplePassword1",
      },
    }));
    await waitFor(() => expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    }));
    expect(onEmailUpdated).toHaveBeenCalledWith("new@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(/fresh verification link/i);
  });

  it("lets a user cancel the pending verification dialog", () => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter>
        <VerificationModal email="old@example.com" userId="pending-user-id" onEmailUpdated={vi.fn()} onCancel={onCancel} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("explains when the correction service could not update the email address", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({
        error: "email_update_failed",
        provider_code: "validation_failed",
      }), { status: 500 })),
    });
    render(
      <MemoryRouter>
        <VerificationModal email="old@example.com" userId="pending-user-id" onEmailUpdated={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /wrong email/i }));
    fireEvent.change(screen.getByLabelText("Correct email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Signup password"), { target: { value: "ExamplePassword1" } });
    fireEvent.click(screen.getByRole("button", { name: /update email and resend/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Supabase Auth rejected the email update \(code: validation_failed\)/i);
    errorSpy.mockRestore();
  });

  it("shows the Auth provider status when no provider error code is available", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({
        error: "email_update_failed",
        provider_code: "unknown",
        provider_status: 422,
      }), { status: 500 })),
    });
    render(
      <MemoryRouter>
        <VerificationModal email="old@example.com" userId="pending-user-id" onEmailUpdated={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /wrong email/i }));
    fireEvent.change(screen.getByLabelText("Correct email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Signup password"), { target: { value: "ExamplePassword1" } });
    fireEvent.click(screen.getByRole("button", { name: /update email and resend/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Supabase Auth rejected the email update \(HTTP 422\)/i);
    errorSpy.mockRestore();
  });

  it("explains when the corrected email is already in use", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({
        error: "email_unavailable",
      }), { status: 409 })),
    });
    render(
      <MemoryRouter>
        <VerificationModal email="old@example.com" userId="pending-user-id" onEmailUpdated={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /wrong email/i }));
    fireEvent.change(screen.getByLabelText("Correct email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Signup password"), { target: { value: "ExamplePassword1" } });
    fireEvent.click(screen.getByRole("button", { name: /update email and resend/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already associated with another account/i);
    errorSpy.mockRestore();
  });
});
