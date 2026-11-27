import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { saveLearningQuiz, validateLearningQuiz, type SaveLearningQuizInput } from "./quizApi";

const validQuiz: SaveLearningQuizInput = {
  courseId: null,
  title: "Biology revision",
  description: "Core concepts",
  publish: true,
  questions: [
    {
      type: "multiple_choice",
      prompt: "Which process makes glucose in plants?",
      options: ["Photosynthesis", "Respiration"],
      answer: "Photosynthesis",
      explanation: "Plants convert light energy into chemical energy.",
    },
    {
      type: "short_answer",
      prompt: "What is the basic unit of life?",
      options: [],
      answer: "Cell",
      explanation: "",
    },
  ],
};

describe("learning quiz API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates missing answer keys and duplicate options before saving", () => {
    expect(validateLearningQuiz({
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0]!, answer: "" }],
    })).toContain("Choose a correct answer");
    expect(validateLearningQuiz({
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0]!, options: ["Same", "Same"] }],
    })).toContain("duplicate options");
  });

  it("persists choices, private answer keys, and publish intent through the guarded RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: "quiz-1", error: null });

    await expect(saveLearningQuiz(validQuiz)).resolves.toBe("quiz-1");

    expect(mocks.rpc).toHaveBeenCalledWith("save_learning_quiz", expect.objectContaining({
      p_quiz_id: null,
      p_publish: true,
      p_questions: [
        expect.objectContaining({ type: "multiple_choice", correct_index: 0 }),
        expect.objectContaining({ type: "short_answer", answer: "Cell", options: [] }),
      ],
    }));
  });
});
