import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecentPublishedCelebrations: vi.fn(),
  listUpcomingCelebrations: vi.fn(),
  listProfiles: vi.fn(),
}));
vi.mock("@/features/celebrations/api", () => ({
  listRecentPublishedCelebrations: mocks.listRecentPublishedCelebrations,
  listUpcomingCelebrations: mocks.listUpcomingCelebrations,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: mocks.listProfiles,
      })),
    })),
  },
}));

import { CelebrationSpotlight } from "./CelebrationSpotlight";

const cards = Array.from({ length: 7 }, (_, index) => ({
  id: `card-${index + 1}`,
  owner_id: `student-${index + 1}`,
  title: `Celebration ${index + 1}`,
  category: "birthday",
  celebrant_name: `Student ${index + 1}`,
  celebration_at: "2026-12-01T10:00:00.000Z",
  timezone: "UTC",
}));

function renderSpotlight() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><CelebrationSpotlight /></QueryClientProvider></MemoryRouter>);
}

describe("CelebrationSpotlight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUpcomingCelebrations.mockResolvedValue(cards.slice(0, 1));
    mocks.listRecentPublishedCelebrations.mockResolvedValue(cards);
    mocks.listProfiles.mockResolvedValue({ data: [], error: null });
  });

  it("shows individual avatar statuses with no more than five celebrants per carousel page", async () => {
    renderSpotlight();

    const carousel = await screen.findByRole("region", { name: "Celebration highlights" });
    await within(carousel).findByRole("link", { name: /Student 1's Celebration 1/ });
    expect(carousel).toHaveClass("sticky", "top-16");
    const celebrationLinks = within(carousel).getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/app/celebrations/card-"));
    expect(celebrationLinks).toHaveLength(5);
    expect(celebrationLinks[0]).toHaveAttribute("href", "/app/celebrations/card-1");
    expect(within(carousel).getByRole("link", { name: "View more" })).toHaveAttribute("href", "/app/celebrations");
    expect(carousel).not.toHaveClass("border");

    fireEvent.click(within(carousel).getByRole("button", { name: "More celebrations" }));
    expect(within(carousel).getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/app/celebrations/card-"))).toHaveLength(2);
    expect(within(carousel).getByRole("link", { name: /Student 6's Celebration 6/ })).toHaveAttribute("href", "/app/celebrations/card-6");
    expect(within(carousel).getByText("6–7 of 7")).toBeVisible();
  });
});
