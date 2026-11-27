import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { listCourses, validatePastQuestionFile } from "./api";

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return query;
}

describe("past question catalog API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes department and institution relationships returned as objects or arrays", async () => {
    const institution = { id: "institution-1", name: "Test University", short_name: "TU", state: "Lagos" };
    const department = { id: "department-1", institution_id: institution.id, name: "Computer Science" };
    mocks.from.mockReturnValue(queryResult([
      {
        id: "course-1",
        department_id: department.id,
        code: "CSC 101",
        title: "Introduction to Computing",
        department: { ...department, institution },
      },
      {
        id: "course-2",
        department_id: department.id,
        code: "CSC 102",
        title: "Programming Basics",
        department: [{ ...department, institution: [institution] }],
      },
    ]));

    const courses = await listCourses();

    expect(courses.map((course) => course.department?.name)).toEqual(["Computer Science", "Computer Science"]);
    expect(courses[0]?.department?.institution?.name).toBe("Test University");
    expect(courses[1]?.department?.institution?.name).toBe("Test University");
  });

  it("accepts supported photos and Word files while rejecting unsafe or mismatched file types", () => {
    expect(validatePastQuestionFile(new File(["image"], "exam-photo.png", { type: "image/png" }))).toBeNull();
    expect(validatePastQuestionFile(new File(["document"], "exam.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }))).toBeNull();
    expect(validatePastQuestionFile(new File(["script"], "exam.exe", { type: "application/octet-stream" }))).toContain("Choose a PDF");
    expect(validatePastQuestionFile(new File(["image"], "exam.png", { type: "application/pdf" }))).toContain("Choose a PDF");
  });
});
