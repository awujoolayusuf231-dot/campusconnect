import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { listStudyNotes } from "./api";

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return query;
}

describe("study notes API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes course, department, and institution relationships returned as objects", async () => {
    const institution = { id: "institution-1", name: "Test University", short_name: "TU", state: "Lagos" };
    const department = { id: "department-1", institution_id: institution.id, name: "Computer Science" };
    mocks.from.mockReturnValue(queryResult([{
      id: "note-1",
      title: "Revision Notes",
      description: "Core concepts",
      course_id: "course-1",
      level: "100",
      semester: "first",
      status: "approved",
      created_at: "2026-11-13T10:00:00.000Z",
      uploaded_by: "user-1",
      reviewed_by: null,
      rejection_reason: null,
      object_path: "user-1/note.pdf",
      course: {
        id: "course-1",
        department_id: department.id,
        code: "CSC 101",
        title: "Introduction to Computing",
        department: { ...department, institution },
      },
    }]));

    const notes = await listStudyNotes();

    expect(notes[0]?.course?.department?.name).toBe("Computer Science");
    expect(notes[0]?.course?.department?.institution?.name).toBe("Test University");
  });
});
