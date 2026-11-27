import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  blockUser: vi.fn(),
  muteUser: vi.fn(),
  deletePost: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
  repostPost: vi.fn(),
  unrepostPost: vi.fn(),
  savePost: vi.fn(),
  unsavePost: vi.fn(),
  submitReport: vi.fn(),
  postShareUrl: (id: string) => `https://campusconnect.example/app/p/${id}`,
  REPORT_CATEGORIES: [["spam", "Spam"]],
  avatarUrl: () => null,
  searchStudents: vi.fn().mockResolvedValue([]),
  recordCommentImpressions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../usePostImpression", () => ({ usePostImpression: () => ({ current: null }) }));
vi.mock("./ProtectedPostImage", () => ({
  ProtectedPostImage: ({ path }: { path: string }) => <img alt="Attached to post" src={path} />,
}));

import { PostCard } from "./PostCard";
import { likePost } from "../api";

function CurrentPath() {
  const { pathname } = useLocation();
  return <output data-testid="current-path">{pathname}</output>;
}

const post = {
  id: "post-1",
  author_id: "student-1",
  body: "A short post with\nits original line break.",
  created_at: "2026-11-11T09:00:00.000Z",
  edited_at: null,
  like_count: 2,
  comment_count: 0,
  repost_count: 0,
  liked_by_me: false,
  reposted_by_me: false,
  username: "student",
  display_name: "Campus Student",
  avatar_path: null,
  activity_at: "2026-11-11T09:00:00.000Z",
  reposter_username: null,
  reposter_name: null,
};

function renderCard(overrides: Partial<typeof post> = {}, options: { fullPost?: boolean; images?: string[]; metrics?: { post_id: string; impressions: number; views: number; saved_by_me: boolean } } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/feed"]}>
        <CurrentPath />
        <PostCard post={{ ...post, ...overrides }} me="student-2" fullPost={options.fullPost} images={options.images} metrics={options.metrics} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PostCard content preview", () => {
  it("shows a verification badge only for the designated account", () => {
    renderCard({ username: "dewalexict" });
    expect(screen.getByRole("img", { name: "CampusConnect verified account" })).toBeVisible();
  });

  it("shows short post text and preserves its line breaks without a details link", () => {
    renderCard();

    expect(screen.getByText(/A short post with/)).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByRole("link", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("links long post previews to the full details route", () => {
    const body = `${"Campus life brings people together. ".repeat(20)}\nA final paragraph.`;
    renderCard({ body });

    const bodyElement = screen.getByRole("article").querySelector("p.whitespace-pre-wrap");
    expect(bodyElement?.textContent).toBe(body);
    expect(bodyElement).toHaveStyle({ WebkitLineClamp: 6 });
    expect(screen.getByRole("link", { name: "Show more" })).toHaveAttribute("href", "/app/p/post-1");
    expect(screen.getByRole("button", { name: /likes/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /comments/i })).toBeVisible();
  });

  it("opens the post when clicking non-interactive card content", () => {
    renderCard();

    fireEvent.click(screen.getByText(/A short post with/));

    expect(screen.getByTestId("current-path")).toHaveTextContent("/app/p/post-1");
  });

  it("keeps links inside the card navigable without triggering the post route", () => {
    renderCard();

    fireEvent.click(screen.getByRole("link", { name: "Campus Student" }));

    expect(screen.getByTestId("current-path")).toHaveTextContent("/app/u/student");
  });

  it("does not navigate when using post actions", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /likes/i }));

    expect(screen.getByTestId("current-path")).toHaveTextContent("/app/feed");
  });

  it("shows like and reshare state immediately after a click", () => {
    renderCard();

    const like = screen.getByRole("button", { name: /likes/i });
    const repost = screen.getByRole("button", { name: /reposts/i });
    fireEvent.click(like);
    fireEvent.click(repost);

    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(repost).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls back the optimistic like when the request fails", async () => {
    vi.mocked(likePost).mockRejectedValueOnce(new Error("network error"));
    renderCard();

    const like = screen.getByRole("button", { name: /likes/i });
    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(like).toHaveAttribute("aria-pressed", "false"));
  });

  it("opens the mute confirmation as a centered modal above the post card", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    const dialog = screen.getByRole("alertdialog", { name: "Mute @student?" });
    expect(dialog).toHaveTextContent("Their posts will no longer appear in your feeds.");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("items-center");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("opens the block confirmation as a centered modal above the post card", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    const dialog = screen.getByRole("alertdialog", { name: "Block @student?" });
    expect(dialog).toHaveTextContent("You will no longer see their posts");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("items-center");
  });

  it("uses accessible icon-only controls for post moderation actions", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block" })).toBeInTheDocument();
    expect(screen.queryByText("Report")).not.toBeInTheDocument();
    expect(screen.queryByText("Mute")).not.toBeInTheDocument();
    expect(screen.queryByText("Block")).not.toBeInTheDocument();
  });

  it("opens the report form as a centered modal outside the post card", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));

    const dialog = screen.getByRole("dialog", { name: "Report post" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("items-center");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(dialog);
    expect(screen.getByTestId("current-path")).toHaveTextContent("/app/feed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Report post" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("shows post deletion as an accessible trash icon", () => {
    renderCard({ author_id: "student-2" });

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders full content and attached media without a preview link on the details page", () => {
    const body = "A complete post.\nWith paragraph formatting preserved.";
    renderCard({ body }, { fullPost: true, images: ["owner/photo.png"] });

    const bodyElement = screen.getByRole("article").querySelector("p.whitespace-pre-wrap");
    expect(bodyElement?.textContent).toBe(body);
    expect(bodyElement).not.toHaveStyle({ WebkitLineClamp: 6 });
    expect(screen.getByRole("img", { name: "Attached to post" })).toHaveAttribute("src", "owner/photo.png");
    expect(screen.queryByRole("link", { name: "Show more" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/A complete post/));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/app/feed");
  });

  it("shows public view and impression totals and the current saved state", () => {
    renderCard({}, { metrics: { post_id: "post-1", views: 12000, impressions: 54000, saved_by_me: true } });

    expect(screen.getByLabelText("Public post metrics")).toHaveTextContent("12K views");
    expect(screen.getByLabelText("Public post metrics")).toHaveTextContent("54K impressions");
    expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  });
});
