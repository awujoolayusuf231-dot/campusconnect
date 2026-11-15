import { supabase } from "@/lib/supabase";

export interface Project {
  id: string;
  owner_id: string;
  institution_id: string | null;
  title: string;
  description: string;
  objectives: string;
  category: string;
  collaboration_type: string;
  required_skills: string[];
  visibility: "public" | "institution" | "private";
  max_collaborators: number;
  deadline: string | null;
  application_deadline: string | null;
  status: "recruiting" | "in_progress" | "completed" | "cancelled";
  created_at: string;
}
export type ProjectListItem = Pick<
  Project,
  "id" | "title" | "description" | "category" | "required_skills" | "max_collaborators" | "deadline" | "status"
>;

export interface ProjectTask {
  id: string;
  project_id: string;
  creator_id: string;
  assignee_id: string | null;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  due_at: string | null;
}

export interface ProjectMessage {
  id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface ProjectAsset {
  name: string;
  path: string;
  created_at: string | null;
  signedUrl: string;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function listProjects(query = "", category = "", page = 0): Promise<ProjectListItem[]> {
  let request = supabase.from("projects")
    .select("id,title,description,category,required_skills,max_collaborators,deadline,status")
    .neq("status", "cancelled");
  if (category) request = request.eq("category", category);
  if (query.trim()) request = request.ilike("title", `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error } = await request.order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
  if (error) throw error;
  return (data ?? []) as ProjectListItem[];
}

export function createProject(input: {
  title: string; description: string; objectives: string; category: string; collaborationType: string;
  skills: string[]; institutionId: string | null; visibility: string; maxCollaborators: number;
  deadline: string | null; applicationDeadline: string | null;
}) {
  return rpc<string>("create_project", {
    p_title: input.title, p_description: input.description, p_objectives: input.objectives,
    p_category: input.category, p_collaboration_type: input.collaborationType, p_skills: input.skills,
    p_institution: input.institutionId, p_visibility: input.visibility,
    p_max_collaborators: input.maxCollaborators, p_deadline: input.deadline,
    p_application_deadline: input.applicationDeadline,
  });
}

export const applyToProject = (projectId: string, pitch: string) =>
  rpc<string>("apply_to_project", { p_project: projectId, p_pitch: pitch });

export const reviewProjectApplication = (applicationId: string, approve: boolean) =>
  rpc<void>("review_project_application", { p_application: applicationId, p_approve: approve });

export const inviteToProject = (projectId: string, userId: string) =>
  rpc<string>("invite_to_project", { p_project: projectId, p_invitee: userId });

export const respondToProjectInvitation = (invitationId: string, accept: boolean) =>
  rpc<void>("respond_project_invitation", { p_invitation: invitationId, p_accept: accept });

export async function getProjectWorkspace(projectId: string) {
  const [members, applications, tasks, messages, milestones] = await Promise.all([
    supabase.from("project_members").select("project_id,user_id,project_role,joined_at").eq("project_id", projectId).order("joined_at"),
    supabase.from("project_applications").select("id,project_id,applicant_id,skills_pitch,status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_messages").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
    supabase.from("project_milestones").select("*").eq("project_id", projectId).order("due_at"),
  ]);
  for (const result of [members, applications, tasks, messages, milestones]) if (result.error) throw result.error;
  return {
    members: members.data ?? [],
    applications: applications.data ?? [],
    tasks: (tasks.data ?? []) as ProjectTask[],
    messages: ((messages.data ?? []) as ProjectMessage[]).reverse(),
    milestones: milestones.data ?? [],
  };
}

export async function createProjectTask(input: Pick<ProjectTask, "project_id" | "title" | "description" | "assignee_id" | "due_at">) {
  const { data, error } = await supabase.from("project_tasks").insert(input).select("*").single();
  if (error) throw error;
  return data as ProjectTask;
}

export async function updateProjectTask(id: string, status: ProjectTask["status"]) {
  const { error } = await supabase.from("project_tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function createProjectMilestone(projectId: string, title: string, dueAt: string | null) {
  const { error } = await supabase.from("project_milestones").insert({ project_id: projectId, title, due_at: dueAt });
  if (error) throw error;
}

export async function updateProjectMilestone(id: string, completed: boolean) {
  const { error } = await supabase.from("project_milestones").update({ completed_at: completed ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function removeProjectMilestone(id: string) {
  const { error } = await supabase.from("project_milestones").delete().eq("id", id);
  if (error) throw error;
}

export async function sendProjectMessage(projectId: string, body: string) {
  const { error } = await supabase.from("project_messages").insert({ project_id: projectId, body });
  if (error) throw error;
}

export async function uploadProjectAsset(projectId: string, file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "application/zip"];
  if (!allowed.includes(file.type)) throw new Error("Choose an image, PDF, text, or ZIP file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Project files must be 5 MB or smaller.");
  const path = `${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from("collaboration-assets").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function listProjectAssets(projectId: string): Promise<ProjectAsset[]> {
  const storage = supabase.storage.from("collaboration-assets");
  const { data, error } = await storage.list(projectId, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (file) => {
    const path = `${projectId}/${file.name}`;
    const { data: signed, error: signedError } = await storage.createSignedUrl(path, 300);
    if (signedError) throw signedError;
    return { name: file.name, path, created_at: file.created_at, signedUrl: signed.signedUrl };
  }));
}
