import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTrendingHashtags: vi.fn(),
  searchHashtags: vi.fn(),
}));
vi.mock("./api", () => ({
  fetchTrendingHashtags: mocks.fetchTrendingHashtags,
  searchHashtags: mocks.searchHashtags,
}));

import { HashtagDiscovery } from "./HashtagDiscovery";

function renderDiscovery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><HashtagDiscovery /></QueryClientProvider></MemoryRouter>);
}

describe("HashtagDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchTrendingHashtags.mockResolvedValue([{ tag: "campuslife", posts: 5, authors: 3 }]);
    mocks.searchHashtags.mockResolvedValue([{ tag: "physics", post_count: 2 }]);
  });

  it("shows trending topics linked to their post pages", async () => {
    renderDiscovery();

    expect(await screen.findByRole("link", { name: /campuslife/ })).toHaveAttribute("href", "/app/tags/campuslife");
    expect(mocks.fetchTrendingHashtags).toHaveBeenCalledWith();
  });

  it("searches for a topic and links the suggestions", async () => {
    renderDiscovery();
    fireEvent.change(screen.getByRole("textbox", { name: "Search hashtags" }), { target: { value: "#physics" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("link", { name: /physics/ })).toHaveAttribute("href", "/app/tags/physics");
    await waitFor(() => expect(mocks.searchHashtags).toHaveBeenCalledWith("physics"));
  });
});
