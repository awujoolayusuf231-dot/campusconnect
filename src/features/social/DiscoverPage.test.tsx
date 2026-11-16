import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  listActiveInstitutions: vi.fn(),
  fetchTrendingHashtags: vi.fn(),
  searchHashtags: vi.fn(),
  session: { user: { id: "student-1" } },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock("@/features/institutions/api", () => ({ listActiveInstitutions: mocks.listActiveInstitutions }));
vi.mock("./api", () => ({
  avatarUrl: () => null,
  followUser: mocks.followUser,
  unfollowUser: mocks.unfollowUser,
  fetchTrendingHashtags: mocks.fetchTrendingHashtags,
  searchHashtags: mocks.searchHashtags,
}));

import { DiscoverPage } from "./DiscoverPage";

const student = {
  id: "student-2",
  username: "amina",
  display_name: "Amina Bello",
  avatar_path: null,
  bio: "Robotics student and campus volunteer.",
  institution_id: "institution-1",
  department: "Computer Science",
  academic_level: "300L",
};

function renderDiscoverPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DiscoverPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("DiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "discover_students" ? [student] : [],
      error: null,
    }));
    mocks.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({
        limit: async () => ({ data: [] }),
        maybeSingle: async () => ({ data: null, error: null }),
      }) }),
    }));
    mocks.followUser.mockResolvedValue(undefined);
    mocks.unfollowUser.mockResolvedValue(undefined);
    mocks.listActiveInstitutions.mockResolvedValue([{ id: "institution-1", name: "Campus University", short_name: "CU" }]);
    mocks.fetchTrendingHashtags.mockResolvedValue([]);
    mocks.searchHashtags.mockResolvedValue([]);
  });

  it("shows student search results using the existing discovery API", async () => {
    renderDiscoverPage();

    expect(await screen.findByRole("link", { name: "Amina Bello" })).toHaveAttribute("href", "/app/u/amina");
    expect(screen.getByText("Campus University")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
    expect(screen.getByText("300L")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("discover_students", expect.objectContaining({ p_limit: 24, p_offset: 0 }));
  });

  it("applies submitted filters through the existing discovery RPC", async () => {
    renderDiscoverPage();

    await screen.findByRole("option", { name: "Campus University" });
    fireEvent.change(screen.getByRole("textbox", { name: "Name or username" }), { target: { value: "Amina" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Institution" }), { target: { value: "institution-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search students" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("discover_students", expect.objectContaining({
      p_query: "Amina",
      p_institution: "institution-1",
      p_limit: 24,
      p_offset: 0,
    })));
  });

  it("keeps follow actions connected to the existing social API", async () => {
    renderDiscoverPage();

    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));

    await waitFor(() => expect(mocks.followUser).toHaveBeenCalledWith("student-2"));
  });

  it("requests nearby students without sending a location supplied by the browser", async () => {
    renderDiscoverPage();

    fireEvent.click(await screen.findByRole("button", { name: "Same city/state" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("recommend_students", {
      p_location_only: true,
      p_limit: 12,
      p_offset: 0,
    }));
    expect(screen.getByText(/without GPS or external services/)).toBeInTheDocument();
  });

  it("saves a private city/state only when the student explicitly opts in", async () => {
    renderDiscoverPage();
    fireEvent.click(await screen.findByRole("button", { name: "Same city/state" }));
    fireEvent.change(screen.getByRole("textbox", { name: "City or state (not a street address)" }), { target: { value: "Lagos, Nigeria" } });

    fireEvent.click(await screen.findByRole("button", { name: "Share city/state" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_my_discovery_location", {
      p_city_state: "Lagos, Nigeria",
      p_enabled: true,
    }));
  });

  it("removes the stored city/state when the student opts out", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "get_my_discovery_location" ? [{ city_state: "Lagos, Nigeria", enabled: true }] : [],
      error: null,
    }));
    renderDiscoverPage();
    fireEvent.click(await screen.findByRole("button", { name: "Same city/state" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_my_discovery_location", {
      p_city_state: "Lagos, Nigeria",
      p_enabled: false,
    }));
  });
});
