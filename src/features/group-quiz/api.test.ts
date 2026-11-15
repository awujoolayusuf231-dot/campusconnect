import { describe, expect, it } from "vitest";
import { validateGroupQuiz, validateQuizGroup, type SaveGroupQuizInput } from "./api";

const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const closesAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const quiz: SaveGroupQuizInput = {
  groupId: "group-1",
  title: "Biology revision",
  description: "",
  startsAt,
  closesAt,
  durationMinutes: 30,
  answerRelease: "after_close",
  answerReleaseAt: null,
  publish: true,
  questions: [{ prompt: "What is a cell?", explanation: "", options: ["Basic unit", "Organ"], correctIndex: 0 }],
};

describe("Group Quiz input validation", () => {
  it("requires a coherent institution, department, and course selection for groups", () => {
    expect(validateQuizGroup({
      name: "Study team",
      description: "",
      institutionId: "",
      departmentId: null,
      courseId: null,
      visibility: "discoverable",
      joinPolicy: "approval",
    })).toMatch(/institution/i);
    expect(validateQuizGroup({
      name: "Study team",
      description: "",
      institutionId: "institution-1",
      departmentId: null,
      courseId: "course-1",
      visibility: "discoverable",
      joinPolicy: "approval",
    })).toMatch(/department/i);
  });

  it("requires closing time when answers release after the quiz closes", () => {
    expect(validateGroupQuiz({ ...quiz, closesAt: null })).toMatch(/closing date/i);
    expect(validateGroupQuiz(quiz)).toBeNull();
  });

  it("rejects schedules that cannot be published or released", () => {
    expect(validateGroupQuiz({ ...quiz, startsAt: new Date(Date.now() - 60_000).toISOString() })).toMatch(/future/i);
    expect(validateGroupQuiz({ ...quiz, closesAt: startsAt })).toMatch(/after the start/i);
    expect(validateGroupQuiz({
      ...quiz,
      answerRelease: "at_time",
      answerReleaseAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })).toMatch(/at or after the start/i);
  });

  it("rejects quizzes without a correct option or with invalid option counts", () => {
    expect(validateGroupQuiz({ ...quiz, questions: [{ ...quiz.questions[0]!, correctIndex: -1 }] })).toMatch(/correct answer/i);
    expect(validateGroupQuiz({ ...quiz, questions: [{ ...quiz.questions[0]!, options: ["Only one"], correctIndex: 0 }] })).toMatch(/2 to 6 options/i);
  });
});
