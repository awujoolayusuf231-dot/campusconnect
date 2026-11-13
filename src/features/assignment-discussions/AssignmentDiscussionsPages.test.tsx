import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentDiscussionRoomPage, AssignmentDiscussionsPage } from "./AssignmentDiscussionsPages";

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listInstitutions: vi.fn(),
  listDepartments: vi.fn(),
  getCourse: vi.fn(),
  listAssignmentDiscussions: vi.fn(),
  createAssignmentDiscussion: vi.fn(),
  createAssignmentDiscussionReply: vi.fn(),
  updateAssignmentDiscussion: vi.fn(),
  updateAssignmentDiscussionReply: vi.fn(),
  deleteAssignmentDiscussion: vi.fn(),
  deleteAssignmentDiscussionReply: vi.fn(),
  deleteAssignmentDiscussionAttachment: vi.fn(),
  createDiscussionAttachmentUrl: vi.fn(),
  validateDiscussionAttachment: vi.fn(),
}));

vi.mock("@/features/past-questions/api", () => mocks);
vi.mock("./api", () => ({
  ...mocks,
  ASSIGNMENT_DISCUSSIONS_PAGE_SIZE: 30,
  MAX_ASSIGNMENT_DISCUSSION_ATTACHMENT_BYTES: 10 * 1024 * 1024,
}));
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
const discussion = {
  id: "discussion-1",
  course_id: course.id,
  author_id: "user-1",
  category: "question" as const,
  title: "Help with the assignment",
  body: "I would appreciate help understanding the first requirement.",
  created_at: "2026-11-13T10:00:00.000Z",
  updated_at: "2026-11-13T10:00:00.000Z",
  author: { username: "student", display_name: "Test Student", avatar_path: null },
  attachments: [],
  replies: [{
    id: "reply-1",
    discussion_id: "discussion-1",
    author_id: "user-2",
    body: "Start by splitting the task into smaller steps.",
    created_at: "2026-11-13T10:05:00.000Z",
    updated_at: "2026-11-13T10:05:00.000Z",
    author: { username: "helper", display_name: "Helpful Student", avatar_path: null },
    attachments: [],
  }],
};

function renderDiscussions(path = "/app/assignment-discussions") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/assignment-discussions" element={<AssignmentDiscussionsPage />} />
          <Route path="/app/assignment-discussions/courses/:courseId" element={<AssignmentDiscussionRoomPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Assignment Discussion Rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCourses.mockResolvedValue([course]);
    mocks.listInstitutions.mockResolvedValue([institution]);
    mocks.listDepartments.mockResolvedValue([department]);
    mocks.getCourse.mockResolvedValue(course);
    mocks.listAssignmentDiscussions.mockResolvedValue([]);
    mocks.createAssignmentDiscussion.mockResolvedValue("discussion-new");
    mocks.createAssignmentDiscussionReply.mockResolvedValue("reply-new");
    mocks.updateAssignmentDiscussion.mockResolvedValue(undefined);
    mocks.updateAssignmentDiscussionReply.mockResolvedValue(undefined);
    mocks.deleteAssignmentDiscussion.mockResolvedValue(undefined);
    mocks.deleteAssignmentDiscussionReply.mockResolvedValue(undefined);
    mocks.deleteAssignmentDiscussionAttachment.mockResolvedValue(undefined);
    mocks.createDiscussionAttachmentUrl.mockResolvedValue("https://example.test/attachment.pdf");
    mocks.validateDiscussionAttachment.mockReturnValue(null);
  });

  it("browses real catalog courses and loads persisted discussions for a course", async () => {
    renderDiscussions();

    expect(await screen.findByRole("heading", { name: "Assignment Discussion Rooms" })).toBeVisible();
    expect(await screen.findByRole("link", { name: /CSC 101/ })).toHaveAttribute("href", "/app/assignment-discussions/courses/course-1");
    expect(mocks.listCourses).toHaveBeenCalled();

    mocks.listAssignmentDiscussions.mockResolvedValue([discussion]);
    renderDiscussions("/app/assignment-discussions/courses/course-1");
    expect(await screen.findByText(discussion.title)).toBeVisible();
    expect(await screen.findByText("Start by splitting the task into smaller steps.")).toBeVisible();
    expect(mocks.listAssignmentDiscussions).toHaveBeenCalledWith(course.id);
  });

  it("filters courses by the selected institution and search term", async () => {
    const otherCourse = { ...course, id: "course-2", code: "MTH 101", title: "Algebra" };
    mocks.listCourses.mockResolvedValue([course, otherCourse]);
    renderDiscussions();

    await screen.findByRole("link", { name: /CSC 101/ });
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: institution.id } });
    fireEvent.change(screen.getByLabelText("Search courses"), { target: { value: "CSC" } });

    expect(await screen.findByRole("link", { name: /CSC 101/ })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("link", { name: /MTH 101/ })).not.toBeInTheDocument());
  });

  it("creates a persisted course discussion", async () => {
    renderDiscussions("/app/assignment-discussions/courses/course-1");

    expect(await screen.findByRole("heading", { name: "CSC 101 · Introduction to Computing" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Start a discussion/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Help with the assignment" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "I would appreciate help understanding the first requirement." } });
    fireEvent.click(screen.getByRole("button", { name: "Post discussion" }));

    await waitFor(() => expect(mocks.createAssignmentDiscussion).toHaveBeenCalledWith({
      courseId: course.id,
      category: "question",
      title: "Help with the assignment",
      body: "I would appreciate help understanding the first requirement.",
      file: null,
    }));
  });

  it("creates a reply to a persisted discussion", async () => {
    mocks.listAssignmentDiscussions.mockResolvedValue([discussion]);
    renderDiscussions("/app/assignment-discussions/courses/course-1");

    expect(await screen.findByText(discussion.title)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Break the requirements into smaller steps." } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => expect(mocks.createAssignmentDiscussionReply).toHaveBeenCalledWith({
      discussionId: discussion.id,
      body: "Break the requirements into smaller steps.",
      file: null,
    }));
  });

  it("shows a clear empty state when the course catalog has no entries", async () => {
    mocks.listCourses.mockResolvedValue([]);
    renderDiscussions();

    expect(await screen.findByRole("heading", { name: "No courses found" })).toBeVisible();
  });
});
