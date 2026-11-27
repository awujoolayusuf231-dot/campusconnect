import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchFeedTimeline: vi.fn(),
  fetchMediaPaths: vi.fn(),
  session: { user: { id: "student-1" } },
}));

vi.mock("./api", () => ({
  FEED_PAGE: 20,
  fetchMediaPaths: mocks.fetchMediaPaths,
}));
vi.mock("@/features/celebrations/api", () => ({
  fetchFeedTimeline: mocks.fetchFeedTimeline,
}));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock("./components/Composer", () => ({ Composer: () => null }));
vi.mock("./CelebrationSpotlight", () => ({ CelebrationSpotlight: () => <div data-testid="celebration-spotlight" /> }));
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
    mocks.fetchFeedTimeline.mockResolvedValue([]);
    mocks.fetchMediaPaths.mockResolvedValue({});
  });

  it("offers a ranked For you feed and keeps the existing timeline scopes connected", async () => {
    renderFeed();

    const stickyPanel = screen.getByRole("region", { name: "Feed highlights and filters" });
    expect(within(stickyPanel).queryByRole("link", { name: /find students/i })).not.toBeInTheDocument();
    expect(within(stickyPanel).queryByRole("heading", { name: "Campus feed" })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchFeedTimeline).toHaveBeenCalledWith("for_you", null));
    fireEvent.click(screen.getByRole("tab", { name: "Everyone" }));
    await waitFor(() => expect(mocks.fetchFeedTimeline).toHaveBeenCalledWith("all", null));
    fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    await waitFor(() => expect(mocks.fetchFeedTimeline).toHaveBeenCalledWith("following", null));
    fireEvent.click(screen.getByRole("tab", { name: "My institution" }));
    await waitFor(() => expect(mocks.fetchFeedTimeline).toHaveBeenCalledWith("institution", null));

    expect(screen.getByRole("tab", { name: "For you" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "My institution" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps celebrations and scope tabs together in a compact sticky panel", () => {
    renderFeed();

    const stickyPanel = screen.getByRole("region", { name: "Feed highlights and filters" });
    expect(stickyPanel).toHaveClass("sticky", "top-16");
    expect(stickyPanel).toContainElement(screen.getByTestId("celebration-spotlight"));
    expect(within(stickyPanel).getByRole("tablist", { name: "Feed" })).toBeInTheDocument();
    expect(within(stickyPanel).queryByText("Your campus, in the loop")).not.toBeInTheDocument();
  });

  it("keeps the existing empty guidance for the institution-only feed", async () => {
    renderFeed();

    fireEvent.click(screen.getByRole("tab", { name: "My institution" }));

    expect(await screen.findByText(/no posts from your institution yet/i)).toBeInTheDocument();
  });

  it("keeps eligible feed posts connected to impression tracking", async () => {
    mocks.fetchFeedTimeline.mockResolvedValue([{
      item_type: "post",
      item_id: "post-1",
      activity_at: "2026-11-11T09:00:00.000Z",
      item: {
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
      },
    }]);

    renderFeed();

    expect(await screen.findByRole("article")).toHaveAttribute("data-track-impression", "true");
  });

  it("keeps celebration records out of the post sequence without breaking timeline pagination", async () => {
    const activityAt = "2026-11-11T09:00:00.000Z";
    const post = {
      id: "post-1",
      author_id: "student-2",
      body: "A regular post",
      created_at: activityAt,
      edited_at: null,
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      username: "student",
      display_name: "Student",
      avatar_path: null,
      activity_at: activityAt,
      reposter_username: null,
      reposter_name: null,
    };
    const timeline = Array.from({ length: 19 }, (_, index) => ({
      item_type: "post",
      item_id: `post-${index + 1}`,
      activity_at: activityAt,
      item: { ...post, id: `post-${index + 1}` },
    }));
    timeline.push({
      item_type: "celebration",
      item_id: "celebration-1",
      activity_at: activityAt,
      item: { id: "celebration-1" },
    } as typeof timeline[number]);
    mocks.fetchFeedTimeline.mockImplementation((scope: string, cursor: unknown) =>
      Promise.resolve(scope === "all" && cursor === null ? timeline : []));

    const { container } = renderFeed();
    fireEvent.click(screen.getByRole("tab", { name: "Everyone" }));

    expect(await screen.findByText("Load more posts")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-post-id]")).toHaveLength(19);
    expect(container.querySelector("[data-celebration-poster]")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more posts" }));
    await waitFor(() => expect(mocks.fetchFeedTimeline).toHaveBeenCalledWith("all", {
      activity_at: activityAt,
      item_type: "celebration",
      item_id: "celebration-1",
    }));
  });
});
