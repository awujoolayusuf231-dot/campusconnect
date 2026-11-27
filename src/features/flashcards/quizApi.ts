import { supabase } from "@/lib/supabase";

export type LearningQuizQuestionType = "multiple_choice" | "true_false" | "short_answer";
export type LearningQuizOption = { id: string; question_id: string; position: number; option_text: string };
export type LearningQuizQuestion = {
  id: string;
  quiz_id: string;
  position: number;
  question_type: LearningQuizQuestionType;
  prompt: string;
  explanation: string;
  options: LearningQuizOption[];
  answer_option_id?: string | null;
  answer_text?: string | null;
};
export type LearningQuiz = {
  id: string;
  owner_id: string;
  course_id: string | null;
  title: string;
  description: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  course: { code: string; title: string } | null;
};
export type LearningQuizQuestionInput = {
  type: LearningQuizQuestionType;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};
export type SaveLearningQuizInput = {
  quizId?: string;
  courseId: string | null;
  title: string;
  description: string;
  questions: LearningQuizQuestionInput[];
  publish: boolean;
};
export type LearningQuizAnswerInput = {
  questionId: string;
  selectedOptionId?: string | null;
  answerText?: string | null;
};
export type LearningQuizAttemptAnswer = {
  position: number;
  question_type: LearningQuizQuestionType;
  prompt: string;
  submitted_answer: string | null;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
};
export type LearningQuizAttempt = {
  id: string;
  quiz_id: string;
  user_id: string;
  submitted_at: string;
  correct_count: number;
  total_questions: number;
  score_percent: number;
  quiz: { title: string } | null;
  answers: LearningQuizAttemptAnswer[];
};

type Relation<T> = T | T[] | null;
type QuizRow = Omit<LearningQuiz, "course"> & { course: Relation<{ code: string; title: string }> };
type QuizQuestionRow = Pick<LearningQuizQuestion, "id" | "quiz_id" | "position" | "question_type" | "prompt"> & {
  options: LearningQuizOption[] | null;
};
type QuizAttemptRow = Omit<LearningQuizAttempt, "quiz" | "answers" | "score_percent"> & {
  score_percent: number | string;
  quiz: Relation<{ title: string }>;
  answers: LearningQuizAttemptAnswer[] | null;
};
const QUIZ_SELECT = `
  id,owner_id,course_id,title,description,status,published_at,created_at,updated_at,
  course:academic_courses!learning_quizzes_course_id_fkey(code,title)
`;
const QUIZ_ATTEMPT_SELECT = `
  id,quiz_id,user_id,submitted_at,correct_count,total_questions,score_percent,
  quiz:learning_quizzes!learning_quiz_attempts_quiz_id_fkey(title),
  answers:learning_quiz_attempt_answers!learning_quiz_attempt_answers_attempt_id_fkey(
    position,question_type,prompt,submitted_answer,correct_answer,is_correct,explanation
  )
`;

function first<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeQuiz(row: QuizRow): LearningQuiz {
  return { ...row, course: first(row.course) };
}

function normalizeAttempt(row: QuizAttemptRow): LearningQuizAttempt {
  return {
    ...row,
    score_percent: Number(row.score_percent),
    quiz: first(row.quiz),
    answers: [...(row.answers ?? [])].sort((a, b) => a.position - b.position),
  };
}

export function validateLearningQuiz(input: SaveLearningQuizInput): string | null {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) return "Quiz title must be between 3 and 120 characters.";
  if (input.description.length > 1000) return "Description must be 1,000 characters or fewer.";
  if (!input.questions.length || input.questions.length > 100) return "Add between 1 and 100 questions.";
  for (const [index, question] of input.questions.entries()) {
    if (!question.prompt.trim() || question.prompt.trim().length > 1500) return `Question ${index + 1} needs a prompt of at most 1,500 characters.`;
    if (question.explanation.length > 1000) return `Question ${index + 1} explanation must be 1,000 characters or fewer.`;
    if (question.type === "short_answer") {
      if (!question.answer.trim() || question.answer.trim().length > 300) return `Question ${index + 1} needs an answer of at most 300 characters.`;
      continue;
    }
    const options = question.options.map((option) => option.trim());
    if (options.length < 2 || options.length > 6 || options.some((option) => !option || option.length > 300)) {
      return `Question ${index + 1} needs between 2 and 6 complete options.`;
    }
    if (new Set(options).size !== options.length) return `Question ${index + 1} has duplicate options.`;
    if (question.type === "true_false" && (options.length !== 2 || options[0] !== "True" || options[1] !== "False")) {
      return `Question ${index + 1} must use True and False options.`;
    }
    if (!options.includes(question.answer.trim())) return `Choose a correct answer for question ${index + 1}.`;
  }
  return null;
}

