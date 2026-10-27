import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth } }));

import { GoogleSignInButton } from "./GoogleSignInButton";

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    auth.signInWithOAuth.mockReset();
  });

  it("starts Google OAuth with the requested callback URL", () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    render(<GoogleSignInButton redirectTo="https://campusconnect.example/app" />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://campusconnect.example/app" },
    });
  });

  it("shows a clear error when Google OAuth cannot be started", async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: new Error("provider disabled") });
    render(<GoogleSignInButton redirectTo="https://campusconnect.example/app" />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/google sign-in could not be started/i);
  });
});
