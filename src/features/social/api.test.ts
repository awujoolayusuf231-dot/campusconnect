import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn(), insert: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession }, from: mocks.from },
  supabaseUrl: "https://campusconnect.example",
  supabasePublishableKey: "publishable-test-key",
}));

import { createPost, fetchPostImage } from "./api";

describe("fetchPostImage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "viewer-access-token", user: { id: "author-1" } } },
      error: null,
    });
    const single = vi.fn().mockResolvedValue({ data: { id: "post-1" }, error: null });
    const select = vi.fn(() => ({ single }));
    mocks.insert.mockReturnValue({ select });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests image bytes with the current viewer's bearer token and no-store cache", async () => {
    const image = new Blob(["image bytes"], { type: "image/png" });
    fetchMock.mockResolvedValue({ ok: true, blob: async () => image });

    await expect(fetchPostImage("owner-id/photo.png")).resolves.toBe(image);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://campusconnect.example/functions/v1/post-image?path=owner-id%2Fphoto.png",
      {
        headers: {
          apikey: "publishable-test-key",
          Authorization: "Bearer viewer-access-token",
        },
        cache: "no-store",
      },
    );
  });

  it("does not make a request without an authenticated viewer", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(fetchPostImage("owner-id/photo.png")).rejects.toThrow("Sign in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects images denied by the current Storage RLS rules", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(fetchPostImage("owner-id/photo.png")).rejects.toThrow("no longer available");
  });

  it("persists the selected audience and forces community posts to community-only", async () => {
    await expect(createPost("A followers-only update", [], undefined, "followers")).resolves.toEqual({ failedImages: 0 });
    expect(mocks.from).toHaveBeenCalledWith("posts");
    expect(mocks.insert).toHaveBeenCalledWith({ body: "A followers-only update", visibility: "followers" });

    await createPost("A community update", [], "community-1", "public");
    expect(mocks.insert).toHaveBeenLastCalledWith({ body: "A community update", visibility: "community", community_id: "community-1" });
  });
});
