import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchActiveSubscriptionPlans: vi.fn(),
  fetchMySubscription: vi.fn(),
  formatSubscriptionPrice: vi.fn((amount: number) => `NGN ${amount}`),
  startPaystackCheckout: vi.fn(),
  verifyPaystackCheckout: vi.fn(),
}));

vi.mock("./api", () => mocks);

import { SubscriptionPage } from "./SubscriptionPage";

describe("SubscriptionPage", () => {
  beforeEach(() => {
    mocks.fetchMySubscription.mockResolvedValue({
      plan_code: "free",
      display_name: "Free",
      status: "active",
      billing_interval: null,
      current_period_start: null,
      current_period_end: null,
    });
    mocks.fetchActiveSubscriptionPlans.mockResolvedValue([
      {
        code: "plus",
        display_name: "Plus",
        amount_minor: 500000,
        currency: "NGN",
        billing_interval: "month",
        interval_count: 1,
      },
      {
        code: "pro",
        display_name: "Pro",
        amount_minor: 5000000,
        currency: "NGN",
        billing_interval: "year",
        interval_count: 1,
      },
    ]);
  });

  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SubscriptionPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("shows the current plan and only plans for the selected billing interval", async () => {
    renderPage();

    expect(await screen.findByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));

    expect(await screen.findByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText("Plus")).not.toBeInTheDocument();
  });
});
