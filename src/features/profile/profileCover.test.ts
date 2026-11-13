import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  getPublicUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  download: vi.fn(),
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
vi.mock("@/features/social/api", () => ({ MAX_AVATAR_BYTES: 2 * 1024 * 1024 }));

import {
  migrateLegacyProfileCover,
  removeProfileCover,
  resolveProfileCoverUrl,
  uploadProfileCover,
} from "./profileCover";

const ownerId = "student-123";
const image = new File(["cover"], "cover.png", { type: "image/png" });

describe("profile cover storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://storage.example/cover.png" } });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/signed-cover.png" }, error: null });
    mocks.download.mockResolvedValue({ data: image, error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.eq.mockImplementation((column: string) => column === "cover_path"
      ? { select: () => ({ maybeSingle: async () => ({ data: { id: ownerId }, error: null }) }) }
      : Promise.resolve({ error: null }));
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.storageFrom.mockReturnValue({
      getPublicUrl: mocks.getPublicUrl,
      createSignedUrl: mocks.createSignedUrl,
      download: mocks.download,
      upload: mocks.upload,
      remove: mocks.remove,
    });
    mocks.optimizeImage.mockResolvedValue(image);
    vi.stubGlobal("crypto", { randomUUID: () => "new-cover-id" });
  });

  it("uses the public avatars URL only for a legacy cover and signs private cover URLs", async () => {
    await expect(resolveProfileCoverUrl(ownerId, `${ownerId}/cover-old.png`))
      .resolves.toBe("https://storage.example/cover.png");
    expect(mocks.getPublicUrl).toHaveBeenCalledWith(`${ownerId}/cover-old.png`);
    await expect(resolveProfileCoverUrl(ownerId, `${ownerId}/private-cover-new.png`))
      .resolves.toBe("https://storage.example/signed-cover.png");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(`${ownerId}/private-cover-new.png`, 60);
    await expect(resolveProfileCoverUrl(ownerId, null)).resolves.toBeNull();
  });

  it("uploads covers to the private bucket under the signed-in user's folder", async () => {
    const stages: string[] = [];
    const result = await uploadProfileCover(ownerId, image, null, (stage) => stages.push(stage));

    expect(result).toEqual({ path: `${ownerId}/private-cover-new-cover-id.png`, previousImageRemoved: true });
    expect(mocks.storageFrom).toHaveBeenCalledWith("profile-covers");
    expect(mocks.upload).toHaveBeenCalledWith(result.path, image, { contentType: "image/png", upsert: false });
    expect(mocks.update).toHaveBeenCalledWith({ cover_path: result.path });
    expect(mocks.eq).toHaveBeenCalledWith("id", ownerId);
    expect(stages).toEqual(["optimizing", "uploading", "saving"]);
  });

  it("replaces a legacy public cover and removes only the previous file owned by the same user", async () => {
    const oldPath = `${ownerId}/cover-old.png`;

    const result = await uploadProfileCover(ownerId, image, oldPath);

    expect(result.previousImageRemoved).toBe(true);
    expect(mocks.storageFrom).toHaveBeenCalledWith("avatars");
    expect(mocks.remove).toHaveBeenCalledWith([oldPath]);
  });

  it("explains how to fix an unprovisioned private covers bucket", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: "Bucket not found", statusCode: "404" } });

    await expect(uploadProfileCover(ownerId, image, null))
      .rejects.toThrow("Apply migration 20261111000015_private_profile_covers.sql in Supabase");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("explains when Storage policies reject the cover upload", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: "new row violates row-level security policy", statusCode: "400" } });

    await expect(uploadProfileCover(ownerId, image, null))
      .rejects.toThrow("Confirm migration 20261111000015_private_profile_covers.sql and its profile-covers Storage policies are applied.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("clears the profile path before deleting the user's cover file", async () => {
    const path = `${ownerId}/private-cover-old.png`;

    await expect(removeProfileCover(ownerId, path)).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledWith({ cover_path: null });
    expect(mocks.eq).toHaveBeenCalledWith("id", ownerId);
    expect(mocks.remove).toHaveBeenCalledWith([path]);
    expect(mocks.storageFrom).toHaveBeenCalledWith("profile-covers");
  });

  it("rejects attempts to replace or remove a different user's cover", async () => {
    await expect(uploadProfileCover(ownerId, image, "another-student/cover.png"))
      .rejects.toThrow("You can only manage your own cover image.");
    await expect(removeProfileCover(ownerId, "another-student/cover.png"))
      .rejects.toThrow("You can only manage your own cover image.");

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("removes the newly uploaded file if saving the profile path fails", async () => {
    mocks.eq.mockResolvedValueOnce({ error: new Error("profile update failed") });
    const path = `${ownerId}/private-cover-new-cover-id.png`;

    await expect(uploadProfileCover(ownerId, image, null))
      .rejects.toThrow("Could not save your cover image. Please try again.");

    expect(mocks.remove).toHaveBeenCalledWith([path]);
  });

  it("migrates a legacy cover into private storage and deletes its public copy", async () => {
    const path = `${ownerId}/cover-old.png`;
    mocks.eq.mockImplementationOnce(() => ({
      eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: ownerId }, error: null }) }) }),
    }));

    await expect(migrateLegacyProfileCover(ownerId, path))
      .resolves.toEqual({ path: `${ownerId}/private-cover-new-cover-id.png`, previousImageRemoved: true });

    expect(mocks.download).toHaveBeenCalledWith(path);
    expect(mocks.storageFrom).toHaveBeenCalledWith("profile-covers");
    expect(mocks.update).toHaveBeenCalledWith({ cover_path: `${ownerId}/private-cover-new-cover-id.png` });
    expect(mocks.remove).toHaveBeenCalledWith([path]);
  });
});
