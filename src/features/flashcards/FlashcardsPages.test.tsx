import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  deleteFlashcardCollection: vi.fn(),
  getFlashcardCollection: vi.fn(),
  listFlashcardCollections: vi.fn(),
  listFlashcardProgress: vi.fn(),
  recordFlashcardReview: vi.fn(),
  saveFlashcardCollection: vi.fn(),
}));
vi.mock("@/features/past-questions/api", () => ({ listCourses: mocks.listCourses }));
vi.mock("./api", () => ({
  deleteFlashcardCollection: mocks.deleteFlashcardCollection,
  getFlashcardCollection: mocks.getFlashcardCollection,
  listFlashcardCollections: mocks.listFlashcardCollections,
  listFlashcardProgress: mocks.listFlashcardProgress,
  recordFlashcardReview: mocks.recordFlashcardReview,
  saveFlashcardCollection: mocks.saveFlashcardCollection,
  validateFlashcardCollection: (input: { title: string; description: string; cards: { prompt: string; answer: string }[] }) => {
    if (input.title.trim().length < 3) return "Collection title must be between 3 and 120 characters.";
    if (!input.cards.length || input.cards.some((card) => !card.prompt.trim() || !card.answer.trim())) return "Complete each card before saving.";
    return null;
  },
}));

import {
  AdvancedLearningDetailPage,
  AdvancedLearningPage,
  CreateFlashcardsPage,
  CreateQuizPage,
  FlashcardCollectionPage,
  FlashcardLibraryPage,
  FlashcardsHomePage,
  FlashcardsLayout,
  MyFlashcardsPage,
  MyQuizzesPage,
  PerformancePage,
  QuizLibraryPage,
  QuizResultsPage,
  SavedQuestionsPage,
} from "./FlashcardsPages";

