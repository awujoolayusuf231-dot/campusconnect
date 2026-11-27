import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  saveLearningQuiz,
  listLearningQuizQuestions,
  submitLearningQuiz,
  validateLearningQuiz,
  type SaveLearningQuizInput,
} from "./quizApi";

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

  it("submits only the quiz taker's selected answers to the grading RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: "attempt-1", error: null });

    await expect(submitLearningQuiz({
      quizId: "quiz-1",
      answers: [
        { questionId: "question-1", selectedOptionId: "option-2" },
        { questionId: "question-2", answerText: "  Cell  " },
      ],
    })).resolves.toBe("attempt-1");

    expect(mocks.rpc).toHaveBeenCalledWith("submit_learning_quiz", {
      p_quiz_id: "quiz-1",
      p_answers: [
        { question_id: "question-1", selected_option_id: "option-2", answer_text: null },
        { question_id: "question-2", selected_option_id: null, answer_text: "  Cell  " },
      ],
    });
  });

  it("uses the owner-only RPC to load private answer keys while editing", async () => {
    const questions = [{
      id: "question-1",
      quiz_id: "quiz-1",
      position: 1,
      question_type: "multiple_choice",
      prompt: "Which process makes glucose?",
      explanation: "It uses light energy.",
      options: [{ id: "option-1", question_id: "question-1", position: 1, option_text: "Photosynthesis" }],
      answer_option_id: "option-1",
      answer_text: null,
    }];
    mocks.rpc.mockResolvedValue({ data: questions, error: null });

    await expect(listLearningQuizQuestions("quiz-1", true)).resolves.toEqual(questions);

    expect(mocks.rpc).toHaveBeenCalledWith("get_learning_quiz_questions_for_owner", { p_quiz_id: "quiz-1" });
  });
});
