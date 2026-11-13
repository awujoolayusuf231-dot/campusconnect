import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchMediaPaths: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: vi.fn() } }));
vi.mock("./api", () => ({ fetchMediaPaths: mocks.fetchMediaPaths }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: { user: { id: "viewer-1" } } }) }));
vi.mock("./components/PostCard", () => ({
  PostCard: ({ post, images, fullPost, trackImpression }: {
    post: { body: string };
    images: string[];
    fullPost?: boolean;
    trackImpression?: boolean;
  }) => <article data-full-post={fullPost} data-track-impression={trackImpression}>{post.body}{images.map((image) => <img key={image} alt="Attached to post" src={image} />)}</article>,
}));

import { PostPage } from "./PostPage";

const row = {
  id: "post-1",
  author_id: "author-1",
  body: "Full details loaded from the authorized post query.",
  created_at: "2026-11-11T09:00:00.000Z",
  edited_at: null,
  like_count: 2,
  comment_count: 1,
  repost_count: 0,
  community_id: null,
  status: "visible",
  author: { username: "author", display_name: "Post Author", avatar_path: null },
};

function queryResult(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

function renderPostPage(path = "/app/p/post-1", client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/app/p/:id" element={<PostPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

describe("PostPage direct post URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let postReads = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === "posts") return queryResult(++postReads === 1 ? { author_id: row.author_id } : row);
      if (table === "profiles") return queryResult({ id: row.author_id });
      if (table === "post_likes") return queryResult(null);
      if (table === "reposts") return queryResult(null);
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.fetchMediaPaths.mockResolvedValue({ "post-1": ["owner/photo.png"] });
  });

  it("loads the full post, media, and tracking-enabled detail card from a direct route", async () => {
    renderPostPage();

    expect(await screen.findByText(row.body)).toBeVisible();
    expect(screen.getByRole("img", { name: "Attached to post" })).toHaveAttribute("src", "owner/photo.png");
    expect(screen.getByRole("article")).toHaveAttribute("data-full-post", "true");
    expect(screen.getByRole("article")).toHaveAttribute("data-track-impression", "true");
    expect(mocks.from).toHaveBeenCalledWith("posts");
    expect(mocks.fetchMediaPaths).toHaveBeenCalledWith(["post-1"]);
  });

  it("does not render a post when the RLS-filtered query returns no visible row", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "posts") return queryResult(null);
      throw new Error(`Unauthorized post should not query ${table}`);
    });

    renderPostPage("/app/p/private-post");

    expect(await screen.findByText(/This post is not available/)).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(mocks.fetchMediaPaths).not.toHaveBeenCalled();
  });

  it("does not render post content when RLS hides the author's profile", async () => {
    let postReads = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === "posts") return queryResult(++postReads === 1 ? { author_id: row.author_id } : row);
      if (table === "profiles") return queryResult(null);
      throw new Error(`Hidden author post should not query ${table}`);
    });

    renderPostPage();

    expect(await screen.findByText(/This post is not available/)).toBeVisible();
    expect(screen.queryByText(row.body)).not.toBeInTheDocument();
    expect(postReads).toBe(1);
    expect(mocks.fetchMediaPaths).not.toHaveBeenCalled();
  });

  it("hides cached post content while rechecking access", async () => {
    let resolvePost!: (result: { data: unknown; error: unknown }) => void;
    const pendingPost = new Promise<{ data: unknown; error: unknown }>((resolve) => { resolvePost = resolve; });
    const cachedPost = {
      post: { id: row.id, author_id: row.author_id, body: row.body },
      media: [],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["post", "post-1"], cachedPost);
    mocks.from.mockImplementation((table: string) => {
      if (table === "posts") {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => pendingPost),
        };
        return chain;
      }
      throw new Error(`Unauthorized post should not query ${table}`);
    });

    renderPostPage("/app/p/post-1", client);

    expect(await screen.findByText("Checking post access")).toBeVisible();
    expect(screen.queryByText(row.body)).not.toBeInTheDocument();
    await act(async () => resolvePost({ data: null, error: null }));
    expect(await screen.findByText(/This post is not available/)).toBeVisible();
  });
});
