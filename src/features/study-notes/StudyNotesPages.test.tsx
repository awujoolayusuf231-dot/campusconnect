import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MyStudyNotes,
  SavedStudyNotes,
  StudyNoteDetails,
  StudyNotesCourses,
  StudyNotesCourseDetails,
  StudyNotesHome,
  StudyNotesInstitutionDetails,
  StudyNotesInstitutions,
  StudyNotesLayout,
  StudyNotesUpload,
} from "./StudyNotesPages";

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listInstitutions: vi.fn(),
  listInstitutionPage: vi.fn(),
  listDepartments: vi.fn(),
  getInstitution: vi.fn(),
  getCourse: vi.fn(),
  createDepartment: vi.fn(),
  createCourse: vi.fn(),
  listStudyNotes: vi.fn(),
  getStudyNote: vi.fn(),
  listSavedStudyNotes: vi.fn(),
  isStudyNoteSaved: vi.fn(),
  setStudyNoteSaved: vi.fn(),
  uploadStudyNote: vi.fn(),
  validateStudyNoteFile: vi.fn(),
  createStudyNoteDownloadUrl: vi.fn(),
  MAX_STUDY_NOTE_FILE_BYTES: 20 * 1024 * 1024,
}));

vi.mock("@/features/past-questions/api", () => mocks);
vi.mock("./api", () => mocks);
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } }, role: "student", loading: false }),
}));

const institution = { id: "institution-1", name: "Test University", short_name: "TU", state: "Lagos" };
const department = { id: "department-1", institution_id: institution.id, name: "Computer Science" };
const course = {
  id: "course-1",
  department_id: department.id,
  code: "CSC 101",
  title: "Introduction to Computing",
  department: { ...department, institution },
};
const note = {
  id: "note-1",
  title: "Computing study guide",
  description: "A clear introduction to computing concepts and revision topics.",
  course_id: course.id,
  level: "100" as const,
  semester: "first" as const,
  status: "approved" as const,
  created_at: "2026-11-12T10:00:00.000Z",
  uploaded_by: "user-2",
  reviewed_by: "admin-1",
  rejection_reason: null,
  object_path: "user-2/00000000-0000-0000-0000-000000000001.pdf",
  course,
};

