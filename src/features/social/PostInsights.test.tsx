import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPostAnalytics: vi.fn() }));
vi.mock("./api", () => ({ fetchPostAnalytics: mocks.fetchPostAnalytics }));

import { PostInsights } from "./PostInsights";

describe("PostInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPostAnalytics.mockResolvedValue({
      reach: 4,
      totals: { impressions: 9, days_counted: 1 },
      days: [{ day: "2026-11-11", impressions: 9, unique_viewers: 4 }],
    });
  });

  it("shows only threshold-qualified aggregate insights and does not expose viewer identities", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><PostInsights postId="post-1" /></QueryClientProvider>);

    expect(await screen.findAllByText("4")).toHaveLength(2);
    expect(screen.getAllByText("9")).toHaveLength(2);
    expect(screen.getByText(/Distinct viewers · last 28 days/)).toBeInTheDocument();
    expect(screen.queryByText(/viewer name|@student/i)).not.toBeInTheDocument();
  });

  it("does not display a reach figure below the server privacy threshold", async () => {
    mocks.fetchPostAnalytics.mockResolvedValue({ reach: null, totals: null, days: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><PostInsights postId="post-2" /></QueryClientProvider>);

    expect(await screen.findAllByText("Not enough data yet")).toHaveLength(2);
    expect(screen.getByText(/at least three distinct viewers/i)).toBeInTheDocument();
  });
});
