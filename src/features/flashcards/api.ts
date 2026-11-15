import { supabase } from "@/lib/supabase";

export const MAX_FLASHCARDS_PER_COLLECTION = 200;
export const MAX_FLASHCARD_PROMPT_LENGTH = 2000;
export const MAX_FLASHCARD_ANSWER_LENGTH = 4000;

export type FlashcardStatus = "known" | "needs_practice" | "review_again";
export type Flashcard = {
  id: string;
  collection_id: string;
  prompt: string;
  answer: string;
  position: number;
  created_at: string;
};
export type FlashcardProgress = {
  flashcard_id: string;
  status: FlashcardStatus;
  review_count: number;
  updated_at: string;
};
export type FlashcardCollection = {
  id: string;
  owner_id: string;
  course_id: string | null;
  title: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  course: { code: string; title: string } | null;
  cards: Flashcard[];
};
export type FlashcardDraft = { id?: string; prompt: string; answer: string };
export type SaveFlashcardCollectionInput = {
  collectionId?: string;
  courseId: string | null;
  title: string;
  description: string;
  isPublic: boolean;
  cards: FlashcardDraft[];
};

type Relation<T> = T | T[] | null;
type CollectionRow = Omit<FlashcardCollection, "course" | "cards"> & {
  course: Relation<{ code: string; title: string }>;
  cards: Flashcard[] | null;
};
const COLLECTION_SELECT = `
  id,owner_id,course_id,title,description,is_public,created_at,updated_at,
  course:academic_courses!flashcard_collections_course_id_fkey(code,title),
  cards:flashcards!flashcards_collection_id_fkey(id,collection_id,prompt,answer,position,created_at)
`;

function firstRelation<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function normalizeCollection(row: CollectionRow): FlashcardCollection {
  return {
    ...row,
    course: firstRelation(row.course),
    cards: [...(row.cards ?? [])].sort((a, b) => a.position - b.position),
  };
}

export function validateFlashcardCollection(input: SaveFlashcardCollectionInput): string | null {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) return "Collection title must be between 3 and 120 characters.";
  if (input.description.length > 1000) return "Description must be 1,000 characters or fewer.";
  if (input.cards.length < 1 || input.cards.length > MAX_FLASHCARDS_PER_COLLECTION) {
    return `Add between 1 and ${MAX_FLASHCARDS_PER_COLLECTION} cards.`;
  }
  for (const [index, card] of input.cards.entries()) {
    if (card.prompt.trim().length < 1 || card.prompt.trim().length > MAX_FLASHCARD_PROMPT_LENGTH) {
      return `Card ${index + 1} needs a prompt of at most ${MAX_FLASHCARD_PROMPT_LENGTH} characters.`;
    }
    if (card.answer.trim().length < 1 || card.answer.trim().length > MAX_FLASHCARD_ANSWER_LENGTH) {
      return `Card ${index + 1} needs an answer of at most ${MAX_FLASHCARD_ANSWER_LENGTH} characters.`;
    }
  }
  return null;
}

export async function listFlashcardCollections(options: { mine?: boolean; search?: string } = {}): Promise<FlashcardCollection[]> {
  let query = supabase
    .from("flashcard_collections")
    .select(COLLECTION_SELECT)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (options.mine) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return [];
    query = query.eq("owner_id", userData.user.id);
  } else {
    query = query.eq("is_public", true);
  }
  const { data, error } = await query;
  if (error) throw error;
  const collections = ((data ?? []) as unknown as CollectionRow[]).map(normalizeCollection);
  const term = options.search?.trim().toLocaleLowerCase();
  return term
    ? collections.filter((collection) => `${collection.title} ${collection.description} ${collection.course?.code ?? ""} ${collection.course?.title ?? ""}`.toLocaleLowerCase().includes(term))
    : collections;
}

export async function getFlashcardCollection(id: string): Promise<FlashcardCollection | null> {
  const { data, error } = await supabase
    .from("flashcard_collections")
    .select(COLLECTION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeCollection(data as unknown as CollectionRow) : null;
}

export async function saveFlashcardCollection(input: SaveFlashcardCollectionInput): Promise<string> {
  const validationError = validateFlashcardCollection(input);
  if (validationError) throw new Error(validationError);
  const { data, error } = await supabase.rpc("save_flashcard_collection", {
    p_collection_id: input.collectionId ?? null,
    p_course_id: input.courseId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_is_public: input.isPublic,
    p_cards: input.cards.map((card) => ({
      ...(card.id ? { id: card.id } : {}),
      prompt: card.prompt.trim(),
      answer: card.answer.trim(),
    })),
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The flashcard collection could not be saved.");
  return data;
}

export async function deleteFlashcardCollection(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("flashcard_collections")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("flashcard_collection_not_found");
}

export async function listFlashcardProgress(flashcardIds: string[]): Promise<Record<string, FlashcardProgress>> {
  if (!flashcardIds.length) return {};
  const { data, error } = await supabase
    .from("flashcard_progress")
    .select("flashcard_id,status,review_count,updated_at")
    .in("flashcard_id", flashcardIds);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as FlashcardProgress[]).map((progress) => [progress.flashcard_id, progress]));
}

export async function recordFlashcardReview(flashcardId: string, status: FlashcardStatus): Promise<void> {
  const { error } = await supabase.rpc("record_flashcard_review", {
    p_flashcard_id: flashcardId,
    p_status: status,
  });
  if (error) throw error;
}
