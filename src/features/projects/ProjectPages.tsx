import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, Check, Clock3, Plus, Send, Upload, Users } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoadingState } from "@/app/LoadingState";
import { FeatureDialog } from "@/components/FeatureDialog";
import {
  applyToProject, createProject, createProjectMilestone, createProjectTask, getProjectWorkspace,
  inviteToProject, listProjectAssets, listProjects, removeProjectMilestone, reviewProjectApplication,
  sendProjectMessage, updateProjectMilestone, updateProjectTask, uploadProjectAsset, type Project,
  type ProjectListItem,
  type ProjectTask,
} from "./api";
import { supabase } from "@/lib/supabase";
import { submitFeatureReport } from "@/features/reports/api";

const categories = ["academic", "software", "research", "business", "design", "innovation", "other"];
const card = "rounded-2xl border border-line bg-white p-4 shadow-sm";

export function ProjectBoardPage() {
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const projects = useQuery({ queryKey: ["projects", searchTerm, category], queryFn: () => listProjects(searchTerm, category) });
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Find your team</p><h1 className="mt-1 text-3xl font-black">Project board</h1>
          <p className="mt-1 text-sm text-muted">Turn a good idea into a great collaboration.</p></div>
        <button className="btn-primary inline-flex items-center gap-2" onClick={() => setCreating(true)}><Plus size={16} /> Start a project</button>
      </header>
      <section className="rounded-3xl bg-gradient-to-br from-primary-deep via-primary to-primary-hover p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-white/85">Make it happen together</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black sm:text-3xl">Find curious minds for the work you believe in.</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">Discover student-led research, software, design, business and campus projects.</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-[1fr,220px]">
        <input className="input min-w-0" aria-label="Search projects" placeholder="Search project titles" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input min-w-0" aria-label="Project category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
      </div>
      {projects.isLoading && <LoadingState label="Finding projects" variant="panel" />}
      {projects.isError && <p className="err" role="alert">Could not load projects. Refresh and try again.</p>}
      {projects.data?.length === 0 && <div className={`${card} py-12 text-center`}><BriefcaseBusiness className="mx-auto text-primary" /><h2 className="mt-3 font-bold">No projects match yet</h2><p className="mt-1 text-sm text-muted">Try another search or start the first project.</p></div>}
      <div className="grid gap-4 md:grid-cols-2">{projects.data?.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  return <article className={`${card} flex flex-col gap-3`}>
    <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">{label(project.category)}</span><span className="text-xs text-muted">{project.status.replace("_", " ")}</span></div>
    <div><h2 className="text-lg font-extrabold leading-snug"><Link to={`/app/projects/${project.id}`} className="hover:text-primary">{project.title}</Link></h2>
      <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted">{project.description}</p></div>
    <div className="flex flex-wrap gap-1.5">{project.required_skills.slice(0, 5).map((skill) => <span key={skill} className="rounded-full border border-line px-2 py-1 text-[11px] text-muted">{skill}</span>)}</div>
    <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
      <span className="inline-flex items-center gap-1"><Users size={14} /> Up to {project.max_collaborators} team members</span>
      <span>{project.deadline ? `Due ${project.deadline}` : "Open timeline"}</span>
    </div>
  </article>;
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [skills, setSkills] = useState("");
  const mutation = useMutation({ mutationFn: createProject, onSuccess: async (id) => {
    await qc.invalidateQueries({ queryKey: ["projects"] }); onClose(); navigate(`/app/projects/${id}`);
  }, onError: (e: Error) => setError(e.message) });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const data = new FormData(e.currentTarget);
    mutation.mutate({
      title: String(data.get("title")), description: String(data.get("description")),
      objectives: String(data.get("objectives") ?? ""), category: String(data.get("category")),
      collaborationType: String(data.get("collaborationType")), skills: skills.split(",").map((x) => x.trim()).filter(Boolean),
      institutionId: null, visibility: String(data.get("visibility")),
      maxCollaborators: Number(data.get("maxCollaborators")),
      deadline: String(data.get("deadline") || "") || null, applicationDeadline: String(data.get("applicationDeadline") || "") || null,
    });
  }
  return <Dialog title="Start a collaboration" onClose={onClose}><form className="space-y-3" onSubmit={submit}>
    <Field name="title" label="Project title" required maxLength={120} />
    <Field name="description" label="What are you building?" required textarea maxLength={5000} />
    <Field name="objectives" label="Objectives" textarea maxLength={2000} />
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField name="category" label="Category" options={categories} />
      <SelectField name="collaborationType" label="Collaboration type" options={categories} />
      <SelectField name="visibility" label="Who can discover?" options={["public", "institution", "private"]} />
      <Field name="maxCollaborators" label="Team size (including you)" type="number" defaultValue="5" min="1" max="50" required />
      <Field name="deadline" label="Project deadline" type="date" />
      <Field name="applicationDeadline" label="Applications close" type="datetime-local" />
    </div>
    <Field name="skills" label="Skills and tools (comma-separated)" value={skills} onChange={setSkills} maxLength={500} />
    {error && <p role="alert" className="err">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? "Creating…" : "Create project"}</button></div>
  </form></Dialog>;
}

