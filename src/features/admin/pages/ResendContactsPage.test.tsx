import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResendContactsPage } from "./ResendContactsPage";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));
vi.mock("../useMyPermissions", () => ({
  useMyPermissions: () => ({ data: ["settings.manage"], isLoading: false, isError: false }),
}));

describe("ResendContactsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "admin_resend_contact_sync_stats") {
        return Promise.resolve({
          data: {
            total_eligible: 5,
            synced: 3,
            failed: 1,
            pending: 1,
            skipped_missing_email: 0,
            skipped_consent: 7,
            skipped_unverified: 2,
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: {
          total_eligible: 5,
          queued: 2,
          skipped_missing_email: 0,
          skipped_consent: 7,
          skipped_unverified: 2,
        },
        error: null,
      });
    });
  });

  it("shows aggregate sync totals and queues an existing-user backfill", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(QueryClientProvider, { client }, createElement(ResendContactsPage)));

    expect(await screen.findByText("Eligible verified opted-in users")).toBeInTheDocument();
    expect(screen.getByText("Successfully synchronised")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run initial backfill" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("admin_queue_resend_contact_backfill"));
    expect(await screen.findByText(/Queued 2 of 5 eligible users/)).toBeInTheDocument();
  }, 20_000);
});
