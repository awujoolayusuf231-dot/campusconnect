import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  fetchComments: vi.fn(),
}));
vi.mock("../api", () => ({
  COMMENT_PAGE_SIZE: 50,
  addComment: mocks.addComment,
  deleteComment: mocks.deleteComment,
  fetchComments: mocks.fetchComments,
  avatarUrl: () => null,
}));

import { CommentSection } from "./CommentSection";

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
      author: { username: "thoughtful", display_name: "Thoughtful Student", avatar_path: "student-3/avatar.jpg" },
    }, {
      id: "comment-private",
      author_id: "student-private",
      body: "This comment author is not visible to the viewer.",
      created_at: "2026-11-11T09:01:00.000Z",
      edited_at: null,
      author: null,
    }]);
    renderComments();

    expect(await screen.findByRole("link", { name: "View Thoughtful Student's profile" })).toHaveAttribute("href", "/app/u/thoughtful");
    const body = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "A thoughtful comment\nwith a second line.");
    expect(body).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByText("This comment author is not visible to the viewer.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reply|like comment/i })).not.toBeInTheDocument();
  });

  it("loads additional visible comments in pages instead of silently stopping at the first page", async () => {
    mocks.fetchComments.mockImplementation(async (_postId: string, page = 0) => page === 0
      ? Array.from({ length: 50 }, (_, index) => ({
        id: `comment-${index}`,
        author_id: "student-3",
        body: `Comment ${index}`,
        created_at: "2026-11-11T09:00:00.000Z",
        edited_at: null,
        author: { username: "student", display_name: "Student", avatar_path: null },
      }))
      : []);
    renderComments();

    fireEvent.click(await screen.findByRole("button", { name: "Load earlier comments" }));

    await waitFor(() => expect(mocks.fetchComments).toHaveBeenCalledWith("post-1", 1));
  });
});