function renderFeature(path = "/app/flashcards") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/flashcards" element={<FlashcardsLayout />}>
            <Route index element={<FlashcardsHomePage />} />
            <Route path="library" element={<FlashcardLibraryPage />} />
            <Route path="mine" element={<MyFlashcardsPage />} />
            <Route path="create" element={<CreateFlashcardsPage />} />
            <Route path="collections/:collectionId" element={<FlashcardCollectionPage />} />
            <Route path="quizzes" element={<QuizLibraryPage />} />
            <Route path="my-quizzes" element={<MyQuizzesPage />} />
            <Route path="create-quiz" element={<CreateQuizPage />} />
            <Route path="results" element={<QuizResultsPage />} />
            <Route path="saved" element={<SavedQuestionsPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="advanced" element={<AdvancedLearningPage />} />
            <Route path="advanced/:featureId" element={<AdvancedLearningDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Flashcards and quizzes pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCourses.mockResolvedValue([]);
    mocks.listFlashcardCollections.mockResolvedValue([]);
    mocks.getFlashcardCollection.mockResolvedValue(null);
    mocks.listFlashcardProgress.mockResolvedValue({});
    mocks.saveFlashcardCollection.mockResolvedValue("collection-1");
    mocks.deleteFlashcardCollection.mockResolvedValue(undefined);
    mocks.recordFlashcardReview.mockResolvedValue(undefined);
  });

  it("explains that flashcards are live while quizzes remain previews", () => {
    renderFeature();

    expect(screen.getByRole("heading", { name: "Flashcards & Quizzes" })).toBeVisible();
    expect(screen.getByText(/Flashcard collections are live/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Create flashcards/i })).toHaveAttribute("href", "/app/flashcards/create");
  });

  it("saves a collection through the backend and supports local preview", async () => {
    renderFeature("/app/flashcards/create");

    fireEvent.change(screen.getByLabelText("Collection title"), { target: { value: "Revision terms" } });
    fireEvent.change(screen.getByLabelText("Question or term"), { target: { value: "What is photosynthesis?" } });
    fireEvent.change(screen.getByLabelText("Answer or explanation"), { target: { value: "The process plants use to make food." } });
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));

    expect(screen.getByRole("heading", { name: "Card 2" })).toBeVisible();
    const prompts = screen.getAllByLabelText("Question or term");
    const answers = screen.getAllByLabelText("Answer or explanation");
    fireEvent.change(prompts[1]!, { target: { value: "What do plants need?" } });
    fireEvent.change(answers[1]!, { target: { value: "Light, water and carbon dioxide." } });
    fireEvent.click(await screen.findByRole("button", { name: "Preview study mode" }));
    expect(screen.getByRole("region", { name: "Flashcard study preview" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(within(screen.getByRole("region", { name: "Flashcard study preview" })).getByText("The process plants use to make food.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save collection" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save collection" }));
    expect(await screen.findByText("Flashcards & Quizzes")).toBeVisible();
    expect(mocks.saveFlashcardCollection).toHaveBeenCalledWith(expect.objectContaining({
      title: "Revision terms",
      cards: [{ id: undefined, prompt: "What is photosynthesis?", answer: "The process plants use to make food." }, { id: undefined, prompt: "What do plants need?", answer: "Light, water and carbon dioxide." }],
    }));
  });

  it("previews quiz drafts without submitting or grading answers", async () => {
    renderFeature("/app/flashcards/create-quiz");

    fireEvent.change(screen.getByLabelText("Quiz title"), { target: { value: "Biology revision" } });
    fireEvent.change(screen.getByLabelText("Question text"), { target: { value: "Which process makes glucose in plants?" } });
    fireEvent.change(screen.getByLabelText("Option A"), { target: { value: "Photosynthesis" } });
    fireEvent.change(screen.getByLabelText("Option B"), { target: { value: "Respiration" } });
    fireEvent.click(await screen.findByRole("button", { name: "Preview quiz" }));

    expect(screen.getByRole("region", { name: "Quiz preview" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Finish preview" }));
    expect(screen.getByRole("status")).toHaveTextContent("Answers were not submitted, graded or saved.");
    expect(screen.getByRole("button", { name: "Save quiz" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish quiz" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Group Quiz" })).toHaveAttribute("href", "/app/group-quiz");
  });

  it("marks future learning tools as coming soon and links Group Quiz to its live page", () => {
    renderFeature("/app/flashcards/advanced");

    expect(screen.getAllByText("Coming soon")).toHaveLength(7);
    expect(screen.getByRole("link", { name: /Open Group Quiz/i })).toHaveAttribute("href", "/app/group-quiz");
    expect(screen.getByRole("link", { name: /AI-generated flashcards/i })).toHaveAttribute("href", "/app/flashcards/advanced/ai-flashcards");
  });

  it("shows a clear coming-soon detail without enabling unsupported actions", () => {
    renderFeature("/app/flashcards/advanced/competitions");

    expect(screen.getByRole("heading", { name: "Quiz competitions" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Not available yet" })).toBeDisabled();
  });

  it("provides honest empty states for unsupported libraries and results", () => {
    renderFeature("/app/flashcards/results");

    expect(screen.getByRole("heading", { name: "Quiz results" })).toBeVisible();
    expect(screen.getByText(/There are no quiz, attempt, answer-key, or saved-question APIs/i)).toBeVisible();
  });

  it("loads real public collection cards in the library", async () => {
    mocks.listFlashcardCollections.mockResolvedValue([{
      id: "collection-7",
      owner_id: "student-2",
      course_id: null,
      title: "Cell biology",
      description: "Core concepts",
      is_public: true,
      created_at: "2026-11-13T00:00:00Z",
      updated_at: "2026-11-13T00:00:00Z",
      course: null,
      cards: [{ id: "card-1", collection_id: "collection-7", prompt: "Cell?", answer: "Basic unit", position: 1, created_at: "2026-11-13T00:00:00Z" }],
    }]);
    renderFeature("/app/flashcards/library");

    expect(await screen.findByRole("link", { name: /Cell biology/ })).toHaveAttribute("href", "/app/flashcards/collections/collection-7");
  });

  it("records study progress for the active card", async () => {
    mocks.getFlashcardCollection.mockResolvedValue({
      id: "collection-7",
      owner_id: "student-1",
      course_id: null,
      title: "Cell biology",
      description: "",
      is_public: false,
      created_at: "2026-11-13T00:00:00Z",
      updated_at: "2026-11-13T00:00:00Z",
      course: null,
      cards: [
        { id: "card-1", collection_id: "collection-7", prompt: "Cell?", answer: "Basic unit", position: 1, created_at: "2026-11-13T00:00:00Z" },
        { id: "card-2", collection_id: "collection-7", prompt: "Nucleus?", answer: "Contains genetic material", position: 2, created_at: "2026-11-13T00:00:00Z" },
      ],
    });
    renderFeature("/app/flashcards/collections/collection-7");
    fireEvent.click(await screen.findByRole("button", { name: "Study collection" }));
    fireEvent.click(await screen.findByRole("button", { name: "I know this" }));

    await waitFor(() => expect(mocks.recordFlashcardReview).toHaveBeenCalledWith("card-1", "known"));
    expect(await screen.findByText("Nucleus?")).toBeVisible();
  });
});
