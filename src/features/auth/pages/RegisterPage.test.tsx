import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterPage } from "./RegisterPage";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    auth: { signUp: mocks.signUp },
  },
}));
vi.mock("@/lib/publicSettings", () => ({
  usePublicSettings: () => ({ data: { registration_open: true } }),
}));
vi.mock("@/features/institutions/api", () => ({
  listActiveInstitutions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/institutions/InstitutionPicker", () => ({
  InstitutionPicker: () => createElement("select", { "aria-label": "Institution (optional)" }),
}));
vi.mock("@/features/auth/AuthPageLayout", () => ({
  AuthPageLayout: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/features/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => createElement("button", { type: "button" }, "Continue with Google"),
}));
vi.mock("@/features/auth/PasswordInput", () => ({
  PasswordInput: forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) =>
    createElement("input", { ...props, ref, type: "password" })),
}));
vi.mock("@/features/auth/VerificationModal", () => ({
  VerificationModal: () => null,
}));

function renderRegisterPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(MemoryRouter, null,
    createElement(QueryClientProvider, { client }, createElement(RegisterPage)),
  ));
}

async function completeSignup(marketingConsent: boolean) {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada Okafor" } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ada_okafor" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText("Create a password"), { target: { value: "Password123" } });
  if (marketingConsent) {
    fireEvent.click(screen.getByRole("checkbox", {
      name: /Send me optional CampusConnect news/,
    }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Create your account" }));
  await waitFor(() => expect(mocks.signUp).toHaveBeenCalledOnce());
}

describe("RegisterPage marketing consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("does not opt new users into marketing by default", async () => {
    renderRegisterPage();
    await completeSignup(false);
    expect(mocks.signUp.mock.calls[0]?.[0].options.data.marketing_email_consent).toBe(false);
  });

  it("passes explicit marketing consent to the server-side signup trigger", async () => {
    renderRegisterPage();
    await completeSignup(true);
    expect(mocks.signUp.mock.calls[0]?.[0].options.data.marketing_email_consent).toBe(true);
  });
});
