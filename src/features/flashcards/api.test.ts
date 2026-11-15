import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser } },
}));

import {
  recordFlashcardReview,
  saveFlashcardCollection,
  validateFlashcardCollection,
} from "./api";

describe("flashcard API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "collection-1", error: null });
  });

  it("validates title, card count and both sides of each card", () => {
    const base = { courseId: null, title: "Valid deck", description: "", isPublic: false, cards: [{ prompt: "Q", answer: "A" }] };

    expect(validateFlashcardCollection({ ...base, title: "ab" })).toContain("between 3 and 120");
    expect(validateFlashcardCollection({ ...base, cards: [] })).toContain("between 1 and 200");
    expect(validateFlashcardCollection({ ...base, cards: [{ prompt: "", answer: "A" }] })).toContain("Card 1 needs a prompt");
  });

  it("persists a validated collection through the owner-checked RPC", async () => {
    await expect(saveFlashcardCollection({
      courseId: "course-1",
      title: "  Biology terms ",
      description: "  Core vocabulary ",
      isPublic: true,
      cards: [
        { prompt: "  Cell ", answer: " Basic unit of life " },
        { id: "card-1", prompt: "Organism", answer: "A living thing" },
      ],
    })).resolves.toBe("collection-1");

    expect(mocks.rpc).toHaveBeenCalledWith("save_flashcard_collection", {
      p_collection_id: null,
      p_course_id: "course-1",
      p_title: "Biology terms",
      p_description: "Core vocabulary",
      p_is_public: true,
      p_cards: [
        { prompt: "Cell", answer: "Basic unit of life" },
        { id: "card-1", prompt: "Organism", answer: "A living thing" },
      ],
    });
  });

  it("records a review outcome through the private progress RPC", async () => {
    await recordFlashcardReview("card-1", "needs_practice");

    expect(mocks.rpc).toHaveBeenCalledWith("record_flashcard_review", {
      p_flashcard_id: "card-1",
      p_status: "needs_practice",
    });
  });

  it("does not call Supabase when a collection is invalid", async () => {
    await expect(saveFlashcardCollection({
      courseId: null,
      title: " ",
      description: "",
      isPublic: false,
      cards: [{ prompt: "", answer: "" }],
    })).rejects.toThrow("Collection title must be between 3 and 120 characters.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
