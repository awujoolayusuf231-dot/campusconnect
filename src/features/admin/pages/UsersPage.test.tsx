import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  listActiveInstitutions: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock("@/features/institutions/api", () => ({
  listActiveInstitutions: mocks.listActiveInstitutions,
}));
vi.mock("../useMyPermissions", () => ({
  useMyPermissions: () => ({ data: ["users.view", "users.moderate"], isLoading: false, isError: false }),
}));

import { UsersPage } from "./UsersPage";

const student = {
  user_id: "00000000-0000-4000-8000-000000000001",
  username: "student_one",
  display_name: "Student One",
  institution_id: null,
  status: "active",
  role: "student",
  email: null,
  joined_at: "2026-11-20T10:00:00.000Z",
  total_count: 1,
};

function renderUsersPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><UsersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("admin user deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listActiveInstitutions.mockResolvedValue([]);
    mocks.rpc.mockImplementation(async (name: string) => (
      name === "admin_search_users"
        ? { data: [student], error: null }
        : { data: null, error: null }
    ));
    mocks.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
  });

  it("requests audited backend authorization before permanently deleting a student", async () => {
    renderUsersPage();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const reason = "Confirmed fraudulent account after review";
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), { target: { value: reason } });
    fireEvent.click(screen.getByRole("button", { name: "Delete account permanently" }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith("admin_request_user_deletion", {
        p_target: student.user_id,
        p_reason: reason,
      });
      expect(mocks.invoke).toHaveBeenCalledWith("admin-delete-account", { body: { user_id: student.user_id } });
    });
  });

  it("does not call the service-role deletion function when the database denies authorization", async () => {
    mocks.rpc.mockImplementation(async (name: string) => (
      name === "admin_search_users"
        ? { data: [student], error: null }
        : { data: null, error: new Error("forbidden") }
    ));
    renderUsersPage();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), { target: { value: "Unauthorized deletion attempt" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("explains an account deletion failure returned by the Edge Function", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(
        JSON.stringify({ error: "account_deletion_failed_request_restored" }),
        { status: 500 },
      )),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderUsersPage();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), {
      target: { value: "Confirmed fraudulent account after review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/deletion request was restored/i);
  });

  it("identifies when the authorization RPC is missing from the database schema cache", async () => {
    mocks.rpc.mockImplementation(async (name: string) => (
      name === "admin_search_users"
        ? { data: [student], error: null }
        : {
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function public.admin_request_user_deletion",
            details: null,
            hint: null,
          },
        }
    ));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderUsersPage();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.change(screen.getByLabelText("Reason (recorded in the audit log)"), {
      target: { value: "Confirmed fraudulent account after review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/migration 20261126000047/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
