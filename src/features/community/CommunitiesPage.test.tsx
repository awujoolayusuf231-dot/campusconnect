import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunitiesPage } from "./CommunitiesPage";

const mocks = vi.hoisted(() => ({
  createCommunity: vi.fn(),
  listCommunities: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    createCommunity: mocks.createCommunity,
    listCommunities: mocks.listCommunities,
  };
});

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
    mocks.createCommunity.mockResolvedValue({ slug: "campus-art" });
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
});
