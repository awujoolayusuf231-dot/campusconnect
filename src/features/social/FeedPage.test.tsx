import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  fetchMediaPaths: vi.fn(),
  session: { user: { id: "student-1" } },
}));

vi.mock("./api", () => ({
  FEED_PAGE: 20,
  fetchFeed: mocks.fetchFeed,
  fetchMediaPaths: mocks.fetchMediaPaths,
}));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock("./components/Composer", () => ({ Composer: () => null }));
vi.mock("@/features/onboarding/OnboardingCard", () => ({ OnboardingCard: () => null }));
vi.mock("./components/PostCard", () => ({
  PostCard: ({ post, trackImpression }: { post: { id: string }; trackImpression?: boolean }) =>
    <article data-post-id={post.id} data-track-impression={trackImpression} />,
}));

import { FeedPage } from "./FeedPage";

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <FeedPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("FeedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchFeed.mockResolvedValue([]);
    mocks.fetchMediaPaths.mockResolvedValue({});
  });

  it("keeps all three feed scopes connected to their existing query scope", async () => {
    renderFeed();

    expect(screen.getByRole("link", { name: /find students/i })).toHaveAttribute("href", "/app/discover");
    await waitFor(() => expect(mocks.fetchFeed).toHaveBeenCalledWith("all", null));
    fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    await waitFor(() => expect(mocks.fetchFeed).toHaveBeenCalledWith("following", null));
    fireEvent.click(screen.getByRole("tab", { name: "My institution" }));
    await waitFor(() => expect(mocks.fetchFeed).toHaveBeenCalledWith("institution", null));

    expect(screen.getByRole("tab", { name: "Everyone" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "My institution" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the existing empty guidance for the institution-only feed", async () => {
    renderFeed();

    fireEvent.click(screen.getByRole("tab", { name: "My institution" }));

    expect(await screen.findByText(/no posts from your institution yet/i)).toBeInTheDocument();
  });

  it("keeps eligible feed posts connected to impression tracking", async () => {
    mocks.fetchFeed.mockResolvedValue([{
      id: "post-1",
      author_id: "student-2",
      body: "A visible feed post",
      created_at: "2026-11-11T09:00:00.000Z",
      edited_at: null,
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      username: "student",
      display_name: "Student",
      avatar_path: null,
      activity_at: "2026-11-11T09:00:00.000Z",
      reposter_username: null,
      reposter_name: null,
    }]);

    renderFeed();

    expect(await screen.findByRole("article")).toHaveAttribute("data-track-impression", "true");
  });
});
