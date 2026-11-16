import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../useMyPermissions", () => ({
  useMyPermissions: () => ({ data: ["analytics.view"], isLoading: false, isError: false }),
}));

import { DashboardPage } from "./DashboardPage";

describe("DashboardPage subscription metrics", () => {
  beforeEach(() => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "admin_overview_stats") return Promise.resolve({ data: { total_users: 0 }, error: null });
      if (name === "admin_registrations_by_day" || name === "admin_subscription_overview") {
        return Promise.resolve({
          data: name === "admin_subscription_overview" ? [{
            currency: "NGN",
            current_subscribers: 4,
            successful_payments: 3,
            failed_payments: 1,
            gross_revenue_minor: 1500000,
          }] : [],
          error: null,
        });
      }
      if (name === "admin_discovery_overview") return Promise.resolve({
        data: [{
          location_opt_ins: 12,
          followed_post_notifications: 32,
          celebration_notifications: 7,
        }],
        error: null,
      });
      if (name === "admin_content_stats") return Promise.resolve({ data: {}, error: null });
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  it("shows payment totals grouped by currency", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><DashboardPage /></QueryClientProvider>);

    expect(await screen.findByText("Subscriptions and Paystack payments")).toBeInTheDocument();
    expect(await screen.findByText(/15,000/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3 / 1")).toBeInTheDocument();
    expect(await screen.findByText("Discovery and celebration activity")).toBeInTheDocument();
    expect(screen.getByText("Followed-post alerts · 30 days")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });
});
