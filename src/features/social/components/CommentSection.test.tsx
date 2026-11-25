import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  fetchComments: vi.fn(),
  replyToComment: vi.fn(),
  likeComment: vi.fn(),
  unlikeComment: vi.fn(),
  repostComment: vi.fn(),
  unrepostComment: vi.fn(),
  recordCommentImpressions: vi.fn(),
  searchStudents: vi.fn(),
}));
vi.mock("../api", () => ({
  COMMENT_PAGE_SIZE: 50,
  addComment: mocks.addComment,
  deleteComment: mocks.deleteComment,
  fetchComments: mocks.fetchComments,
  replyToComment: mocks.replyToComment,
  likeComment: mocks.likeComment,
  unlikeComment: mocks.unlikeComment,
  repostComment: mocks.repostComment,
  unrepostComment: mocks.unrepostComment,
  recordCommentImpressions: mocks.recordCommentImpressions,
  searchStudents: mocks.searchStudents,
  avatarUrl: () => null,
}));

import { CommentSection } from "./CommentSection";

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0.5];
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  showAll() {
    this.callback(Array.from(this.targets, (target) => ({
      target,
      isIntersecting: true,
      intersectionRatio: 0.5,
    } as IntersectionObserverEntry)), this);
  }
}

const observers: TestIntersectionObserver[] = [];