export async function listLearningQuizzes(options: { mine?: boolean } = {}): Promise<LearningQuiz[]> {
  let query = supabase.from("learning_quizzes").select(QUIZ_SELECT).order("updated_at", { ascending: false }).limit(100);
  if (options.mine) {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) return [];
    query = query.eq("owner_id", data.user.id);
  } else {
    query = query.eq("status", "published");
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as QuizRow[]).map(normalizeQuiz);
}

export async function getLearningQuiz(id: string): Promise<LearningQuiz | null> {
  const { data, error } = await supabase.from("learning_quizzes").select(QUIZ_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeQuiz(data as unknown as QuizRow) : null;
}

export async function listLearningQuizQuestions(quizId: string, includeAnswers = false): Promise<LearningQuizQuestion[]> {
  if (includeAnswers) {
    const { data, error } = await supabase.rpc("get_learning_quiz_questions_for_owner", { p_quiz_id: quizId });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Quiz questions could not be loaded.");
    return data as unknown as LearningQuizQuestion[];
  }

  const { data, error } = await supabase
    .from("learning_quiz_questions")
    .select("id,quiz_id,position,question_type,prompt,options:learning_quiz_options!learning_quiz_options_question_id_fkey(id,question_id,position,option_text)")
    .eq("quiz_id", quizId)
    .order("position");
  if (error) throw error;
  const questions = ((data ?? []) as unknown as QuizQuestionRow[]).map((question) => ({
    ...question,
    explanation: "",
    options: [...(question.options ?? [])].sort((a, b) => a.position - b.position),
  }));
  return questions;
}

export async function saveLearningQuiz(input: SaveLearningQuizInput): Promise<string> {
  const validationError = validateLearningQuiz(input);
  if (validationError) throw new Error(validationError);
  const questions = input.questions.map((question) => {
    const options = question.options.map((option) => option.trim());
    if (question.type === "short_answer") {
      return {
        type: question.type,
        prompt: question.prompt.trim(),
        explanation: question.explanation.trim(),
        answer: question.answer.trim(),
        options: [],
      };
    }
    return {
      type: question.type,
      prompt: question.prompt.trim(),
      explanation: question.explanation.trim(),
      options,
      correct_index: options.indexOf(question.answer.trim()),
    };
  });
  const { data, error } = await supabase.rpc("save_learning_quiz", {
    p_quiz_id: input.quizId ?? null,
    p_course_id: input.courseId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_questions: questions,
    p_publish: input.publish,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The quiz could not be saved.");
  return data;
}

export async function submitLearningQuiz(input: {
  quizId: string;
  answers: LearningQuizAnswerInput[];
}): Promise<string> {
  if (!input.quizId || !input.answers.length) throw new Error("A quiz and its answers are required.");
  const { data, error } = await supabase.rpc("submit_learning_quiz", {
    p_quiz_id: input.quizId,
    p_answers: input.answers.map((answer) => ({
      question_id: answer.questionId,
      selected_option_id: answer.selectedOptionId ?? null,
      answer_text: answer.answerText ?? null,
    })),
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Your quiz submission could not be saved.");
  return data;
}

export async function getLearningQuizAttempt(attemptId: string): Promise<LearningQuizAttempt | null> {
  const { data, error } = await supabase
    .from("learning_quiz_attempts")
    .select(QUIZ_ATTEMPT_SELECT)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeAttempt(data as unknown as QuizAttemptRow) : null;
}

export async function listLearningQuizAttempts(quizId?: string): Promise<LearningQuizAttempt[]> {
  let query = supabase
    .from("learning_quiz_attempts")
    .select(QUIZ_ATTEMPT_SELECT)
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (quizId) query = query.eq("quiz_id", quizId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as QuizAttemptRow[]).map(normalizeAttempt);
}
