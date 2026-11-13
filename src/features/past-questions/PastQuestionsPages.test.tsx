import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PastQuestionsLayout } from "./PastQuestionsLayout";
import {
  CourseBrowser,
  CourseDetailsPage,
  InstitutionBrowser,
  InstitutionDetailsPage,
  MyResourcesPage,
  PastQuestionsHome,
  QuestionDetailsPage,
  CatalogManagementPage,
  ResourceManagementPage,
  UploadPage,
} from "./PastQuestionsPages";

const mocks = vi.hoisted(() => ({
  listInstitutions: vi.fn(),
  listInstitutionPage: vi.fn(),
  getInstitution: vi.fn(),
  listDepartments: vi.fn(),
  listCourses: vi.fn(),
  getCourse: vi.fn(),
  listResources: vi.fn(),
  getResource: vi.fn(),
  uploadResource: vi.fn(),
  createResourceDownloadUrl: vi.fn(),
  reviewResource: vi.fn(),
  createDepartment: vi.fn(),
  createCourse: vi.fn(),
  importCatalogRows: vi.fn(),
  permissions: vi.fn(),
  validatePastQuestionFile: vi.fn(),
}));

vi.mock("./api", () => ({
  ...mocks,
  MAX_PAST_QUESTION_FILE_BYTES: 20 * 1024 * 1024,
}));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));

vi.mock("@/features/admin/useMyPermissions", () => ({
  useMyPermissions: () => ({ data: mocks.permissions(), isLoading: false, isError: false, refetch: vi.fn() }),
}));

const institution = { id: "institution-1", name: "Test University", short_name: "TU", state: "Lagos" };
const secondInstitution = { id: "institution-2", name: "Another College", short_name: "AC", state: "Abuja" };
const department = { id: "department-1", institution_id: institution.id, name: "Computer Science" };
const course = {
  id: "course-1",
  department_id: department.id,
  code: "CSC 101",
  title: "Introduction to Computing",
  department: { ...department, institution },
};
const resource = {
  id: "resource-1",
  title: "CSC 101 First Semester Examination",
  academic_session: "2024/2025",
  exam_year: 2025,
  semester: "first" as const,
  status: "approved" as const,
  created_at: "2025-02-01T10:00:00.000Z",
  uploaded_by: "user-1",
  reviewed_by: "reviewer-1",
  rejection_reason: null,
  object_path: "user-1/00000000-0000-4000-8000-000000000001.pdf",
  course_id: course.id,
  course,
};

