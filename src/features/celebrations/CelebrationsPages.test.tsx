import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecentPublishedCelebrations: vi.fn(),
  listUpcomingCelebrations: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    listRecentPublishedCelebrations: mocks.listRecentPublishedCelebrations,
    listUpcomingCelebrations: mocks.listUpcomingCelebrations,
  };
});

import { CelebrationsHomePage } from "./CelebrationsPages";
import type { CelebrationCard } from "./api";

const card: CelebrationCard = {
  id: "card-1",
  owner_id: "student-1",
  title: "Campus library opening",
  category: "birthday",
  celebrant_name: "Amina Bello",
  celebration_at: "2099-05-10T12:00:00.000Z",
  timezone: "UTC",
  message: "Join us to celebrate the opening of our new campus library.",
  venue: "Main campus",
  whiteshirt_url: null,
  template_id: "birthday-balloons",
  customization: {
    background: "#8e2433",
    accent: "#ffd166",
    text: "#fffaf2",
    align: "center",
    font: "display",
    photoX: 50,
    photoY: 72,
    photoScale: 1,
  },
  details: {},
  visibility: "public",
  photo_path: null,
  status: "published",
  published_at: "2026-11-27T09:00:00.000Z",
  created_at: "2026-11-27T09:00:00.000Z",
  updated_at: "2026-11-27T09:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listRecentPublishedCelebrations.mockResolvedValue([card]);
  mocks.listUpcomingCelebrations.mockResolvedValue([card]);
});

describe("CelebrationsHomePage", () => {
  it("uses responsive three-column card grids and keeps full card information available", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client }, createElement(CelebrationsHomePage)),
    ));

    expect(await screen.findAllByRole("heading", { name: "Campus library opening" })).toHaveLength(2);
    const cardLists = container.querySelectorAll("ul.grid");
    expect(cardLists).toHaveLength(2);
    for (const list of cardLists) {
      expect(list).toHaveClass("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3");
    }
    expect(screen.getAllByText("Join us to celebrate the opening of our new campus library.").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("For Amina Bello")).toHaveLength(2);
    expect(screen.getAllByText("View card for full message")).toHaveLength(2);
  });
});
