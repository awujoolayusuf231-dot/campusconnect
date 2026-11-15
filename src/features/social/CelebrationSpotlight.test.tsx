import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecentPublishedCelebrations: vi.fn(),
  listUpcomingCelebrations: vi.fn(),
}));
vi.mock("@/features/celebrations/api", () => ({
  listRecentPublishedCelebrations: mocks.listRecentPublishedCelebrations,
  listUpcomingCelebrations: mocks.listUpcomingCelebrations,
}));

import { CelebrationSpotlight } from "./CelebrationSpotlight";

const upcoming = {
  id: "card-1",
  title: "Graduation day",
  category: "graduation",
  celebrant_name: "Amina",
  celebration_at: "2026-12-01T10:00:00.000Z",
  timezone: "UTC",
};
const recent = { ...upcoming, id: "card-2", title: "Birthday wishes", celebrant_name: "Tunde", category: "birthday" };

function renderSpotlight() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><CelebrationSpotlight /></QueryClientProvider></MemoryRouter>);
}

describe("CelebrationSpotlight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUpcomingCelebrations.mockResolvedValue([upcoming]);
    mocks.listRecentPublishedCelebrations.mockResolvedValue([upcoming, recent]);
  });

  it("rotates through deduplicated recent and upcoming cards with links to the full discovery page", async () => {
    renderSpotlight();

    expect(await screen.findByRole("heading", { name: "Amina" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Celebration highlights" })).toHaveClass("sticky", "top-16");
    fireEvent.click(screen.getByRole("button", { name: "Next celebration" }));

    expect(await screen.findByRole("heading", { name: "Tunde" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View card" })).toHaveAttribute("href", "/app/celebrations/card-2");
    expect(screen.getByRole("link", { name: "Explore all" })).toHaveAttribute("href", "/app/celebrations");
  });

  it("automatically advances the carousel when it is not hovered or focused", async () => {
    renderSpotlight();
    expect(await screen.findByRole("heading", { name: "Amina" })).toBeVisible();
    const carousel = screen.getByRole("region", { name: "Celebration highlights" });
    fireEvent.mouseEnter(carousel);
    vi.useFakeTimers();
    try {
      act(() => vi.advanceTimersByTime(12_000));
      expect(screen.getByRole("heading", { name: "Amina" })).toBeVisible();
      fireEvent.mouseLeave(carousel);
      act(() => vi.advanceTimersByTime(6000));
      expect(screen.getByRole("heading", { name: "Tunde" })).toBeVisible();
    } finally {
      fireEvent.mouseEnter(carousel);
      vi.useRealTimers();
    }
  });
});
