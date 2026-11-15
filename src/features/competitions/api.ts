import { supabase } from "@/lib/supabase";

export interface Competition {
  id: string;
  organizer_id: string;
  institution_id: string | null;
  name: string;
  description: string;
  category: string;
  rules: string;
  eligibility: string;
  participation_type: "individual" | "team" | "both";
  max_team_size: number;
  registration_opens_at: string;
  registration_closes_at: string;
  starts_at: string;
  ends_at: string;
  submission_deadline: string | null;
  prizes: string;
  verification_status: string;
  status: string;
}

export interface CompetitionInstitution {
  id: string;
  name: string;
}

export type CompetitionListItem = Pick<
  Competition,
  "id" | "name" | "description" | "category" | "registration_closes_at" | "starts_at" | "participation_type" | "max_team_size" | "status"
>;

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function listCompetitionInstitutions(): Promise<CompetitionInstitution[]> {
  const { data, error } = await supabase.from("institutions").select("id,name").eq("is_active", true).order("name");
  if (error) throw error;
  return (data ?? []) as CompetitionInstitution[];
}

export async function listCompetitions(query = "", category = "", page = 0): Promise<CompetitionListItem[]> {
  let request = supabase.from("competitions")
    .select("id,name,description,category,registration_closes_at,starts_at,participation_type,max_team_size,status")
    .eq("verification_status", "approved")
    .neq("status", "cancelled");
  if (category) request = request.eq("category", category);
  if (query.trim()) request = request.ilike("name", `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error } = await request.order("starts_at", { ascending: true }).range(page * 20, page * 20 + 19);
  if (error) throw error;
  return (data ?? []) as CompetitionListItem[];
}

export function createCompetition(input: {
  name: string; description: string; category: string; rules: string; eligibility: string;
  institutionId: string | null; participatingInstitutions: string[]; participationType: string;
  maxTeamSize: number; registrationOpens: string; registrationCloses: string; starts: string;
  ends: string; submissionDeadline: string | null; prizes: string;
}) {
  return rpc<string>("create_competition", {
    p_name: input.name, p_description: input.description, p_category: input.category, p_rules: input.rules,
    p_eligibility: input.eligibility, p_institution: input.institutionId,
    p_participating_institutions: input.participatingInstitutions, p_participation_type: input.participationType,
    p_max_team_size: input.maxTeamSize, p_registration_opens: input.registrationOpens,
    p_registration_closes: input.registrationCloses, p_starts: input.starts, p_ends: input.ends,
    p_submission_deadline: input.submissionDeadline, p_prizes: input.prizes,
  });
}

export const registerForCompetition = (competitionId: string, teamName: string | null) =>
  rpc<string>("register_for_competition", { p_competition: competitionId, p_team_name: teamName });

export const submitCompetitionEntry = (competitionId: string, title: string, description: string, assetPath: string | null) =>
  rpc<string>("submit_competition_entry", {
    p_competition: competitionId, p_title: title, p_description: description, p_asset_path: assetPath,
  });

export const getMyCompetitionRegistration = (competitionId: string) =>
  rpc<{ registration_id: string; team_name: string | null; team_role: string }[]>("my_competition_registration", { p_competition: competitionId });

export const inviteCompetitionTeammate = (registrationId: string, userId: string) =>
  rpc<string>("invite_competition_teammate", { p_registration: registrationId, p_user: userId });

export const respondToCompetitionTeamInvite = (invitationId: string, accept: boolean) =>
  rpc<void>("respond_competition_team_invitation", { p_invitation: invitationId, p_accept: accept });

export const scoreCompetitionEntry = (submissionId: string, score: number, rank: number | null, feedback: string) =>
  rpc<void>("score_competition_submission", {
    p_submission: submissionId, p_score: score, p_rank: rank, p_feedback: feedback,
  });

export const completeCompetition = (competitionId: string) =>
  rpc<void>("complete_competition", { p_competition: competitionId });

export const moderateCompetition = (competitionId: string, approve: boolean) =>
  rpc<void>("moderate_competition", { p_competition: competitionId, p_approve: approve });

export async function uploadCompetitionAsset(competitionId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "application/zip"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, WebP, PDF, text, or ZIP file.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  const path = `${competitionId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from("competition-assets").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}
