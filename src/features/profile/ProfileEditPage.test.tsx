import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  uploadProfileAvatar: vi.fn(),
  uploadProfileCover: vi.fn(),
  removeProfileCover: vi.fn(),
  migrateLegacyProfileCover: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "student-123" } } }),
}));
vi.mock("@/features/institutions/api", () => ({ listActiveInstitutions: vi.fn() }));
vi.mock("@/features/institutions/InstitutionPicker", () => ({
  InstitutionPicker: () => <div data-testid="institution-picker" />,
}));
vi.mock("@/features/social/components/Avatar", () => ({
  Avatar: () => <img alt="Current profile photo" src="https://storage.example/avatar.png" />,
}));
vi.mock("@/features/profile/profileAvatar", () => ({ uploadProfileAvatar: mocks.uploadProfileAvatar }));
vi.mock("@/features/profile/profileCover", () => ({
  isLegacyProfileCover: () => false,
  migrateLegacyProfileCover: mocks.migrateLegacyProfileCover,
  removeProfileCover: mocks.removeProfileCover,
  resolveProfileCoverUrl: vi.fn(),
  uploadProfileCover: mocks.uploadProfileCover,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("./WhiteshirtDialog", () => ({ WhiteshirtDialog: () => null }));

import { ProfileEditPage } from "./ProfileEditPage";

const ownerId = "student-123";
const currentCover = `${ownerId}/private-cover-current.png`;

function renderEditPage(coverPath: string | null = currentCover) {
  mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "own-profile") {
      return {
        data: {
          id: ownerId,
          username: "student",
          display_name: "Campus Student",
          bio: "",
          avatar_path: `${ownerId}/avatar.png`,
          cover_path: coverPath,
          institution_id: null,
          interests: [],
        },
        isLoading: false,
        isError: false,
      };
    }
    if (queryKey[0] === "profile-cover-url") {
      return { data: coverPath ? "https://storage.example/current-cover.png" : null, isError: false };
    }
    return { data: false, isLoading: false, isError: false };
  });

  return render(<MemoryRouter><ProfileEditPage /></MemoryRouter>);
}

describe("ProfileEditPage photo controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadProfileAvatar.mockResolvedValue(`${ownerId}/avatar-new.png`);
    mocks.uploadProfileCover.mockResolvedValue({ path: `${ownerId}/private-cover-new.png`, previousImageRemoved: true });
    mocks.removeProfileCover.mockResolvedValue(true);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:cover-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("shows the current avatar and uploads a selected profile photo", async () => {
    renderEditPage();
    expect(screen.getByRole("img", { name: "Current profile photo" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Choose a new profile photo"), {
      target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(mocks.uploadProfileAvatar).toHaveBeenCalledOnce());
    expect(mocks.uploadProfileAvatar).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({ name: "avatar.png" }),
      expect.any(Function),
    );
    expect(await screen.findByText("Profile photo updated.")).toBeVisible();
  });

  it("previews a selected cover before uploading and replaces the current cover", async () => {
    renderEditPage();
    const newCover = new File(["cover"], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose a cover photo"), { target: { files: [newCover] } });

    const preview = await screen.findByRole("img", { name: "Selected cover photo preview" });
    expect(preview).toHaveStyle({ backgroundImage: expect.stringContaining("blob:cover-preview") });
    expect(mocks.uploadProfileCover).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save Cover Photo" }));
    await waitFor(() => expect(mocks.uploadProfileCover).toHaveBeenCalledOnce());
    expect(mocks.uploadProfileCover).toHaveBeenCalledWith(ownerId, newCover, currentCover, expect.any(Function));
    expect(await screen.findByText("Cover photo updated.")).toBeVisible();
  });

  it("asks for confirmation before removing the current cover", async () => {
    renderEditPage();
    fireEvent.click(screen.getByRole("button", { name: "Remove Cover Photo" }));
    expect(screen.getByRole("alertdialog", { name: "Remove your cover image?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove cover" }));

    await waitFor(() => expect(mocks.removeProfileCover).toHaveBeenCalledWith(ownerId, currentCover));
    expect(await screen.findByText("Cover image removed.")).toBeVisible();
  });
});
