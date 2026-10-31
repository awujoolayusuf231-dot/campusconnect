import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  useInfiniteQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: mocks.useInfiniteQuery,
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/features/social/api", () => ({
  followUser: vi.fn(),
  listConnections: vi.fn(),
  unfollowUser: vi.fn(),
}));
vi.mock("@/features/social/components/Avatar", () => ({
  Avatar: () => <span aria-hidden="true">Avatar</span>,
}));

import { ConnectionsDialog } from "./ConnectionsDialog";

describe("ConnectionsDialog", () => {
  beforeEach(() => {
    mocks.close.mockReset();
    mocks.useInfiniteQuery.mockReturnValue({
      data: { pages: [[{
        user_id: "follower-1",
        username: "campus_friend",
        display_name: "Campus Friend",
        avatar_path: null,
        is_following: false,
      }]] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
  });

  it("renders above app headers in a body portal with the first follower and close control visible", () => {
    render(
      <MemoryRouter>
        <ConnectionsDialog userId="profile-1" initial="followers" me="profile-1" onClose={mocks.close} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Connections" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("z-[60]");
    expect(screen.getByText("Campus Friend")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("closes when its close button is pressed", () => {
    render(
      <MemoryRouter>
        <ConnectionsDialog userId="profile-1" initial="followers" me="profile-1" onClose={mocks.close} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