function renderStudyNotes(path = "/app/study-notes") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/study-notes" element={<StudyNotesLayout />}>
            <Route index element={<StudyNotesHome />} />
            <Route path="institutions" element={<StudyNotesInstitutions />} />
            <Route path="institutions/:institutionId" element={<StudyNotesInstitutionDetails />} />
            <Route path="courses" element={<StudyNotesCourses />} />
            <Route path="courses/:courseId" element={<StudyNotesCourseDetails />} />
            <Route path="notes/:noteId" element={<StudyNoteDetails />} />
            <Route path="upload" element={<StudyNotesUpload />} />
            <Route path="my-uploads" element={<MyStudyNotes />} />
            <Route path="saved" element={<SavedStudyNotes />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Study Notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCourses.mockResolvedValue([course]);
    mocks.listInstitutions.mockResolvedValue([institution]);
    mocks.listInstitutionPage.mockResolvedValue({ items: [institution], total: 1 });
    mocks.listDepartments.mockResolvedValue([department]);
    mocks.getInstitution.mockResolvedValue(institution);
    mocks.getCourse.mockResolvedValue(course);
    mocks.createDepartment.mockResolvedValue(department);
    mocks.createCourse.mockResolvedValue(course);
    mocks.listStudyNotes.mockResolvedValue([]);
    mocks.getStudyNote.mockResolvedValue(note);
    mocks.listSavedStudyNotes.mockResolvedValue([]);
    mocks.isStudyNoteSaved.mockResolvedValue(false);
    mocks.setStudyNoteSaved.mockResolvedValue(undefined);
    mocks.uploadStudyNote.mockResolvedValue(undefined);
    mocks.validateStudyNoteFile.mockReturnValue(null);
    mocks.createStudyNoteDownloadUrl.mockResolvedValue("https://example.test/secure.pdf");
  });

  it("shows only real approved notes and does not render demonstration records", async () => {
    mocks.listStudyNotes.mockResolvedValue([note]);
    renderStudyNotes();

    expect(await screen.findByRole("link", { name: new RegExp(note.title) })).toHaveAttribute("href", `/app/study-notes/notes/${note.id}`);
    expect(screen.queryByText("Demo preview")).not.toBeInTheDocument();
    expect(mocks.listStudyNotes).toHaveBeenCalledWith({ search: "", limit: 6 });
  });

  it("uses the existing live institution and course catalog", async () => {
    renderStudyNotes("/app/study-notes/courses");

    expect(await screen.findByRole("heading", { name: "Courses" })).toBeVisible();
    expect(await screen.findByRole("link", { name: /CSC 101/ })).toHaveAttribute("href", "/app/study-notes/courses/course-1");
    expect(mocks.listCourses).toHaveBeenCalled();
  });

  it("browses institutions, departments, and their catalog courses", async () => {
    const institutionPage = renderStudyNotes("/app/study-notes/institutions");
    expect(await screen.findByRole("link", { name: /Explore departments/ })).toHaveAttribute("href", `/app/study-notes/institutions/${institution.id}`);

    institutionPage.unmount();
    renderStudyNotes(`/app/study-notes/institutions/${institution.id}`);
    expect(await screen.findByRole("heading", { name: institution.name })).toBeVisible();
    expect(await screen.findByRole("link", { name: /CSC 101/ })).toHaveAttribute("href", `/app/study-notes/courses/${course.id}`);
  });

  it("shows approved notes on their course page", async () => {
    mocks.listStudyNotes.mockResolvedValue([note]);
    renderStudyNotes("/app/study-notes/courses/course-1");

    expect(await screen.findByRole("heading", { name: "CSC 101 · Introduction to Computing" })).toBeVisible();
    expect(await screen.findByRole("link", { name: note.title })).toBeVisible();
  });

  it("loads real note details and requests a secure PDF preview", async () => {
    renderStudyNotes("/app/study-notes/notes/note-1");

    expect(await screen.findByRole("heading", { name: note.title })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
    await waitFor(() => expect(mocks.createStudyNoteDownloadUrl).toHaveBeenCalledWith(note.object_path));
    expect(await screen.findByTitle(`${note.title} PDF preview`)).toHaveAttribute("src", "https://example.test/secure.pdf");
  }, 15000);

  it("submits a PDF for review using the selected academic catalog course", async () => {
    renderStudyNotes("/app/study-notes/upload");
    await screen.findByRole("heading", { name: "Upload study notes" });
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: institution.id } });
    await waitFor(() => expect(screen.getByLabelText("Department")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Department"), { target: { value: department.id } });
    await waitFor(() => expect(screen.getByLabelText("Course")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Course"), { target: { value: course.id } });
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Computing study guide" } });
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Semester"), { target: { value: "first" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A clear introduction to computing concepts and revision topics." } });
    const file = new File(["pdf-content"], "study-guide.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Study notes PDF"), { target: { files: [file] } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit for review" }).closest("form")!);
    });

    await waitFor(() => expect(mocks.uploadStudyNote).toHaveBeenCalled());
    expect(mocks.uploadStudyNote.mock.calls[0]?.[0]).toEqual({
      courseId: course.id,
      title: "Computing study guide",
      description: "A clear introduction to computing concepts and revision topics.",
      level: "100",
      semester: "first",
      file,
      userId: "user-1",
    });
    expect(await screen.findByText(/submitted and are pending review/)).toBeVisible();
  }, 15000);

  it("lets a student add a missing department and course from the upload form", async () => {
    renderStudyNotes("/app/study-notes/upload");
    await screen.findByRole("heading", { name: "Upload study notes" });
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: institution.id } });
    fireEvent.click(await screen.findByRole("button", { name: "Department not listed? Add it" }));
    fireEvent.change(screen.getByLabelText("Department name"), { target: { value: "Computer Science" } });
    fireEvent.click(screen.getByRole("button", { name: "Add department" }));
    await waitFor(() => expect(mocks.createDepartment).toHaveBeenCalledWith({ institutionId: institution.id, name: "Computer Science" }));
    expect(await screen.findByText(/was added and selected/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Course not listed? Add it" }));
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CSC 101" } });
    fireEvent.change(screen.getByLabelText("Course title"), { target: { value: "Introduction to Computing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add course" }));
    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledWith({ departmentId: department.id, code: "CSC 101", title: "Introduction to Computing" }));
    expect(await screen.findByText(/Course CSC 101 was added and selected/)).toBeVisible();
  }, 15000);

  it("shows actual uploads and saved notes without placeholder success states", async () => {
    mocks.listStudyNotes.mockResolvedValue([{ ...note, status: "pending" }]);
    renderStudyNotes("/app/study-notes/my-uploads");
    expect(await screen.findByText(note.title)).toBeVisible();
    expect(screen.getByText("pending")).toBeVisible();

    mocks.listSavedStudyNotes.mockResolvedValue([note]);
    const saved = renderStudyNotes("/app/study-notes/saved");
    expect(await screen.findByText(note.title)).toBeVisible();
    saved.unmount();
  });
});
