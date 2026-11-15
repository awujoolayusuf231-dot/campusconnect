import { supabase } from "@/lib/supabase";

export type QuizGroup = {
  id: string;
  name: string;
  description: string;
  institution_id: string;
  department_id: string | null;
  course_id: string | null;
  visibility: "discoverable" | "invite_only";
  join_policy: "open" | "approval" | "invite_only";
  created_by: string;
  created_at: string;
  my_status?: QuizGroupMember["status"];
  my_role?: QuizGroupMember["role"];
};

export type QuizGroupMember = {
  group_id: string;
  user_id: string;
  role: "owner" | "moderator" | "member";
  status: "active" | "pending" | "invited" | "banned";
  invited_by: string | null;
  created_at: string;
  profile?: { username: string; display_name: string } | null;
};

export type GroupQuiz = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  starts_at: string;
  closes_at: string | null;
  duration_minutes: number;
  answer_release: "immediately" | "after_close" | "at_time";
  answer_release_at: string | null;
  created_at: string;
};

export type QuizOption = { id: string; question_id: string; position: number; option_text: string };
export type QuizQuestion = { id: string; quiz_id: string; position: number; prompt: string; explanation: string; options: QuizOption[] };
export type QuizAnswerDraft = { question_id: string; selected_option_id: string | null };
export type QuizResultRow = {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  user_id: string;
  submitted_at: string;
  score: number;
  percentage: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  question_id: string;
  position: number;
  prompt: string;
  explanation: string;
  selected_option_id: string | null;
  correct_option_id: string | null;
  is_correct: boolean | null;
};

export type QuizAttempt = {
  id: string;
  quiz_id: string;
  user_id: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  percentage: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  unanswered_count: number | null;
  participant: { username: string; display_name: string } | null;
};

export type QuizPerformanceMember = {
  attempt_id: string | null;
  user_id: string;
  username: string;
  display_name: string;
  membership_role: QuizGroupMember["role"];
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  percentage: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  unanswered_count: number | null;
};

export type CreateQuizGroupInput = {
  name: string;
  description: string;
  institutionId: string;
  departmentId: string | null;
  courseId: string | null;
  visibility: QuizGroup["visibility"];
  joinPolicy: QuizGroup["join_policy"];
};

export type QuizQuestionDraft = {
  prompt: string;
  explanation: string;
  options: string[];
  correctIndex: number;
};

export type SaveGroupQuizInput = {
  quizId?: string;
  groupId: string;
  title: string;
  description: string;
  startsAt: string;
  closesAt: string | null;
  durationMinutes: number;
  answerRelease: GroupQuiz["answer_release"];
  answerReleaseAt: string | null;
  questions: QuizQuestionDraft[];
  publish: boolean;
};

const GROUP_SELECT = "id,name,description,institution_id,department_id,course_id,visibility,join_policy,created_by,created_at";
const QUIZ_SELECT = "id,group_id,created_by,title,description,status,starts_at,closes_at,duration_minutes,answer_release,answer_release_at,created_at";

export function validateQuizGroup(input: CreateQuizGroupInput): string | null {
  if (input.name.trim().length < 3 || input.name.trim().length > 100) return "Group name must be between 3 and 100 characters.";
  if (input.description.length > 1000) return "Description must be 1,000 characters or fewer.";
  if (!input.institutionId) return "Choose an institution.";
  if (input.courseId && !input.departmentId) return "Choose a department before selecting a course.";
  return null;
}

export function validateGroupQuiz(input: SaveGroupQuizInput): string | null {
  if (input.title.trim().length < 3 || input.title.trim().length > 120) return "Quiz title must be between 3 and 120 characters.";
  if (input.description.length > 1000) return "Description must be 1,000 characters or fewer.";
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 240) return "Duration must be a whole number between 1 and 240 minutes.";
  if (input.questions.length < 1 || input.questions.length > 100) return "Add between 1 and 100 questions.";
  const start = new Date(input.startsAt).getTime();
  const close = input.closesAt ? new Date(input.closesAt).getTime() : null;
  const release = input.answerReleaseAt ? new Date(input.answerReleaseAt).getTime() : null;
  if (!Number.isFinite(start) || start <= Date.now()) return "Choose a start time in the future.";
  if (input.closesAt && (!Number.isFinite(close) || close! <= start)) return "The closing time must be after the start time.";
  if (input.answerRelease === "after_close" && !input.closesAt) return "Set a closing date to release answers after the quiz closes.";
  if (input.answerRelease === "at_time" && !input.answerReleaseAt) return "Choose when answers should become available.";
  if (input.answerRelease === "at_time" && (!Number.isFinite(release) || release! < start)) return "The answer release time must be at or after the start time.";
  for (const [index, question] of input.questions.entries()) {
    if (!question.prompt.trim() || question.prompt.trim().length > 2000) return `Question ${index + 1} needs a prompt of at most 2,000 characters.`;
    if (question.explanation.length > 2000) return `Question ${index + 1} explanation must be 2,000 characters or fewer.`;
    if (question.options.length < 2 || question.options.length > 6 || question.options.some((option) => !option.trim() || option.trim().length > 500)) {
      return `Question ${index + 1} needs 2 to 6 options, each no longer than 500 characters.`;
    }
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length) {
      return `Choose the correct answer for question ${index + 1}.`;
    }
  }
  return null;
}

