import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl }) },
  },
}));
vi.mock("@/lib/image", () => ({ optimizeImage: vi.fn(async (file: File) => file) }));
vi.mock("@/features/social/api", () => ({
  MAX_AVATAR_BYTES: 2 * 1024 * 1024,
  MAX_INPUT_IMAGE_BYTES: 15 * 1024 * 1024,
  validateImages: vi.fn(() => null),
}));

import { communityCoverUrl, uploadCommunityCover } from "./communityCover";

describe("uploadCommunityCover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-12d3-a456-426614174000" });
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "my_community_role" ? "owner" : true,
      error: null,
    }));
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/cover" }, error: null });
  });

  it("verifies owner and posting eligibility before uploading", async () => {
    await expect(uploadCommunityCover("community-1", new File(["cover"], "cover.png", { type: "image/png" })))
      .resolves.toBe("community-1/community-cover-123e4567-e89b-12d3-a456-426614174000.png");

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "my_community_role", { p_comm: "community-1" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "account_can_post");
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it("does not upload when the caller is not the active owner", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "my_community_role" ? "moderator" : true,
      error: null,
    }));

    await expect(uploadCommunityCover("community-1", new File(["cover"], "cover.png", { type: "image/png" })))
      .rejects.toThrow("Only an active community owner can upload");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("explains when account posting eligibility blocks the upload", async () => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === "my_community_role" ? "owner" : false,
      error: null,
    }));

    await expect(uploadCommunityCover("community-1", new File(["cover"], "cover.png", { type: "image/png" })))
      .rejects.toThrow("currently unable to post");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("identifies storage policy drift after the owner checks pass", async () => {
    mocks.upload.mockResolvedValue({
      error: { message: "new row violates row-level security policy", statusCode: "403" },
    });

    await expect(uploadCommunityCover("community-1", new File(["cover"], "cover.png", { type: "image/png" })))
      .rejects.toThrow(/HTTP 403: new row violates row-level security policy.*community_covers_insert_manager/);
  });

  it("reports the Storage failure when signing a cover URL fails", async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "row-level security policy violation", statusCode: "400" },
    });

    await expect(communityCoverUrl("community-1", "community-1/community-cover-cover.jpg"))
      .rejects.toThrow("HTTP 400: row-level security policy violation");
  });
});