function renderComments() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommentSection postId="post-1" me="viewer-1" /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CommentSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchComments.mockResolvedValue([]);
    mocks.addComment.mockResolvedValue("comment-new");
    mocks.deleteComment.mockResolvedValue(undefined);
    mocks.replyToComment.mockResolvedValue("reply-new");
    mocks.likeComment.mockResolvedValue(undefined);
    mocks.unlikeComment.mockResolvedValue(undefined);
    mocks.repostComment.mockResolvedValue("post-repost");
    mocks.unrepostComment.mockResolvedValue(undefined);
    mocks.recordCommentImpressions.mockResolvedValue(undefined);
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", class extends TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        super(callback);
        observers.push(this);
      }
    });
  });

  it("shows a clear empty state and submits a comment with pending and success feedback", async () => {
    renderComments();
    expect(await screen.findByText("Start the conversation")).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "Write a comment" }), { target: { value: "Hello from campus." } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => expect(mocks.addComment).toHaveBeenCalledWith("post-1", "Hello from campus."));
    expect(await screen.findByRole("status")).toHaveTextContent("Comment posted.");
  });

  it("renders commenter details and wrapped text using the existing visible-comments query", async () => {
    mocks.fetchComments.mockResolvedValue([{
      id: "comment-1",
      author_id: "student-3",
      body: "A thoughtful comment\nwith a second line.",
      created_at: "2026-11-11T09:00:00.000Z",
      edited_at: null,
      parent_comment_id: null,
      like_count: 2,
      repost_count: 0,
      metrics: { views: 12, impressions: 34 },
      liked_by_me: false,
      reposted_by_me: false,
      replies: [],
      author: { username: "thoughtful", display_name: "Thoughtful Student", avatar_path: "student-3/avatar.jpg" },
    }, {
      id: "comment-private",
      author_id: "student-private",
      body: "This comment author is not visible to the viewer.",
      created_at: "2026-11-11T09:01:00.000Z",
      edited_at: null,
      parent_comment_id: null,
      like_count: 0,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      replies: [],
      author: null,
    }]);
    renderComments();

    expect(await screen.findByRole("link", { name: "View Thoughtful Student's profile" })).toHaveAttribute("href", "/app/u/thoughtful");
    const body = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "A thoughtful comment\nwith a second line.");
    expect(body).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByText("This comment author is not visible to the viewer.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your private comment analytics")).toHaveTextContent("12 views");
    expect(screen.getByLabelText("Your private comment analytics")).toHaveTextContent("34 impressions");
    expect(screen.getByRole("button", { name: "Like comment" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reply" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reshare comment" })).toBeVisible();
  });

  it("supports comment likes, one-level replies, and public reshares", async () => {
    mocks.fetchComments.mockResolvedValue([{
      id: "comment-1",
      author_id: "student-3",
      body: "Thoughtful comment",
      created_at: "2026-11-11T09:00:00.000Z",
      edited_at: null,
      parent_comment_id: null,
      like_count: 0,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      replies: [],
      author: { username: "thoughtful", display_name: "Thoughtful Student", avatar_path: null },
    }]);
    renderComments();
    await screen.findByText("Thoughtful comment");

    fireEvent.click(screen.getByRole("button", { name: "Like comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Reshare comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reply to Thoughtful Student" }), { target: { value: "A reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => {
      expect(mocks.likeComment).toHaveBeenCalledWith("comment-1");
      expect(mocks.repostComment).toHaveBeenCalledWith("comment-1");
      expect(mocks.replyToComment).toHaveBeenCalledWith("post-1", "A reply", "comment-1");
    });
  });

  it("shows comment likes and reshares immediately while their requests are pending", async () => {
    let finishLike: (() => void) | undefined;
    let finishReshare: ((postId: string) => void) | undefined;
    mocks.likeComment.mockImplementation(() => new Promise<void>((resolve) => { finishLike = resolve; }));
    mocks.repostComment.mockImplementation(() => new Promise<string>((resolve) => { finishReshare = resolve; }));
    mocks.fetchComments.mockResolvedValue([{
      id: "comment-1",
      author_id: "student-3",
      body: "Thoughtful comment",
      created_at: "2026-11-11T09:00:00.000Z",
      edited_at: null,
      parent_comment_id: null,
      like_count: 2,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      replies: [],
      author: { username: "thoughtful", display_name: "Thoughtful Student", avatar_path: null },
    }]);
    renderComments();
    await screen.findByText("Thoughtful comment");

    const like = screen.getByRole("button", { name: "Like comment" });
    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(like).toHaveClass("text-primary");
    expect(like).toHaveTextContent("3");

    const reshare = screen.getByRole("button", { name: "Reshare comment" });
    fireEvent.click(reshare);
    expect(reshare).toHaveAttribute("aria-pressed", "true");
    expect(reshare).toHaveClass("text-primary");
    expect(reshare).toHaveTextContent("Reposted · 1");

    finishLike?.();
    finishReshare?.("post-repost");
  });

  it("rolls a comment like back when the request fails", async () => {
    mocks.likeComment.mockRejectedValueOnce(new Error("network error"));
    mocks.fetchComments.mockResolvedValue([{
      id: "comment-1",
      author_id: "student-3",
      body: "Thoughtful comment",
      created_at: "2026-11-11T09:00:00.000Z",
      edited_at: null,
      parent_comment_id: null,
      like_count: 2,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      replies: [],
      author: { username: "thoughtful", display_name: "Thoughtful Student", avatar_path: null },
    }]);
    renderComments();
    await screen.findByText("Thoughtful comment");

    fireEvent.click(screen.getByRole("button", { name: "Like comment" }));
    const unlike = screen.getByRole("button", { name: "Unlike comment" });
    expect(unlike).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(screen.getByRole("button", { name: "Like comment" })).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("button", { name: "Like comment" })).toHaveTextContent("2");
  });

  it("loads additional visible comments in pages instead of silently stopping at the first page", async () => {
    mocks.fetchComments.mockImplementation(async (_postId: string, page = 0) => page === 0
      ? Array.from({ length: 50 }, (_, index) => ({
        id: `comment-${index}`,
        author_id: "student-3",
        body: `Comment ${index}`,
        created_at: "2026-11-11T09:00:00.000Z",
        edited_at: null,
        parent_comment_id: null,
        like_count: 0,
        repost_count: 0,
        liked_by_me: false,
        reposted_by_me: false,
        replies: [],
        author: { username: "student", display_name: "Student", avatar_path: null },
      }))
      : []);
    renderComments();

    fireEvent.click(await screen.findByRole("button", { name: "Load earlier comments" }));

    await waitFor(() => expect(mocks.fetchComments).toHaveBeenCalledWith("post-1", 1));
  });

  it("records comment impressions only after a comment stays at least half visible for one second", async () => {
    mocks.fetchComments.mockResolvedValue([{
      id: "comment-1",
      author_id: "student-3",
      body: "A visible comment",
      created_at: "2026-11-11T09:00:00.000Z",
      edited_at: null,
      parent_comment_id: null,
      like_count: 0,
      repost_count: 0,
      liked_by_me: false,
      reposted_by_me: false,
      replies: [],
      author: { username: "student", display_name: "Student", avatar_path: null },
    }]);
    renderComments();
    await screen.findByText("A visible comment");
    expect(observers).toHaveLength(1);

    vi.useFakeTimers();
    try {
      const observer = observers[0];
      if (!observer) throw new Error("Expected a comment impression observer");
      observer.showAll();
      await vi.advanceTimersByTimeAsync(999);
      expect(mocks.recordCommentImpressions).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(mocks.recordCommentImpressions).toHaveBeenCalledWith(["comment-1"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
