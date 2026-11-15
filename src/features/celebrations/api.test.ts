import { describe, expect, it } from "vitest";
import { beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchFeedTimeline, validateCelebration, type SaveCelebrationInput } from "./api";

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
  };

  describe("fetchFeedTimeline ranked scope", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.rpc.mockResolvedValue({ data: [rankedRow], error: null });
    });

    it("uses the ranked RPC and maps its stable pagination cursor", async () => {
      const first = await fetchFeedTimeline("for_you", null);

      expect(mocks.rpc).toHaveBeenCalledWith("feed_ranked_posts", {
        p_before_score: null,
        p_before: null,
        p_before_id: null,
        p_as_of: null,
        p_limit: 20,
      });
      expect(first[0]).toMatchObject({
        item_type: "post",
        item_id: "post-1",
        rank_score: 2.5,
        ranked_at: rankedRow.ranked_at,
        item: { body: "A ranked post" },
      });

      await fetchFeedTimeline("for_you", {
        item_type: "post",
        item_id: "post-1",
        activity_at: rankedRow.activity_at,
        rank_score: 2.5,
        ranked_at: rankedRow.ranked_at,
      });
      expect(mocks.rpc).toHaveBeenLastCalledWith("feed_ranked_posts", {
        p_before_score: 2.5,
        p_before: rankedRow.activity_at,
        p_before_id: "post-1",
        p_as_of: rankedRow.ranked_at,
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
