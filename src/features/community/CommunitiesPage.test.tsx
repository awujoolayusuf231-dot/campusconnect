import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunitiesPage } from "./CommunitiesPage";

const mocks = vi.hoisted(() => ({
  createCommunity: vi.fn(),
  listCommunities: vi.fn(),
  listMyCommunities: vi.fn(),
  communityCoverUrl: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    createCommunity: mocks.createCommunity,
    listCommunities: mocks.listCommunities,
    listMyCommunities: mocks.listMyCommunities,
  };
});
vi.mock("./communityCover", () => ({ communityCoverUrl: mocks.communityCoverUrl }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: { user: { id: "student-1" } } }) }));

function renderCommunitiesPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommunitiesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CommunitiesPage create dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCommunities.mockResolvedValue([]);
    mocks.listMyCommunities.mockResolvedValue([]);
    mocks.createCommunity.mockResolvedValue({ slug: "campus-art" });
    mocks.communityCoverUrl.mockResolvedValue(null);
  });

  it("renders the create dialog in a body portal above the app header", () => {
    renderCommunitiesPage();

    fireEvent.click(screen.getByRole("button", { name: "Create community" }));

    const dialog = screen.getByRole("dialog", { name: "Create community" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("z-[60]");
    expect(screen.getByRole("heading", { name: "Create a community" })).toBeInTheDocument();
  });

  it("closes the dialog with Escape", () => {
    renderCommunitiesPage();
    fireEvent.click(screen.getByRole("button", { name: "Create community" }));

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Create community" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Create community" })).not.toBeInTheDocument();
  });

  it("shows community discovery details and links to the selected community", async () => {
    mocks.listCommunities.mockResolvedValue([{
      id: "community-1",
      name: "Campus Creators",
      slug: "campus-creators",
      description: "Share projects and meet creative students.",
      category: "interest",
      cover_path: null,
      status: "active",
      member_count: 12,
    }]);

    renderCommunitiesPage();

    expect(await screen.findByRole("link", { name: "Campus Creators" })).toBeVisible();
    expect(screen.getByText("Share projects and meet creative students.")).toBeVisible();
    expect(screen.getByText("12 members")).toBeVisible();
    expect(screen.getByRole("link", { name: /view community/i })).toHaveAttribute("href", "/app/c/campus-creators");
  });

  it("shows communities the current user actively belongs to and their management role", async () => {
    mocks.listMyCommunities.mockResolvedValue([{ community: campusCreators, role: "owner" }]);

    renderCommunitiesPage();

    expect(await screen.findByRole("heading", { name: "Your communities" })).toBeVisible();
    expect(await screen.findByRole("link", { name: "Campus Creators" })).toHaveAttribute("href", "/app/c/campus-creators");
    expect(screen.getByText("owner")).toBeVisible();
    expect(screen.getAllByText("Joined")).toHaveLength(1);
    expect(mocks.listMyCommunities).toHaveBeenCalledWith("student-1");
  });

  it("marks joined communities in discovery results", async () => {
    mocks.listMyCommunities.mockResolvedValue([{ community: campusCreators, role: "member" }]);
    mocks.listCommunities.mockResolvedValue([campusCreators]);

    renderCommunitiesPage();

    expect(await screen.findAllByRole("link", { name: "Campus Creators" })).toHaveLength(2);
    expect(await screen.findAllByText("Joined")).toHaveLength(2);
  });

  it("uses the signed private cover image when a community has one", async () => {
    mocks.listCommunities.mockResolvedValue([{
      id: "community-1",
      name: "Campus Creators",
      slug: "campus-creators",
      description: "Share projects and meet creative students.",
      category: "interest",
      cover_path: "community-1/community-cover-cover.jpg",
      status: "active",
      member_count: 12,
    }]);
    mocks.communityCoverUrl.mockResolvedValue("https://storage.example/signed-cover");

    renderCommunitiesPage();

    await screen.findByRole("link", { name: "Campus Creators" });
    await waitFor(() => expect(mocks.communityCoverUrl).toHaveBeenCalledWith("community-1", "community-1/community-cover-cover.jpg"));
    const coverBadge = screen.getByRole("listitem").querySelector("span");
    expect(coverBadge?.parentElement?.style.backgroundImage).toContain("https://storage.example/signed-cover");
  });

  const campusCreators = {
    id: "community-1",
    name: "Campus Creators",
    slug: "campus-creators",
    description: "Share projects and meet creative students.",
    category: "interest",
    cover_path: null,
    status: "active",
    member_count: 12,
  };

  it("submits community creation through the existing API", async () => {
    renderCommunitiesPage();

    fireEvent.click(screen.getByRole("button", { name: "Create community" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Campus Art" } });
    expect(screen.getByLabelText("Web address (letters, numbers, dashes)")).toHaveValue("campus-art");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mocks.createCommunity).toHaveBeenCalledWith({
      name: "Campus Art",
      slug: "campus-art",
      description: "",
      category: "interest",
      institution: "",
    }));
  });
});
