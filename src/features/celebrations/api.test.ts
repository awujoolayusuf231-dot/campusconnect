import { describe, expect, it } from "vitest";
import { beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  optimizeImage: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  },
}));
vi.mock("@/lib/image", () => ({ optimizeImage: mocks.optimizeImage }));

import { fetchFeedTimeline, saveCelebrationCard, validateCelebration, type SaveCelebrationInput } from "./api";
import { recordPostViews } from "@/features/social/api";

describe("Batched post-view recording", () => {
  it("sends unique post ids and accumulated dwell time in batches of at most 50", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const views = Array.from({ length: 51 }, (_, index) => ({
      postId: `post-${index}`,
      dwellMs: 1200,
    }));
    views.push({ postId: "post-0", dwellMs: 800 });

    await recordPostViews(views);

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "record_post_views", {
      p_post_ids: Array.from({ length: 50 }, (_, index) => `post-${index}`),
      p_dwell_ms: [2000, ...Array.from({ length: 49 }, () => 1200)],
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "record_post_views", {
      p_post_ids: ["post-50"],
      p_dwell_ms: [1200],
    });
  });
});

const card: SaveCelebrationInput = {
  title: "Happy birthday",
  category: "birthday",
  celebrant_name: "Amina",
  celebration_at: "2026-11-20T12:00:00.000Z",
  timezone: "Africa/Lagos",
  message: "Wishing you a wonderful year.",
  venue: null,
  whiteshirt_url: "https://whiteshirt.fun/amina-board",
  template_id: "birthday-balloons",
  customization: {
    background: "#8e2433",
    accent: "#ffd166",
    text: "#fffaf2",
    align: "center",
    font: "display",
    photoX: 50,
    photoY: 72,
    photoScale: 1,
  },
  photoPath: null,
  publish: true,
};

describe("Celebration card validation", () => {
  it("accepts a valid occasion-specific card", () => {
    expect(validateCelebration(card)).toBeNull();
  });

  describe("Celebration card image uploads", () => {
    it("optimizes the photo before storing it", async () => {
      const original = new File(["original"], "photo.png", { type: "image/png" });
      const optimized = new File(["optimized"], "photo.webp", { type: "image/webp" });
      mocks.getUser.mockResolvedValue({ data: { user: { id: "student-1" } }, error: null });
      mocks.rpc.mockResolvedValue({ data: "card-1", error: null });
      mocks.upload.mockResolvedValue({ error: null });
      mocks.optimizeImage.mockResolvedValue(optimized);

      await saveCelebrationCard({ ...card, imageFile: original });

      expect(mocks.optimizeImage).toHaveBeenCalledWith(original, 1600, 0.82);
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^student-1\/card-1\/.+\.webp$/),
        optimized,
        { contentType: "image/webp", upsert: false },
      );
    });
  });

  const rankedRow = {
    id: "post-1",
    author_id: "student-2",
    body: "A ranked post",
    created_at: "2026-11-11T09:00:00.000Z",
    edited_at: null,
    like_count: 1,
    comment_count: 2,
    repost_count: 0,
    liked_by_me: false,
    reposted_by_me: false,
    username: "student",
    display_name: "Student",
    avatar_path: null,
    activity_at: "2026-11-11T09:00:00.000Z",
    reposter_username: null,
    reposter_name: null,
    rank_score: 2.5,
    ranked_at: "2026-11-11T10:00:00.000Z",
    feed_variant: "ranked" as const,
  };

  describe("fetchFeedTimeline ranked scope", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.rpc.mockResolvedValue({ data: [rankedRow], error: null });
    });

    it("uses the ranked RPC and maps its stable pagination cursor and variant", async () => {
      const first = await fetchFeedTimeline("for_you", null);

      expect(mocks.rpc).toHaveBeenCalledWith("get_ranked_feed", {
        p_before_score: null,
        p_before: null,
        p_before_id: null,
        p_as_of: null,
        p_variant: null,
        p_limit: 20,
      });
      expect(first[0]).toMatchObject({
        item_type: "post",
        item_id: "post-1",
        rank_score: 2.5,
        ranked_at: rankedRow.ranked_at,
        feed_variant: "ranked",
        item: { body: "A ranked post" },
      });

      await fetchFeedTimeline("for_you", {
        item_type: "post",
        item_id: "post-1",
        activity_at: rankedRow.activity_at,
        rank_score: 2.5,
        ranked_at: rankedRow.ranked_at,
        feed_variant: "ranked",
      });
      expect(mocks.rpc).toHaveBeenLastCalledWith("get_ranked_feed", {
        p_before_score: 2.5,
        p_before: rankedRow.activity_at,
        p_before_id: "post-1",
        p_as_of: rankedRow.ranked_at,
        p_variant: "ranked",
        p_limit: 20,
      });
    });

    it("rejects malformed score cursors instead of silently pagination-resetting", async () => {
      mocks.rpc.mockResolvedValue({ data: [{ ...rankedRow, rank_score: "not-a-number" }], error: null });

      await expect(fetchFeedTimeline("for_you", null)).rejects.toThrow("invalid cursor");
    });
  });

  it("rejects unsupported Whiteshirt hosts and non-HTTPS links", () => {
    expect(validateCelebration({ ...card, whiteshirt_url: "http://whiteshirt.fun/card" })).toMatch(/whiteshirt/i);
    expect(validateCelebration({ ...card, whiteshirt_url: "https://example.com/card" })).toMatch(/whiteshirt/i);
  });

  it("requires a Whiteshirt celebration board link", () => {
    expect(validateCelebration({ ...card, whiteshirt_url: null })).toMatch(/required/i);
    expect(validateCelebration({ ...card, whiteshirt_url: "  " })).toMatch(/required/i);
  });

  it("rejects invalid theme colors and photo placement values", () => {
    expect(validateCelebration({ ...card, customization: { ...card.customization, background: "red" } })).toMatch(/colors/i);
    expect(validateCelebration({ ...card, customization: { ...card.customization, photoScale: 2 } })).toMatch(/image position/i);
  });
});
