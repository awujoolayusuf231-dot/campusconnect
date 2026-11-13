import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  optimizeImage: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));
vi.mock("@/lib/image", () => ({ optimizeImage: mocks.optimizeImage }));
vi.mock("@/features/social/api", () => ({
  MAX_AVATAR_BYTES: 2 * 1024 * 1024,
  MAX_INPUT_IMAGE_BYTES: 15 * 1024 * 1024,
  validateImages: (files: File[]) => files[0]?.type.startsWith("image/") ? null : "Only JPEG, PNG or WebP images are allowed.",
}));

import { uploadProfileAvatar } from "./profileAvatar";

const userId = "student-123";
const image = new File(["photo"], "photo.png", { type: "image/png" });

describe("profile avatar upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.optimizeImage.mockResolvedValue(image);
    vi.stubGlobal("crypto", { randomUUID: () => "avatar-id" });
  });

  it("uploads to the public avatars bucket under the current user's folder and updates their profile", async () => {
    const stages: string[] = [];

    await expect(uploadProfileAvatar(userId, image, (stage) => stages.push(stage)))
      .resolves.toBe(`${userId}/avatar-id.png`);

    expect(mocks.storageFrom).toHaveBeenCalledWith("avatars");
    expect(mocks.upload).toHaveBeenCalledWith(`${userId}/avatar-id.png`, image, { contentType: "image/png", upsert: false });
    expect(mocks.update).toHaveBeenCalledWith({ avatar_path: `${userId}/avatar-id.png` });
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
    expect(stages).toEqual(["optimizing", "uploading", "saving"]);
  });

  it("removes the uploaded photo if updating the profile fails", async () => {
    mocks.eq.mockResolvedValueOnce({ error: new Error("update failed") });

    await expect(uploadProfileAvatar(userId, image)).rejects.toThrow("Could not save your profile photo.");

    expect(mocks.remove).toHaveBeenCalledWith([`${userId}/avatar-id.png`]);
  });

  it("rejects a missing owner before uploading", async () => {
    await expect(uploadProfileAvatar("", image)).rejects.toThrow("Sign in to update your profile photo.");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
