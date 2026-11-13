import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  blockUser: vi.fn(),
  deletePost: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
  repostPost: vi.fn(),
  unrepostPost: vi.fn(),
  postShareUrl: (id: string) => `https://campusconnect.example/app/p/${id}`,
  avatarUrl: () => null,
}));
vi.mock("../usePostImpression", () => ({ usePostImpression: () => ({ current: null }) }));
vi.mock("./ProtectedPostImage", () => ({
  ProtectedPostImage: ({ path }: { path: string }) => <img alt="Attached to post" src={path} />,
}));

import { PostCard } from "./PostCard";

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

function renderCard(overrides: Partial<typeof post> = {}, options: { fullPost?: boolean; images?: string[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PostCard post={{ ...post, ...overrides }} me="student-2" fullPost={options.fullPost} images={options.images} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PostCard content preview", () => {
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

  it("renders full content and attached media without a preview link on the details page", () => {
    const body = "A complete post.\nWith paragraph formatting preserved.";
    renderCard({ body }, { fullPost: true, images: ["owner/photo.png"] });

    const bodyElement = screen.getByRole("article").querySelector("p.whitespace-pre-wrap");
    expect(bodyElement?.textContent).toBe(body);
    expect(bodyElement).not.toHaveStyle({ WebkitLineClamp: 6 });
    expect(screen.getByRole("img", { name: "Attached to post" })).toHaveAttribute("src", "owner/photo.png");
    expect(screen.queryByRole("link", { name: "Show more" })).not.toBeInTheDocument();
  });
});