export function ProjectWorkspacePage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [pitch, setPitch] = useState("");
  const [message, setMessage] = useState("");
  const [newTask, setNewTask] = useState("");
  const [invitee, setInvitee] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDueAt, setMilestoneDueAt] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetError, setAssetError] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [notice, setNotice] = useState("");
  const project = useQuery({ queryKey: ["project", id], enabled: !!id, queryFn: async () => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (error) throw error; return data as Project | null;
  } });
  const isMember = useQuery({ queryKey: ["project-member", id, session?.user.id], enabled: !!id && !!session, queryFn: async () => {
    const { data, error } = await supabase.from("project_members").select("project_role").eq("project_id", id).eq("user_id", session!.user.id).maybeSingle();
    if (error) throw error; return data;
  } });
  const workspace = useQuery({ queryKey: ["project-workspace", id], enabled: !!id && !!isMember.data, queryFn: () => getProjectWorkspace(id) });
  const assets = useQuery({ queryKey: ["project-assets", id], enabled: !!id && !!isMember.data, queryFn: () => listProjectAssets(id) });
  const apply = useMutation({ mutationFn: () => applyToProject(id, pitch), onSuccess: async () => {
    setPitch(""); setNotice("Application sent to the project owner."); await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  }, onError: (e: Error) => setNotice(e.message) });
  const task = useMutation({ mutationFn: () => createProjectTask({ project_id: id, title: newTask.trim(), description: "", assignee_id: null, due_at: null }), onSuccess: async () => {
    setNewTask(""); await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  }, onError: (error: Error) => setNotice(error.message) });
  const taskStatus = useMutation({ mutationFn: ({ taskId, status: next }: { taskId: string; status: ProjectTask["status"] }) => updateProjectTask(taskId, next), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  }, onError: (error: Error) => setNotice(error.message) });
  const send = useMutation({ mutationFn: () => sendProjectMessage(id, message.trim()), onSuccess: async () => {
    setMessage(""); await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  } });
  const invite = useMutation({ mutationFn: () => inviteToProject(id, invitee.trim()), onSuccess: () => { setInvitee(""); setNotice("Invitation sent."); }, onError: (e: Error) => setNotice(e.message) });
  const review = useMutation({ mutationFn: ({ appId, approve }: { appId: string; approve: boolean }) => reviewProjectApplication(appId, approve), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  } });
  const status = useMutation({ mutationFn: async (value: Project["status"]) => {
    const { error } = await supabase.from("projects").update({ status: value }).eq("id", id); if (error) throw error;
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["project", id] }); await qc.invalidateQueries({ queryKey: ["projects"] }); },
    onError: (error: Error) => setNotice(error.message) });
  const milestone = useMutation({ mutationFn: () => createProjectMilestone(id, milestoneTitle.trim(), milestoneDueAt ? new Date(`${milestoneDueAt}T23:59:00`).toISOString() : null), onSuccess: async () => {
    setMilestoneTitle(""); setMilestoneDueAt(""); await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  }, onError: (error: Error) => setNotice(error.message) });
  const toggleMilestone = useMutation({ mutationFn: ({ milestoneId, completed }: { milestoneId: string; completed: boolean }) => updateProjectMilestone(milestoneId, completed), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  }, onError: (error: Error) => setNotice(error.message) });
  const deleteMilestone = useMutation({ mutationFn: removeProjectMilestone, onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["project-workspace", id] });
  }, onError: (error: Error) => setNotice(error.message) });
  const assetUpload = useMutation({ mutationFn: () => {
    if (!assetFile) throw new Error("Choose a project file to upload.");
    return uploadProjectAsset(id, assetFile);
  }, onSuccess: async () => {
    setAssetFile(null); setAssetError(""); await qc.invalidateQueries({ queryKey: ["project-assets", id] });
  }, onError: (error: Error) => setAssetError(error.message) });
  const report = useMutation({ mutationFn: () => submitFeatureReport("project", id, reportReason), onSuccess: () => {
    setReportReason(""); setNotice("Report sent to the moderation team.");
  }, onError: (error: Error) => setNotice(error.message) });

  useEffect(() => {
    if (!isMember.data) return;
    const channel = supabase.channel(`project-${id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "project_messages", filter: `project_id=eq.${id}` }, () => {
      void qc.invalidateQueries({ queryKey: ["project-workspace", id] });
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, isMember.data, qc]);

  if (project.isLoading) return <LoadingState label="Opening project" variant="panel" />;
  if (project.isError || !project.data) return <p role="alert" className="err">This project is unavailable or you do not have access.</p>;
  const value = project.data;
  const owner = value.owner_id === session?.user.id;
  return <div className="space-y-4">
    <Link to="/app/projects" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary"><ArrowLeft size={16} /> Project board</Link>
    <section className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wider text-primary">{label(value.category)} · {value.visibility}</p><h1 className="mt-1 text-2xl font-black">{value.title}</h1></div>
        {owner && <select className="input w-auto" aria-label="Project status" value={value.status} onChange={(e) => status.mutate(e.target.value as Project["status"])}>
          {["recruiting", "in_progress", "completed", "cancelled"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{value.description}</p>
      {value.objectives && <p className="rounded-xl bg-bg p-3 text-sm"><strong>Objectives:</strong> {value.objectives}</p>}
      <div className="flex flex-wrap gap-2">{value.required_skills.map((x) => <span key={x} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{x}</span>)}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted"><span className="inline-flex items-center gap-1"><Users size={14} /> Up to {value.max_collaborators} collaborators</span>{value.deadline && <span className="inline-flex items-center gap-1"><Clock3 size={14} /> Due {value.deadline}</span>}</div>
    </section>
    {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    {!owner && <section className={card}><h2 className="font-bold">Report this project</h2>
      <div className="mt-2 flex flex-wrap gap-2"><input className="input min-w-0 flex-1" aria-label="Project report reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)} maxLength={1000} placeholder="Tell moderators what concerns you (5–1000 characters)" />
        <button className="btn" disabled={report.isPending || reportReason.trim().length < 5} onClick={() => report.mutate()}>{report.isPending ? "Sending…" : "Report"}</button></div>
    </section>}
    {!isMember.data && !owner && value.status === "recruiting" && <>
      <section className={card}><h2 className="font-bold">Apply to join</h2><p className="mt-1 text-sm text-muted">Tell the project owner what you would bring.</p>
        <textarea className="input mt-3" rows={3} maxLength={1200} value={pitch} onChange={(e) => setPitch(e.target.value)} aria-label="Application message" placeholder="Share your relevant skills and interest…" />
        <button className="btn-primary mt-2" disabled={apply.isPending || pitch.trim().length < 10} onClick={() => apply.mutate()}>{apply.isPending ? "Sending…" : "Send application"}</button></section>
    </>}
    {isMember.data && <div className="grid gap-4 xl:grid-cols-[1.05fr,1fr]">
      <section className={`${card} space-y-3`}>
        <h2 className="text-lg font-extrabold">Team workspace</h2>
        <div><h3 className="text-sm font-bold">Team members</h3><ul className="mt-2 space-y-1 text-sm">{workspace.data?.members.map((m) => <li key={m.user_id} className="rounded-lg bg-bg px-3 py-2">{m.project_role} · {m.user_id === value.owner_id ? "Owner" : m.user_id.slice(0, 8)}</li>)}</ul></div>
        {owner && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}><input className="input" aria-label="Student user ID to invite" placeholder="Invite student by user ID" value={invitee} onChange={(e) => setInvitee(e.target.value)} /><button className="btn" disabled={!invitee.trim()}>Invite</button></form>}
        <div><h3 className="text-sm font-bold">Open applications</h3>
          {workspace.data?.applications.filter((a) => a.status === "pending").map((application) => <div key={application.id} className="mt-2 rounded-xl border border-line p-3">
            <p className="text-xs text-muted">Applicant {application.applicant_id.slice(0, 8)}</p><p className="mt-1 text-sm">{application.skills_pitch}</p>
            {owner && <div className="mt-2 flex gap-2"><button className="btn-primary inline-flex items-center gap-1" onClick={() => review.mutate({ appId: application.id, approve: true })}><Check size={14} /> Approve</button><button className="btn" onClick={() => review.mutate({ appId: application.id, approve: false })}>Decline</button></div>}
          </div>)}
        </div>
        <div><h3 className="text-sm font-bold">Tasks</h3>
          <ul className="mt-2 space-y-2">{workspace.data?.tasks.map((item) => <TaskItem key={item.id} task={item} onStatus={(s) => taskStatus.mutate({ taskId: item.id, status: s })} />)}</ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newTask.trim()) task.mutate(); }}><input className="input" aria-label="New task" placeholder="Add a task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} /><button className="btn" disabled={task.isPending || !newTask.trim()}>Add</button></form>
        </div>
        <div><h3 className="text-sm font-bold">Milestones</h3>
          <ul className="mt-2 space-y-2">{workspace.data?.milestones.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm">
            <button type="button" className={`min-w-0 flex-1 text-left ${item.completed_at ? "text-muted line-through" : ""}`} onClick={() => toggleMilestone.mutate({ milestoneId: item.id, completed: !item.completed_at })}>{item.title}{item.due_at && <span className="ml-2 text-xs text-muted">Due {new Date(item.due_at).toLocaleDateString()}</span>}</button>
            {owner && <button type="button" className="btn px-2 py-1 text-xs" aria-label={`Remove milestone ${item.title}`} onClick={() => deleteMilestone.mutate(item.id)}>Remove</button>}
          </li>)}</ul>
          <form className="mt-2 grid gap-2 sm:grid-cols-[1fr,auto,auto]" onSubmit={(e) => { e.preventDefault(); if (milestoneTitle.trim()) milestone.mutate(); }}>
            <input className="input" aria-label="Milestone title" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Add a milestone" maxLength={160} />
            <input className="input" aria-label="Milestone due date" type="date" value={milestoneDueAt} onChange={(e) => setMilestoneDueAt(e.target.value)} />
            <button className="btn" disabled={milestone.isPending || milestoneTitle.trim().length < 3}>Add</button>
          </form>
        </div>
        <div><h3 className="text-sm font-bold">Project files</h3>
          {assets.isError && <p role="alert" className="err">Could not load project files.</p>}
          <ul className="mt-2 space-y-1">{assets.data?.map((asset) => <li key={asset.path}><a className="text-sm font-semibold text-primary underline" href={asset.signedUrl} target="_blank" rel="noreferrer">{asset.name}</a></li>)}</ul>
          <label className="mt-2 block"><span className="label">Upload an image, PDF, text, or ZIP (5 MB max)</span>
            <input className="input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.zip" onChange={(e) => { setAssetError(""); setAssetFile(e.target.files?.[0] ?? null); }} />
          </label>
          {assetError && <p role="alert" className="err">{assetError}</p>}
          <button className="btn mt-2 inline-flex items-center gap-2" disabled={!assetFile || assetUpload.isPending} onClick={() => assetUpload.mutate()}><Upload size={15} />{assetUpload.isPending ? "Uploading…" : "Upload file"}</button>
        </div>
      </section>
      <section className={`${card} flex min-h-[420px] flex-col`}>
        <h2 className="text-lg font-extrabold">Team discussion</h2>
        <div className="mt-3 flex-1 space-y-2 overflow-auto" role="log" aria-live="polite">
          {workspace.data?.messages.map((m) => <article key={m.id} className="rounded-xl bg-bg p-3"><p className="text-xs text-muted">{m.author_id === session?.user.id ? "You" : `Teammate ${m.author_id.slice(0, 8)}`}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p></article>)}
          {!workspace.data?.messages.length && <p className="py-12 text-center text-sm text-muted">Start the team conversation.</p>}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (message.trim()) send.mutate(); }}><input className="input" aria-label="Team message" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write to the team…" /><button className="btn-primary" aria-label="Send message" disabled={send.isPending || !message.trim()}><Send size={16} /></button></form>
      </section>
    </div>}
  </div>;
}

function TaskItem({ task, onStatus }: { task: ProjectTask; onStatus: (status: ProjectTask["status"]) => void }) {
  return <li className="flex items-center gap-2 rounded-lg border border-line p-2"><span className="min-w-0 flex-1 text-sm">{task.title}</span>
    <select className="input w-auto py-1 text-xs" aria-label={`${task.title} status`} value={task.status} onChange={(e) => onStatus(e.target.value as ProjectTask["status"])}>{["todo", "in_progress", "done"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
  </li>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <FeatureDialog title={title} onClose={onClose}>{children}</FeatureDialog>;
}

function Field({ name, label: title, type = "text", required = false, maxLength, textarea = false, defaultValue, value, onChange, min, max }: {
  name: string; label: string; type?: string; required?: boolean; maxLength?: number; textarea?: boolean;
  defaultValue?: string; value?: string; onChange?: (value: string) => void; min?: string; max?: string;
}) {
  const id = `project-${name}`;
  return <label className="block"><span className="label">{title}</span>{textarea
    ? <textarea id={id} name={name} className="input" rows={3} required={required} maxLength={maxLength} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} defaultValue={defaultValue} />
    : <input id={id} name={name} className="input" type={type} required={required} maxLength={maxLength} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} defaultValue={defaultValue} min={min} max={max} />}</label>;
}

function SelectField({ name, label: title, options }: { name: string; label: string; options: string[] }) {
  return <label className="block"><span className="label">{title}</span><select name={name} className="input">{options.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></label>;
}

function label(value: string) {
  return value.split("_").map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
}
