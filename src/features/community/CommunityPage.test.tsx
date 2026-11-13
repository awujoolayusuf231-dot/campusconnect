import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCommunityBySlug: vi.fn(),
  myCommunityRole: vi.fn(),
  joinCommunity: vi.fn(),
  leaveCommunity: vi.fn(),
  archiveCommunity: vi.fn(),
  updateCommunity: vi.fn(),
  listMembers: vi.fn(),
  setMember: vi.fn(),
  setPostState: vi.fn(),
  fetchMediaPaths: vi.fn(),
  communityCoverUrl: vi.fn(),
  uploadCommunityCover: vi.fn(),
  removeCommunityCover: vi.fn(),
  listActiveInstitutions: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("./api", () => ({
  COMMUNITY_CATEGORIES: [["interest", "Interest"], ["course", "Course"]],
  archiveCommunity: mocks.archiveCommunity,
  getCommunityBySlug: mocks.getCommunityBySlug,
  joinCommunity: mocks.joinCommunity,
  leaveCommunity: mocks.leaveCommunity,
  listMembers: mocks.listMembers,
  myCommunityRole: mocks.myCommunityRole,
  setMember: mocks.setMember,
  setPostState: mocks.setPostState,
  updateCommunity: mocks.updateCommunity,
}));
vi.mock("@/features/social/api", () => ({ fetchMediaPaths: mocks.fetchMediaPaths, FEED_PAGE: 20 }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: { user: { id: "student-1" } } }) }));
vi.mock("@/features/social/components/Composer", () => ({ Composer: () => <div>Community composer</div> }));
vi.mock("@/features/social/components/PostCard", () => ({ PostCard: () => <article>Community post</article> }));
vi.mock("@/features/social/components/Avatar", () => ({ Avatar: () => <span>Avatar</span> }));
vi.mock("@/features/social/components/ReportDialog", () => ({ ReportDialog: () => <div>Report dialog</div> }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./communityCover", () => ({
  communityCoverUrl: mocks.communityCoverUrl,
  uploadCommunityCover: mocks.uploadCommunityCover,
  removeCommunityCover: mocks.removeCommunityCover,
}));
vi.mock("@/features/institutions/api", () => ({ listActiveInstitutions: mocks.listActiveInstitutions }));

import { CommunityPage } from "./CommunityPage";

const community = {
  id: "community-1",
  name: "Campus Creators",
  slug: "campus-creators",
  description: "Share ideas with fellow creators.",
  category: "interest",
  institution_id: null,
  cover_path: null,
  status: "active",
  created_by: "owner-1",
  member_count: 7,
  created_at: "2026-01-01T00:00:00Z",
};

