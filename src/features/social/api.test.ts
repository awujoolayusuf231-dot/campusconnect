import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  supabaseUrl: "https://campusconnect.example",
  supabasePublishableKey: "publishable-test-key",
}));

import { fetchPostImage } from "./api";

describe("fetchPostImage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "viewer-access-token" } },
      error: null,
    });
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
});
