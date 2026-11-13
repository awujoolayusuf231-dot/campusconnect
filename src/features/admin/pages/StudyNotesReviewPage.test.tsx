import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyNotesReviewPage } from "./StudyNotesReviewPage";

const mocks = vi.hoisted(() => ({
  listStudyNotes: vi.fn(),
  reviewStudyNote: vi.fn(),
  createStudyNoteDownloadUrl: vi.fn(),
}));

vi.mock("@/features/study-notes/api", () => mocks);
vi.mock("@/features/admin/useMyPermissions", () => ({
  useMyPermissions: () => ({ data: ["study_notes.review"], isLoading: false, isError: false }),
}));

const note = {
  id: "note-1",
  title: "Computing study guide",
  description: "A clear introduction to computing concepts and revision topics.",
  course_id: "course-1",
  level: "100",
  semester: "first",
  status: "pending",
  created_at: "2026-11-12T10:00:00.000Z",
  uploaded_by: "user-2",
  reviewed_by: null,
  rejection_reason: null,
  object_path: "user-2/00000000-0000-0000-0000-000000000001.pdf",
  course: { id: "course-1", code: "CSC 101", title: "Introduction to Computing" },
};

function renderReview() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><StudyNotesReviewPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Study Notes review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listStudyNotes.mockResolvedValue([note]);
    mocks.reviewStudyNote.mockResolvedValue(undefined);
    mocks.createStudyNoteDownloadUrl.mockResolvedValue("https://example.test/secure.pdf");
  });

  it("approves selected pending notes through the review API", async () => {
    renderReview();
    fireEvent.click(await screen.findByRole("button", { name: /Computing study guide/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));

    await waitFor(() => expect(mocks.reviewStudyNote).toHaveBeenCalledWith(note.id, "approved", undefined));
  });

  it("requires reviewer feedback before rejecting a note", async () => {
    renderReview();
    fireEvent.click(await screen.findByRole("button", { name: /Computing study guide/ }));
    const reject = screen.getByRole("button", { name: "Reject submission" });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection feedback (required to reject)"), { target: { value: "Please add clearer course references." } });
    expect(reject).toBeEnabled();
    fireEvent.click(reject);

    await waitFor(() => expect(mocks.reviewStudyNote).toHaveBeenCalledWith(note.id, "rejected", "Please add clearer course references."));
  });
});