function renderPastQuestions(path = "/app/past-questions") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/past-questions" element={<PastQuestionsLayout />}>
            <Route index element={<PastQuestionsHome />} />
            <Route path="institutions" element={<InstitutionBrowser />} />
            <Route path="institutions/:institutionId" element={<InstitutionDetailsPage />} />
            <Route path="courses" element={<CourseBrowser />} />
            <Route path="courses/:courseId" element={<CourseDetailsPage />} />
            <Route path="questions/:questionId" element={<QuestionDetailsPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="my-resources" element={<MyResourcesPage />} />
            <Route path="manage" element={<ResourceManagementPage />} />
            <Route path="catalog" element={<CatalogManagementPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Past Questions Supabase integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listInstitutions.mockResolvedValue([institution]);
    mocks.listInstitutionPage.mockResolvedValue({ items: [institution], total: 1 });
    mocks.getInstitution.mockResolvedValue(institution);
    mocks.listDepartments.mockResolvedValue([department]);
    mocks.listCourses.mockResolvedValue([course]);
    mocks.getCourse.mockResolvedValue(course);
    mocks.listResources.mockResolvedValue([resource]);
    mocks.getResource.mockResolvedValue(resource);
    mocks.uploadResource.mockResolvedValue(undefined);
    mocks.createDepartment.mockResolvedValue(department);
    mocks.createCourse.mockResolvedValue(course);
    mocks.importCatalogRows.mockResolvedValue({ departmentsCreated: 1, coursesCreated: 2, duplicatesSkipped: 1, errors: [] });
    mocks.createResourceDownloadUrl.mockResolvedValue("https://example.test/signed.pdf");
    mocks.reviewResource.mockResolvedValue(undefined);
    mocks.permissions.mockReturnValue(["past_questions.review"]);
    mocks.validatePastQuestionFile.mockReturnValue(null);
  });

  it("shows Supabase records on the homepage and searches using selected filters", async () => {
    renderPastQuestions();

    expect(await screen.findByRole("heading", { name: resource.title })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Search past questions" }), { target: { value: "CSC 101" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by institution" }), { target: { value: institution.id } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(mocks.listResources).toHaveBeenLastCalledWith({
      institutionId: institution.id,
      search: "CSC 101",
      limit: 6,
    }));
    expect(screen.queryByText("Sample preview")).not.toBeInTheDocument();
  });

  it("browses actual institution, department, and course records", async () => {
    renderPastQuestions("/app/past-questions/institutions");

    expect(await screen.findByRole("heading", { name: institution.name })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Browse institution" }));

    expect(await screen.findByRole("heading", { name: "Departments" })).toBeVisible();
    expect(await screen.findByRole("link", { name: /CSC 101/ })).toHaveAttribute("href", `/app/past-questions/courses/${course.id}`);
  });

  it("shows approved resources on a course and creates a short-lived document link on demand", async () => {
    const courseView = renderPastQuestions(`/app/past-questions/courses/${course.id}`);
    expect(await screen.findByRole("heading", { name: course.title })).toBeVisible();
    expect(await screen.findByRole("heading", { name: resource.title })).toBeVisible();

    courseView.unmount();
    renderPastQuestions(`/app/past-questions/questions/${resource.id}`);
    expect(await screen.findByRole("heading", { name: resource.title })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Get secure document link" }));
    expect(await screen.findByRole("link", { name: "Open PDF" })).toHaveAttribute("href", "https://example.test/signed.pdf");
  });

  it("submits a selected PDF through the upload workflow", async () => {
    mocks.listDepartments.mockResolvedValue([department]);
    mocks.listCourses.mockResolvedValue([course]);
    renderPastQuestions("/app/past-questions/upload");

    await screen.findByRole("option", { name: institution.name });
    fireEvent.change(await screen.findByLabelText("Institution"), { target: { value: institution.id } });
    await screen.findByRole("option", { name: department.name });
    fireEvent.change(await screen.findByLabelText("Department"), { target: { value: department.id } });
    await screen.findByRole("option", { name: /CSC 101/ });
    fireEvent.change(await screen.findByLabelText("Course"), { target: { value: course.id } });
    fireEvent.change(screen.getByLabelText("Document title"), { target: { value: "CSC 101 examination" } });
    fireEvent.change(screen.getByLabelText("Academic session"), { target: { value: "2024/2025" } });
    fireEvent.change(screen.getByLabelText("Exam year"), { target: { value: "2025" } });
    fireEvent.change(screen.getByLabelText("Examination document (PDF)"), {
      target: { files: [new File(["pdf content"], "exam.pdf", { type: "application/pdf" })] },
    });
    expect((screen.getByLabelText("Institution") as HTMLSelectElement).value).toBe(institution.id);
    expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe(department.id);
    expect((screen.getByLabelText("Course") as HTMLSelectElement).value).toBe(course.id);
    expect((screen.getByLabelText("Examination document (PDF)") as HTMLInputElement).files).toHaveLength(1);
    fireEvent.submit(screen.getByRole("button", { name: "Submit for review" }).closest("form")!);

    await waitFor(() => expect(mocks.uploadResource).toHaveBeenCalledWith(expect.objectContaining({
      courseId: course.id,
      title: "CSC 101 examination",
      academicSession: "2024/2025",
      examYear: 2025,
      userId: "user-1",
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("pending review");
  });

  it("allows an uploader to add a missing department and course to the shared catalog", async () => {
    renderPastQuestions("/app/past-questions/upload");

    await screen.findByRole("option", { name: institution.name });
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: institution.id } });
    fireEvent.click(await screen.findByRole("button", { name: "Department not listed? Add it" }));
    fireEvent.change(screen.getByLabelText("Department name"), { target: { value: department.name } });
    fireEvent.click(screen.getByRole("button", { name: "Add department" }));
    expect(await screen.findByRole("status")).toHaveTextContent("was added and selected");
    expect(mocks.createDepartment).toHaveBeenCalledWith({ institutionId: institution.id, name: department.name });

    fireEvent.click(screen.getByRole("button", { name: "Course not listed? Add it" }));
    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: course.code } });
    fireEvent.change(screen.getByLabelText("Course title"), { target: { value: course.title } });
    fireEvent.click(screen.getByRole("button", { name: "Add course" }));
    expect(await screen.findByRole("status")).toHaveTextContent(`Course ${course.code} was added and selected`);
    expect(mocks.createCourse).toHaveBeenCalledWith({ departmentId: department.id, code: course.code, title: course.title });
  });

  it("shows the authenticated user's submissions and offers authorized review actions", async () => {
    mocks.listResources.mockResolvedValueOnce([resource]);
    renderPastQuestions("/app/past-questions/my-resources");
    expect(await screen.findByText(/1 resource submitted by you/)).toBeVisible();
    expect(mocks.listResources).toHaveBeenCalledWith({ uploadedBy: "user-1" });

    mocks.listResources.mockResolvedValueOnce([{ ...resource, status: "pending" }]);
    renderPastQuestions("/app/past-questions/manage");
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.reviewResource).toHaveBeenCalledWith(resource.id, "approved", ""));
  });

  it("lets catalog managers add real departments and courses", async () => {
    mocks.permissions.mockReturnValue(["past_questions.manage"]);
    renderPastQuestions("/app/past-questions/catalog");

    await screen.findByRole("option", { name: institution.name });
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: institution.id } });
    fireEvent.click(await screen.findByRole("button", { name: "Manage courses" }));

    fireEvent.change(screen.getByLabelText("Department name"), { target: { value: "Computer Science" } });
    fireEvent.click(screen.getByRole("button", { name: "Add department" }));
    await screen.findByRole("status");
    expect(mocks.createDepartment).toHaveBeenCalledWith({ institutionId: institution.id, name: "Computer Science" });

    fireEvent.change(screen.getByLabelText("Course code"), { target: { value: "CSC 101" } });
    fireEvent.change(screen.getByLabelText("Course title"), { target: { value: "Introduction to Computing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add course" }));
    await waitFor(() => expect(mocks.createCourse).toHaveBeenCalledWith({ departmentId: department.id, code: "CSC 101", title: "Introduction to Computing" }));
  });

  it("refreshes the shared catalog so student-added entries appear for catalog managers", async () => {
    mocks.permissions.mockReturnValue(["past_questions.manage"]);
    renderPastQuestions("/app/past-questions/catalog");

    await screen.findByRole("option", { name: institution.name });
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: institution.id } });
    fireEvent.click(await screen.findByRole("button", { name: "Manage courses" }));
    expect(await screen.findByText("Introduction to Computing")).toBeVisible();
    const previousCalls = mocks.listCourses.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Refresh catalog" }));

    await waitFor(() => expect(mocks.listCourses).toHaveBeenCalledTimes(previousCalls + 1));
  });

  it("does not expose catalog editing to users without the manage permission", async () => {
    renderPastQuestions("/app/past-questions/catalog");

    expect(await screen.findByRole("heading", { name: "Catalog management access required" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add department" })).not.toBeInTheDocument();
  });

  it("previews a multi-institution CSV and imports only mapped institution rows", async () => {
    mocks.permissions.mockReturnValue(["past_questions.manage"]);
    mocks.listInstitutions.mockResolvedValue([institution, secondInstitution]);
    renderPastQuestions("/app/past-questions/catalog");

    const file = new File([
      "institution,department,course_code,course_title\nTest University,Computer Science,CSC 101,Introduction to Computing\nAnother College,Business,BUS 101,Introduction to Business",
    ], "catalog.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve("institution,department,course_code,course_title\nTest University,Computer Science,CSC 101,Introduction to Computing\nAnother College,Business,BUS 101,Introduction to Business"),
    });
    fireEvent.change(await screen.findByLabelText("CSV file"), { target: { files: [file] } });

    expect(await screen.findByText("2 course rows read · 2 ready to import")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import 2 course rows" }));
    await screen.findByRole("status");
    expect(mocks.importCatalogRows).toHaveBeenCalledWith([
      { rowNumber: 2, institutionId: institution.id, department: "Computer Science", courseCode: "CSC 101", courseTitle: "Introduction to Computing" },
      { rowNumber: 3, institutionId: secondInstitution.id, department: "Business", courseCode: "BUS 101", courseTitle: "Introduction to Business" },
    ]);
  });
});