function renderCommunityPage(path = "/app/c/campus-creators", client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/c/:slug" element={<CommunityPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

describe("CommunityPage permissions and membership actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn().mockReturnValue("blob:cover-preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    mocks.getCommunityBySlug.mockResolvedValue(community);
    mocks.myCommunityRole.mockResolvedValue(null);
    mocks.joinCommunity.mockResolvedValue(undefined);
    mocks.leaveCommunity.mockResolvedValue(undefined);
    mocks.archiveCommunity.mockResolvedValue(undefined);
    mocks.updateCommunity.mockResolvedValue(undefined);
    mocks.listMembers.mockResolvedValue([]);
    mocks.fetchMediaPaths.mockResolvedValue({});
    mocks.communityCoverUrl.mockResolvedValue(null);
    mocks.uploadCommunityCover.mockResolvedValue("community-1/community-cover-new.jpg");
    mocks.removeCommunityCover.mockResolvedValue(true);
    mocks.listActiveInstitutions.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([]);
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "my_permissions" ? [] : [], error: null }));
  });

  it("keeps the community view stable during a background membership check", async () => {
    vi.useFakeTimers();
    try {
      let resolveRefresh!: (role: string | null) => void;
      mocks.myCommunityRole
        .mockResolvedValueOnce("member")
        .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
      renderCommunityPage();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mocks.myCommunityRole).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(mocks.myCommunityRole).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Community composer")).toBeVisible();
      expect(screen.getByRole("button", { name: "Leave community" })).toBeVisible();

      await act(async () => {
        resolveRefresh("member");
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows an ordinary visitor to join an active community", async () => {
    renderCommunityPage();

    fireEvent.click(await screen.findByRole("button", { name: "Join community" }));

    await waitFor(() => expect(mocks.joinCommunity).toHaveBeenCalledWith(community.id));
    expect(await screen.findByText("Join this community to see its posts and take part in the conversation.")).toBeVisible();
  });

  it("does not request community posts or member lists for a non-member", async () => {
    renderCommunityPage();

    expect(await screen.findByText("Join this community to see its posts and take part in the conversation.")).toBeVisible();
    expect(mocks.rpc).not.toHaveBeenCalledWith("community_posts", expect.anything());

    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(await screen.findByText("Join this community to view its member list.")).toBeVisible();
    expect(mocks.listMembers).not.toHaveBeenCalled();
  });

  it("does not show community settings controls to an ordinary member", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    renderCommunityPage();

    expect(await screen.findByRole("button", { name: "Leave community" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /manage community/i })).not.toBeInTheDocument();
  });

  it.each([
    ["former member", "left", "Join community"],
    ["demoted former moderator", "member", "Leave community"],
    ["removed member", "removed", "Join community"],
    ["banned member", "banned", "Join community"],
    ["non-member", null, "Join community"],
  ])("does not show settings controls to a %s", async (_label, role, action) => {
    mocks.myCommunityRole.mockResolvedValue(role);
    renderCommunityPage();

    expect(await screen.findByRole("button", { name: action })).toBeVisible();
    expect(screen.queryByRole("button", { name: /manage community/i })).not.toBeInTheDocument();
  });

  it("requests posts for an active member of an active community", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    renderCommunityPage();

    expect(await screen.findByText("No posts yet. Start the conversation with your community.")).toBeVisible();
    expect(mocks.rpc).toHaveBeenCalledWith("community_posts", expect.objectContaining({ p_comm: community.id }));
  });

  it("shows a community overview using its existing details", async () => {
    renderCommunityPage();

    fireEvent.click(await screen.findByRole("tab", { name: "About" }));

    const about = await screen.findByRole("tabpanel", { name: "About" });
    expect(within(about).getByRole("heading", { name: "Community details" })).toBeVisible();
    expect(within(about).getByText("Share ideas with fellow creators.")).toBeVisible();
    expect(within(about).getByText("Interest")).toBeVisible();
    expect(within(about).getByText("7")).toBeVisible();
    expect(within(about).getByText("active")).toBeVisible();
    expect(within(about).getByText("January 2026")).toBeVisible();
  });

  it("shows an empty state when an active community has no visible members", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    renderCommunityPage();

    fireEvent.click(await screen.findByRole("tab", { name: "Members" }));

    expect(await screen.findByText("There are no active members to show yet.")).toBeVisible();
  });

  it("shows a retry action when the community member list fails", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    mocks.listMembers.mockRejectedValue(new Error("network unavailable"));
    renderCommunityPage();

    fireEvent.click(await screen.findByRole("tab", { name: "Members" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load community members.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("does not request posts for a member when the community is archived", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    mocks.getCommunityBySlug.mockResolvedValue({ ...community, status: "archived" });
    renderCommunityPage();

    expect(await screen.findByText("Community posts are unavailable while this community is archived.")).toBeVisible();
    expect(mocks.rpc).not.toHaveBeenCalledWith("community_posts", expect.anything());
  });

  it("allows a member to leave only after confirmation", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    renderCommunityPage();

    fireEvent.click(await screen.findByRole("button", { name: "Leave community" }));
    expect(screen.getByRole("alertdialog", { name: "Leave this community?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(mocks.leaveCommunity).toHaveBeenCalledWith(community.id));
  });

  it("clears cached community posts and related content after leaving", async () => {
    mocks.myCommunityRole.mockResolvedValueOnce("member").mockResolvedValue(null);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const postsKey = ["community-posts", community.id, "student-1"];
    client.setQueryData(postsKey, { pages: [[{ id: "post-1" }]], pageParams: [null] });
    client.setQueryData(["media", "post-1"], { "post-1": ["post-1/image.jpg"] });
    client.setQueryData(["post", "post-1"], { post: { id: "post-1" }, media: [] });
    client.setQueryData(["comments", "post-1"], [{ id: "comment-1" }]);
    renderCommunityPage("/app/c/campus-creators", client);

    fireEvent.click(await screen.findByRole("button", { name: "Leave community" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(mocks.leaveCommunity).toHaveBeenCalledWith(community.id));
    await waitFor(() => expect(client.getQueryData(postsKey)).toBeUndefined());
    expect(client.getQueryData(["media", "post-1"])).toBeUndefined();
    expect(client.getQueryData(["post", "post-1"])).toBeUndefined();
    expect(client.getQueryData(["comments", "post-1"])).toBeUndefined();
  });

  it("lets a community owner update the community settings", async () => {
    mocks.myCommunityRole.mockResolvedValue("owner");
    renderCommunityPage();

    await waitFor(() => expect(mocks.myCommunityRole).toHaveBeenCalledWith(community.id));
    await expect(mocks.myCommunityRole.mock.results[0]?.value).resolves.toBe("owner");
    fireEvent.click(await screen.findByRole("button", { name: /manage community/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Community description" }), { target: { value: "A new description." } });
    fireEvent.change(screen.getByLabelText("Community name"), { target: { value: "Campus Makers" } });
    fireEvent.click(screen.getByRole("button", { name: "Save community" }));

    await waitFor(() => expect(mocks.updateCommunity).toHaveBeenCalledWith(community.id, {
      name: "Campus Makers",
      description: "A new description.",
      category: "interest",
      institutionId: null,
      coverPath: null,
    }));
  });

  it("does not let a community moderator edit settings but preserves moderation tools", async () => {
    mocks.myCommunityRole.mockResolvedValue("moderator");
    renderCommunityPage();

    await waitFor(() => expect(mocks.myCommunityRole).toHaveBeenCalledWith(community.id));
    await expect(mocks.myCommunityRole.mock.results[0]?.value).resolves.toBe("moderator");
    expect(screen.queryByRole("button", { name: /manage community/i })).not.toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Moderation" })).toBeVisible();
  });

  it("does not let a platform community manager edit community settings", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "my_permissions" ? ["communities.manage"] : [],
      error: null,
    }));
    renderCommunityPage();

    await screen.findByRole("heading", { name: community.name });
    expect(screen.queryByRole("button", { name: /manage community/i })).not.toBeInTheDocument();
  });

  it("uploads a selected cover before saving its path to the community", async () => {
    mocks.myCommunityRole.mockResolvedValue("owner");
    renderCommunityPage();
    fireEvent.click(await screen.findByRole("button", { name: /manage community/i }));
    const image = new File(["cover"], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose community cover image"), { target: { files: [image] } });
    fireEvent.click(screen.getByRole("button", { name: "Save community" }));

    await waitFor(() => expect(mocks.uploadCommunityCover).toHaveBeenCalledWith(community.id, image));
    await waitFor(() => expect(mocks.updateCommunity).toHaveBeenCalledWith(community.id, expect.objectContaining({
      coverPath: "community-1/community-cover-new.jpg",
    })));
  });

  it("confirms cover removal before saving a null cover path and deleting the old file", async () => {
    mocks.myCommunityRole.mockResolvedValue("owner");
    mocks.getCommunityBySlug.mockResolvedValue({ ...community, cover_path: "community-1/community-cover-old.jpg" });
    renderCommunityPage();
    fireEvent.click(await screen.findByRole("button", { name: /manage community/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove cover" }));
    fireEvent.click(screen.getByRole("alertdialog", { name: "Remove community cover?" }).querySelector("button.btn-danger")!);
    fireEvent.click(screen.getByRole("button", { name: "Save community" }));

    await waitFor(() => expect(mocks.updateCommunity).toHaveBeenCalledWith(community.id, expect.objectContaining({ coverPath: null })));
    await waitFor(() => expect(mocks.removeCommunityCover).toHaveBeenCalledWith(community.id, "community-1/community-cover-old.jpg"));
  });

  it("does not show community editing controls to an ordinary member", async () => {
    mocks.myCommunityRole.mockResolvedValue("member");
    renderCommunityPage();

    await screen.findByRole("heading", { name: community.name });
    expect(screen.queryByRole("button", { name: /manage community/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Moderation" })).not.toBeInTheDocument();
  });

  it("does not expose an edit route through a manually entered URL", () => {
    renderCommunityPage("/app/c/campus-creators/edit");
    expect(screen.getByText("Page not found.")).toBeVisible();
    expect(mocks.getCommunityBySlug).not.toHaveBeenCalled();
  });
});