export async function listQuizGroups(mine = false): Promise<QuizGroup[]> {
  if (mine) {
    const { data, error } = await supabase
      .from("quiz_group_members")
      .select(`status,role,group:quiz_groups!quiz_group_members_group_id_fkey(${GROUP_SELECT})`)
      .in("status", ["active", "pending", "invited"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as { status: QuizGroupMember["status"]; role: QuizGroupMember["role"]; group: QuizGroup | QuizGroup[] | null }[])
      .flatMap((row) => row.group
        ? (Array.isArray(row.group) ? row.group : [row.group]).map((group) => ({ ...group, my_status: row.status, my_role: row.role }))
        : []);
  }
  const { data, error } = await supabase
    .from("quiz_groups")
    .select(GROUP_SELECT)
    .eq("visibility", "discoverable")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as QuizGroup[];
}

export async function getQuizGroup(id: string): Promise<QuizGroup | null> {
  const { data, error } = await supabase.from("quiz_groups").select(GROUP_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as QuizGroup | null;
}

export async function listQuizGroupMembers(groupId: string): Promise<QuizGroupMember[]> {
  const { data, error } = await supabase
    .from("quiz_group_members")
    .select("group_id,user_id,role,status,invited_by,created_at,profile:profiles!quiz_group_members_user_id_fkey(username,display_name)")
    .eq("group_id", groupId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as QuizGroupMember[];
}

export async function searchQuizGroupStudents(institutionId: string, search: string): Promise<{ id: string; username: string; display_name: string }[]> {
  const term = search.trim().replace(/[%_]/g, "\\$&").slice(0, 40);
  if (!term) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name")
    .eq("institution_id", institutionId)
    .ilike("username", `%${term}%`)
    .order("username")
    .limit(20);
  if (error) throw error;
  return (data ?? []) as { id: string; username: string; display_name: string }[];
}

export async function createQuizGroup(input: CreateQuizGroupInput): Promise<string> {
  const validationError = validateQuizGroup(input);
  if (validationError) throw new Error(validationError);
  const { data, error } = await supabase.rpc("create_quiz_group", {
    p_name: input.name.trim(),
    p_description: input.description.trim(),
    p_institution_id: input.institutionId,
    p_department_id: input.departmentId,
    p_course_id: input.courseId,
    p_visibility: input.visibility,
    p_join_policy: input.joinPolicy,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The group could not be created.");
  return data;
}

export async function requestQuizGroupMembership(groupId: string): Promise<QuizGroupMember["status"]> {
  const { data, error } = await supabase.rpc("request_quiz_group_membership", { p_group_id: groupId });
  if (error) throw error;
  return data as QuizGroupMember["status"];
}

export async function manageQuizGroupMember(groupId: string, userId: string, action: "invite" | "approve" | "reject" | "remove" | "ban" | "unban" | "promote" | "demote"): Promise<void> {
  const { error } = await supabase.rpc("manage_quiz_group_member", { p_group_id: groupId, p_user_id: userId, p_action: action });
  if (error) throw error;
}

export async function respondQuizGroupInvite(groupId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_quiz_group_invite", { p_group_id: groupId, p_accept: accept });
  if (error) throw error;
}

export async function leaveQuizGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_quiz_group", { p_group_id: groupId });
  if (error) throw error;
}

export async function updateQuizGroup(groupId: string, input: Pick<CreateQuizGroupInput, "name" | "description" | "visibility" | "joinPolicy">): Promise<void> {
  if (input.name.trim().length < 3 || input.name.trim().length > 100) throw new Error("Group name must be between 3 and 100 characters.");
  if (input.description.length > 1000) throw new Error("Description must be 1,000 characters or fewer.");
  const { error } = await supabase.rpc("update_quiz_group", {
    p_group_id: groupId,
    p_name: input.name.trim(),
    p_description: input.description.trim(),
    p_visibility: input.visibility,
    p_join_policy: input.joinPolicy,
  });
  if (error) throw error;
}

export async function transferQuizGroupOwnership(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("transfer_quiz_group_ownership", { p_group_id: groupId, p_user_id: userId });
  if (error) throw error;
}

export async function listGroupQuizzes(groupId: string): Promise<GroupQuiz[]> {
  const { data, error } = await supabase
    .from("group_quizzes")
    .select(QUIZ_SELECT)
    .eq("group_id", groupId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GroupQuiz[];
}

export async function getGroupQuiz(id: string): Promise<GroupQuiz | null> {
  const { data, error } = await supabase.from("group_quizzes").select(QUIZ_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as GroupQuiz | null;
}

export async function listGroupQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from("group_quiz_questions")
    .select("id,quiz_id,position,prompt,explanation,options:group_quiz_options!group_quiz_options_question_id_fkey(id,question_id,position,option_text)")
    .eq("quiz_id", quizId)
    .order("position");
  if (error) throw error;
  return ((data ?? []) as unknown as QuizQuestion[]).map((question) => ({
    ...question,
    options: [...(question.options ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export async function saveGroupQuiz(input: SaveGroupQuizInput): Promise<string> {
  const validationError = validateGroupQuiz(input);
  if (validationError) throw new Error(validationError);
  const { data, error } = await supabase.rpc("save_group_quiz", {
    p_quiz_id: input.quizId ?? null,
    p_group_id: input.groupId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_starts_at: input.startsAt,
    p_closes_at: input.closesAt,
    p_duration_minutes: input.durationMinutes,
    p_answer_release: input.answerRelease,
    p_answer_release_at: input.answerReleaseAt,
    p_questions: input.questions.map((question) => ({
      prompt: question.prompt.trim(),
      explanation: question.explanation.trim(),
      options: question.options.map((option) => option.trim()),
      correct_index: question.correctIndex,
    })),
    p_publish: input.publish,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The quiz could not be saved.");
  return data;
}

export type QuizStart = { attempt_id: string; started_at: string; duration_minutes: number; closes_at: string | null };
export type QuizAttemptDetails = {
  id: string;
  quiz_id: string;
  started_at: string;
  submitted_at: string | null;
  duration_minutes: number;
  closes_at: string | null;
};

export async function getGroupQuizAttempt(attemptId: string): Promise<QuizAttemptDetails | null> {
  const { data, error } = await supabase
    .from("group_quiz_attempts")
    .select("id,quiz_id,started_at,submitted_at,quiz:group_quizzes!group_quiz_attempts_quiz_id_fkey(duration_minutes,closes_at)")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as { id: string; quiz_id: string; started_at: string; submitted_at: string | null; quiz: { duration_minutes: number; closes_at: string | null } | null };
  if (!row.quiz) return null;
  return { id: row.id, quiz_id: row.quiz_id, started_at: row.started_at, submitted_at: row.submitted_at, ...row.quiz };
}

export async function startGroupQuiz(quizId: string): Promise<QuizStart> {
  const { data, error } = await supabase.rpc("start_group_quiz", { p_quiz_id: quizId });
  if (error) throw error;
  const start = (Array.isArray(data) ? data[0] : data) as QuizStart | null;
  if (!start?.attempt_id) throw new Error("The quiz could not be started.");
  return start;
}

export async function submitGroupQuiz(attemptId: string, answers: QuizAnswerDraft[]): Promise<void> {
  const { error } = await supabase.rpc("submit_group_quiz", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error) throw error;
}

export async function getGroupQuizAttemptResult(attemptId: string): Promise<QuizResultRow[]> {
  const { data, error } = await supabase.rpc("group_quiz_attempt_result", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as QuizResultRow[];
}

export async function listGroupQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from("group_quiz_attempts")
    .select("id,quiz_id,user_id,started_at,submitted_at,score,percentage,correct_count,incorrect_count,unanswered_count,participant:profiles!group_quiz_attempts_user_id_fkey(username,display_name)")
    .eq("quiz_id", quizId)
    .order("started_at");
  if (error) throw error;
  return (data ?? []) as unknown as QuizAttempt[];
}

export async function getGroupQuizLeaderboard(quizId: string): Promise<{ user_id: string; username: string; display_name: string; score: number; percentage: number; submitted_at: string }[]> {
  const { data, error } = await supabase.rpc("group_quiz_leaderboard", { p_quiz_id: quizId });
  if (error) throw error;
  return (data ?? []) as { user_id: string; username: string; display_name: string; score: number; percentage: number; submitted_at: string }[];
}

export async function getGroupQuizPerformance(quizId: string): Promise<QuizPerformanceMember[]> {
  const { data, error } = await supabase.rpc("group_quiz_performance", { p_quiz_id: quizId });
  if (error) throw error;
  return (data ?? []) as QuizPerformanceMember[];
}
