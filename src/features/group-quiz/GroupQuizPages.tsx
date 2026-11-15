import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpenCheck, Clock3, Crown, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { listCourses, listDepartments, listInstitutions } from "@/features/past-questions/api";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  createQuizGroup,
  getGroupQuiz,
  getGroupQuizAttempt,
  getGroupQuizAttemptResult,
  getGroupQuizPerformance,
  getQuizGroup,
  getGroupQuizLeaderboard,
  leaveQuizGroup,
  listGroupQuizQuestions,
  listGroupQuizzes,
  listQuizGroupMembers,
  listQuizGroups,
  manageQuizGroupMember,
  requestQuizGroupMembership,
  respondQuizGroupInvite,
  saveGroupQuiz,
  searchQuizGroupStudents,
  startGroupQuiz,
  submitGroupQuiz,
  transferQuizGroupOwnership,
  updateQuizGroup,
  validateGroupQuiz,
  type GroupQuiz,
  type QuizQuestionDraft,
  type QuizGroup,
} from "./api";

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{eyebrow}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>
    {action}
  </div>;
}

function GroupCard({ group, to }: { group: QuizGroup; to?: string }) {
  const href = to ?? `/app/group-quiz/groups/${group.id}`;
  return <Link to={href} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><UsersRound size={20} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><h2 className="break-words font-extrabold text-fg group-hover:text-primary">{group.name}</h2><p className="mt-1 text-xs text-muted">{group.visibility === "discoverable" ? "Discoverable" : "Invite only"} · {group.join_policy === "open" ? "Open to join" : group.join_policy === "approval" ? "Request to join" : "Invitation required"}</p></div>
    </div>
    <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted">{group.description || "A focused space to study together."}</p>
    {group.my_status && <span className="mt-3 w-fit rounded-full bg-[#fff4f2] px-2.5 py-1 text-[10px] font-bold text-primary">{group.my_status === "active" ? group.my_role ?? "Member" : group.my_status.replace("_", " ")}</span>}
    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold text-primary">Open group <ArrowRight size={13} aria-hidden="true" /></span>
  </Link>;
}

function LoadingPanel({ label }: { label: string }) {
  return <LoadingState label={label} variant="panel" />;
}

export function GroupQuizHomePage() {
  const mine = useQuery({ queryKey: ["quiz-groups", "mine"], queryFn: () => listQuizGroups(true) });
  const discover = useQuery({ queryKey: ["quiz-groups", "discover"], queryFn: () => listQuizGroups() });
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const rows = tab === "mine" ? mine : discover;
  return <div className="space-y-5">
    <PageTitle eyebrow="Study together" title="Group Quiz" description="Create a focused study group, invite classmates, and run quizzes with protected results." action={<Link to="/app/group-quiz/create-group" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={16} />Create group</Link>} />
    <section className="rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-4 text-sm leading-6 text-[#6b5555]">
      Group membership and quiz results are private to the group. Correct answers stay hidden until the quiz's release setting allows review.
    </section>
    <div role="tablist" aria-label="Quiz groups" className="flex gap-2 overflow-x-auto">
      {([["mine", "My groups"], ["discover", "Discover groups"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-bold ${tab === key ? "bg-primary text-white" : "border border-line bg-white text-muted hover:text-primary"}`} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {rows.isLoading ? <LoadingPanel label="Loading quiz groups" />
      : rows.isError ? <p role="alert" className="err">Could not load groups: {(rows.error as Error).message}</p>
        : rows.data?.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.data.map((group) => <li key={group.id}><GroupCard group={group} /></li>)}</ul>
          : <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-10 text-center"><UsersRound className="mx-auto text-primary" size={24} aria-hidden="true" /><h2 className="mt-3 font-extrabold text-fg">{tab === "mine" ? "No quiz groups yet" : "No discoverable groups found"}</h2><p className="mt-1 text-sm text-muted">{tab === "mine" ? "Create a group or browse discoverable groups to get started." : "Try again later or create a group for your classmates."}</p></section>}
  </div>;
}

export function CreateQuizGroupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const institutions = useQuery({ queryKey: ["institutions"], queryFn: listInstitutions });
  const [institutionId, setInstitutionId] = useState("");
  const departments = useQuery({ queryKey: ["departments", institutionId], enabled: !!institutionId, queryFn: () => listDepartments(institutionId) });
  const [departmentId, setDepartmentId] = useState("");
  const courses = useQuery({ queryKey: ["courses", departmentId], enabled: !!departmentId, queryFn: () => listCourses(departmentId) });
  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<QuizGroup["visibility"]>("discoverable");
  const [joinPolicy, setJoinPolicy] = useState<QuizGroup["join_policy"]>("approval");
  const create = useMutation({
    mutationFn: () => createQuizGroup({ name, description, institutionId, departmentId: departmentId || null, courseId: courseId || null, visibility, joinPolicy }),
    onSuccess: async (id) => { await qc.invalidateQueries({ queryKey: ["quiz-groups"] }); navigate(`/app/group-quiz/groups/${id}`); },
  });
  return <div className="mx-auto max-w-2xl space-y-5">
    <Link to="/app/group-quiz" className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />Group Quiz</Link>
    <PageTitle eyebrow="New study space" title="Create a quiz group" description="Set the academic context and decide whether classmates can join directly or need approval." />
    <form className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6" onSubmit={(event) => { event.preventDefault(); if (!create.isPending) create.mutate(); }}>
      <label className="block"><span className="label">Group name</span><input className="input" minLength={3} maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. CSC 201 revision" /></label>
      <label className="block"><span className="label">Description</span><textarea className="input min-h-24" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will the group study together?" /></label>
      <label className="block"><span className="label">Institution</span><select className="input" required value={institutionId} disabled={institutions.isLoading} onChange={(event) => { setInstitutionId(event.target.value); setDepartmentId(""); }}><option value="">Choose your institution</option>{institutions.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {institutionId && <label className="block"><span className="label">Department <span className="font-normal text-muted">(optional)</span></span><select className="input" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setCourseId(""); }}><option value="">All departments</option>{departments.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      {departmentId && <label className="block"><span className="label">Course focus <span className="font-normal text-muted">(optional)</span></span><select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">No specific course selected</option>{courses.data?.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.title}</option>)}</select></label>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">Who can discover this group?</span><select className="input" value={visibility} onChange={(event) => setVisibility(event.target.value as QuizGroup["visibility"])}><option value="discoverable">Students at my institution</option><option value="invite_only">Only invited students</option></select></label>
        <label className="block"><span className="label">Joining rule</span><select className="input" value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as QuizGroup["join_policy"])}><option value="open">Join immediately</option><option value="approval">Request approval</option><option value="invite_only">Invitation only</option></select></label>
      </div>
      <p className="rounded-xl bg-[#fff9f8] p-3 text-xs leading-5 text-muted">Institution matching uses the institution on a student's profile. CampusConnect does not currently verify enrollment.</p>
      {institutions.isError && <p role="alert" className="err">Could not load institutions: {(institutions.error as Error).message}</p>}
      {departments.isError && <p role="alert" className="err">Could not load departments: {(departments.error as Error).message}</p>}
      {courses.isError && <p role="alert" className="err">Could not load courses: {(courses.error as Error).message}</p>}
      {create.isError && <p role="alert" className="err">{(create.error as Error).message}</p>}
      <button className="btn-primary min-h-11 w-full rounded-xl font-bold sm:w-auto sm:px-5" disabled={create.isPending || institutions.isLoading}>{create.isPending ? "Creating group…" : "Create group"}</button>
    </form>
  </div>;
}

export function QuizGroupPage() {
  const { groupId = "" } = useParams();
  const { session } = useAuth();
  const qc = useQueryClient();
  const group = useQuery({ queryKey: ["quiz-group", groupId], queryFn: () => getQuizGroup(groupId), enabled: !!groupId });
  const members = useQuery({ queryKey: ["quiz-group-members", groupId], queryFn: () => listQuizGroupMembers(groupId), enabled: !!groupId });
  const quizzes = useQuery({ queryKey: ["group-quizzes", groupId], queryFn: () => listGroupQuizzes(groupId), enabled: !!groupId });
  const me = session?.user.id;
  const myMembership = members.data?.find((member) => member.user_id === me);
  const manager = myMembership?.status === "active" && ["owner", "moderator"].includes(myMembership.role);
  const owner = myMembership?.status === "active" && myMembership.role === "owner";
  const active = myMembership?.status === "active";
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["quiz-group", groupId] }), qc.invalidateQueries({ queryKey: ["quiz-group-members", groupId] }), qc.invalidateQueries({ queryKey: ["quiz-groups"] })]); };
  const join = useMutation({ mutationFn: () => requestQuizGroupMembership(groupId), onSuccess: refresh });
  const respond = useMutation({ mutationFn: (accept: boolean) => respondQuizGroupInvite(groupId, accept), onSuccess: refresh });
  const leave = useMutation({ mutationFn: () => leaveQuizGroup(groupId), onSuccess: refresh });
  const memberAction = useMutation({ mutationFn: (input: { id: string; action: "approve" | "reject" | "remove" | "ban" | "unban" | "invite" | "promote" | "demote" }) => manageQuizGroupMember(groupId, input.id, input.action), onSuccess: refresh });
  const [search, setSearch] = useState("");
  const students = useQuery({ queryKey: ["quiz-group-students", group.data?.institution_id, search], enabled: manager && !!group.data && search.trim().length >= 2, queryFn: () => searchQuizGroupStudents(group.data!.institution_id, search) });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ name: "", description: "", visibility: "discoverable" as QuizGroup["visibility"], joinPolicy: "approval" as QuizGroup["join_policy"] });
  const [newOwnerId, setNewOwnerId] = useState("");
  useEffect(() => {
    if (group.data) setSettings({ name: group.data.name, description: group.data.description, visibility: group.data.visibility, joinPolicy: group.data.join_policy });
  }, [group.data]);
  const saveSettings = useMutation({ mutationFn: () => updateQuizGroup(groupId, settings), onSuccess: async () => { await refresh(); setSettingsOpen(false); } });
  const transferOwnership = useMutation({ mutationFn: () => transferQuizGroupOwnership(groupId, newOwnerId), onSuccess: async () => { setNewOwnerId(""); await refresh(); } });

  if (group.isLoading) return <LoadingPanel label="Loading quiz group" />;
  if (group.isError) return <p role="alert" className="err">Could not load this group: {(group.error as Error).message}</p>;
  if (!group.data) return <p className="card">This group is unavailable or not visible to your account.</p>;
  const g = group.data;
  return <div className="space-y-5">
    <Link to="/app/group-quiz" className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />All quiz groups</Link>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><UsersRound size={22} /></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Quiz group</p><h1 className="mt-1 break-words text-2xl font-black text-fg sm:text-3xl">{g.name}</h1></div></div>
        {manager && <div className="flex flex-wrap gap-2"><button className="btn min-h-10 rounded-xl px-3 text-sm font-bold" onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? "Close settings" : "Group settings"}</button><Link to={`/app/group-quiz/groups/${g.id}/create-quiz`} className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={15} />Create quiz</Link></div>}</div>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{g.description || "No description added."}</p>
      <p className="mt-3 text-xs font-semibold text-muted">{g.visibility === "discoverable" ? "Discoverable at this institution" : "Invite only"} · {g.join_policy.replace("_", " ")}</p>
      {myMembership?.status === "pending" && <p role="status" className="mt-4 rounded-xl bg-[#fff9f8] p-3 text-sm text-muted">Your request is waiting for a group manager.</p>}
      {myMembership?.status === "invited" && <div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary min-h-10 rounded-xl px-4 font-bold" disabled={respond.isPending} onClick={() => respond.mutate(true)}>Accept invitation</button><button className="btn min-h-10 rounded-xl px-4" disabled={respond.isPending} onClick={() => respond.mutate(false)}>Decline</button></div>}
      {!myMembership && g.join_policy !== "invite_only" && g.visibility === "discoverable" && <button className="btn-primary mt-4 min-h-10 rounded-xl px-4 font-bold" disabled={join.isPending} onClick={() => join.mutate()}>{join.isPending ? "Requesting…" : g.join_policy === "open" ? "Join group" : "Request to join"}</button>}
      {active && myMembership.role !== "owner" && <button className="btn mt-4 min-h-10 rounded-xl px-4" disabled={leave.isPending} onClick={() => { if (window.confirm("Leave this quiz group? You will lose access to its future quizzes.")) leave.mutate(); }}>{leave.isPending ? "Leaving…" : "Leave group"}</button>}
      {(join.isError || respond.isError || leave.isError || memberAction.isError) && <p role="alert" className="err mt-3">{((join.error ?? respond.error ?? leave.error ?? memberAction.error) as Error).message}</p>}
    </section>

    {settingsOpen && manager && <form className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5" onSubmit={(event) => { event.preventDefault(); saveSettings.mutate(); }}>
      <h2 className="font-extrabold text-fg sm:col-span-2">Group settings</h2>
      <label className="block"><span className="label">Group name</span><input className="input" minLength={3} maxLength={100} required value={settings.name} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="block"><span className="label">Description</span><textarea className="input min-h-10" maxLength={1000} value={settings.description} onChange={(event) => setSettings((current) => ({ ...current, description: event.target.value }))} /></label>
      <label><span className="label">Discoverability</span><select className="input" value={settings.visibility} onChange={(event) => setSettings((current) => ({ ...current, visibility: event.target.value as QuizGroup["visibility"] }))}><option value="discoverable">Discoverable at my institution</option><option value="invite_only">Invite only</option></select></label>
      <label><span className="label">Joining rule</span><select className="input" value={settings.joinPolicy} onChange={(event) => setSettings((current) => ({ ...current, joinPolicy: event.target.value as QuizGroup["join_policy"] }))}><option value="open">Join immediately</option><option value="approval">Request approval</option><option value="invite_only">Invitation only</option></select></label>
      {saveSettings.isError && <p role="alert" className="err sm:col-span-2">{(saveSettings.error as Error).message}</p>}
      <button className="btn-primary min-h-10 rounded-xl px-4 font-bold sm:col-span-2 sm:justify-self-end" disabled={saveSettings.isPending}>{saveSettings.isPending ? "Saving…" : "Save settings"}</button>
    </form>}

    {manager && <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <h2 className="font-extrabold text-fg">Invite a classmate</h2><label className="mt-3 block"><span className="label">Search by username</span><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type at least 2 characters" /></div></label>
      {students.isError && <p role="alert" className="err mt-2">Could not search students: {(students.error as Error).message}</p>}
      {students.data?.length ? <ul className="mt-2 divide-y divide-line">{students.data.filter((student) => student.id !== me && !members.data?.some((member) => member.user_id === student.id)).map((student) => <li key={student.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate text-sm"><b>{student.display_name}</b> <span className="text-muted">@{student.username}</span></span><button className="btn min-h-9 rounded-lg px-3 text-xs" disabled={memberAction.isPending} onClick={() => memberAction.mutate({ id: student.id, action: "invite" })}>Invite</button></li>)}</ul> : search.trim().length >= 2 && !students.isLoading ? <p className="mt-2 text-sm text-muted">No matching classmates found.</p> : null}
    </section>}

    {manager && members.data?.some((member) => member.status === "pending") && <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"><h2 className="font-extrabold text-fg">Join requests</h2><ul className="mt-2 divide-y divide-line">{members.data.filter((member) => member.status === "pending").map((member) => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="text-sm">{member.profile?.display_name ?? member.profile?.username ?? "Student"}</span><div className="flex gap-2"><button className="btn-primary min-h-9 rounded-lg px-3 text-xs" onClick={() => memberAction.mutate({ id: member.user_id, action: "approve" })}>Approve</button><button className="btn min-h-9 rounded-lg px-3 text-xs" onClick={() => memberAction.mutate({ id: member.user_id, action: "reject" })}>Decline</button></div></li>)}</ul></section>}

    {active && <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-fg">Group quizzes</h2><span className="text-xs text-muted">{quizzes.data?.length ?? 0} total</span></div>
      {quizzes.isLoading ? <LoadingPanel label="Loading group quizzes" /> : quizzes.isError ? <p role="alert" className="err">Could not load group quizzes: {(quizzes.error as Error).message}</p> : quizzes.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{quizzes.data.map((quiz) => <li key={quiz.id}><QuizCard quiz={quiz} /></li>)}</ul> : <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-8 text-center"><BookOpenCheck className="mx-auto text-primary" size={22} /><p className="mt-2 text-sm text-muted">{manager ? "Create the first quiz for this group." : "No quizzes have been published yet."}</p></section>}
    </section>}
    {active && <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"><h2 className="flex items-center gap-2 font-extrabold text-fg"><UsersRound size={17} className="text-primary" />Members</h2>{members.isLoading ? <LoadingPanel label="Loading members" /> : members.isError ? <p role="alert" className="err mt-2">Could not load group members.</p> : <ul className="mt-2 divide-y divide-line">{members.data?.filter((member) => member.status === "active").map((member) => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="min-w-0 flex-1 truncate text-sm">{member.profile?.display_name ?? member.profile?.username ?? "Student"}</span><span className="inline-flex items-center gap-1 text-xs text-muted">{member.role === "owner" ? <Crown size={13} className="text-primary" /> : member.role === "moderator" ? <ShieldCheck size={13} /> : null}{member.role}</span>{manager && member.user_id !== me && member.role !== "owner" && <div className="flex flex-wrap gap-1.5">{owner && <button className="btn min-h-8 rounded-lg px-2 text-[10px]" disabled={memberAction.isPending} onClick={() => memberAction.mutate({ id: member.user_id, action: member.role === "moderator" ? "demote" : "promote" })}>{member.role === "moderator" ? "Demote" : "Make moderator"}</button>}<button className="btn min-h-8 rounded-lg px-2 text-[10px]" disabled={memberAction.isPending} onClick={() => memberAction.mutate({ id: member.user_id, action: "remove" })}>Remove</button><button className="btn-danger min-h-8 rounded-lg px-2 text-[10px]" disabled={memberAction.isPending} onClick={() => memberAction.mutate({ id: member.user_id, action: "ban" })}>Ban</button></div>}</li>)}</ul>}
      {owner && <div className="mt-4 border-t border-line pt-4"><h3 className="text-sm font-bold text-fg">Transfer group ownership</h3><p className="mt-1 text-xs text-muted">You will become a moderator and may leave the group after the transfer.</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select className="input" value={newOwnerId} onChange={(event) => setNewOwnerId(event.target.value)}><option value="">Choose an active member</option>{members.data?.filter((member) => member.status === "active" && member.user_id !== me).map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name ?? member.profile?.username ?? "Student"}</option>)}</select><button className="btn min-h-10 rounded-xl px-4 font-bold" disabled={!newOwnerId || transferOwnership.isPending} onClick={() => { if (window.confirm("Transfer ownership to this member? You will become a moderator.")) transferOwnership.mutate(); }}>{transferOwnership.isPending ? "Transferring…" : "Transfer ownership"}</button></div>{transferOwnership.isError && <p role="alert" className="err mt-2">{(transferOwnership.error as Error).message}</p>}</div>}
      {memberAction.isError && <p role="alert" className="err mt-2">{(memberAction.error as Error).message}</p>}
    </section>}
    {manager && members.data?.some((member) => member.status === "banned") && <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"><h2 className="font-extrabold text-fg">Banned members</h2><ul className="mt-2 divide-y divide-line">{members.data.filter((member) => member.status === "banned").map((member) => <li key={member.user_id} className="flex items-center justify-between gap-3 py-2"><span className="text-sm">{member.profile?.display_name ?? member.profile?.username ?? "Student"}</span><button className="btn min-h-8 rounded-lg px-3 text-xs" disabled={memberAction.isPending} onClick={() => memberAction.mutate({ id: member.user_id, action: "unban" })}>Unban</button></li>)}</ul></section>}
  </div>;
}

function QuizCard({ quiz }: { quiz: GroupQuiz }) {
  const start = new Date(quiz.starts_at);
  return <Link to={`/app/group-quiz/quizzes/${quiz.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)]">
    <div className="flex items-start justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><BookOpenCheck size={17} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${quiz.status === "published" ? "bg-[#fff4f2] text-primary" : "bg-bg text-muted"}`}>{quiz.status}</span></div>
    <h3 className="mt-3 font-extrabold text-fg group-hover:text-primary">{quiz.title}</h3><p className="mt-1 line-clamp-2 text-sm text-muted">{quiz.description || "Ready for a focused practice session."}</p>
    <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted"><span className="inline-flex items-center gap-1"><Clock3 size={13} />{start.toLocaleString()}</span><span>{quiz.duration_minutes} min</span></p>
  </Link>;
}

function makeDefaultQuestion(): QuizQuestionDraft {
  return { prompt: "", explanation: "", options: ["", ""], correctIndex: -1 };
}

function localDateTime(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CreateGroupQuizPage() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const group = useQuery({ queryKey: ["quiz-group", groupId], queryFn: () => getQuizGroup(groupId), enabled: !!groupId });
  const members = useQuery({ queryKey: ["quiz-group-members", groupId], queryFn: () => listQuizGroupMembers(groupId), enabled: !!groupId });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(localDateTime(1));
  const [closesAt, setClosesAt] = useState(localDateTime(25));
  const [duration, setDuration] = useState(30);
  const [release, setRelease] = useState<GroupQuiz["answer_release"]>("after_close");
  const [releaseAt, setReleaseAt] = useState(localDateTime(26));
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([makeDefaultQuestion()]);
  const save = useMutation({
    mutationFn: () => {
      const start = new Date(startsAt);
      const close = closesAt ? new Date(closesAt) : null;
      const answerReleaseAt = release === "at_time" ? new Date(releaseAt) : null;
      if (Number.isNaN(start.getTime()) || (close && Number.isNaN(close.getTime())) || (answerReleaseAt && Number.isNaN(answerReleaseAt.getTime()))) {
        throw new Error("Choose valid quiz schedule times.");
      }
      const input = {
        groupId,
        title,
        description,
        startsAt: start.toISOString(),
        closesAt: close?.toISOString() ?? null,
        durationMinutes: Number(duration),
        answerRelease: release,
        answerReleaseAt: answerReleaseAt?.toISOString() ?? null,
        questions,
        publish: true,
      };
      const validationError = validateGroupQuiz(input);
      if (validationError) throw new Error(validationError);
      return saveGroupQuiz(input);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["group-quizzes", groupId] }); navigate(`/app/group-quiz/groups/${groupId}`); },
  });
  const changeQuestion = (index: number, patch: Partial<QuizQuestionDraft>) => setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch } : question));
  const isManager = members.data?.some((member) => member.user_id === session?.user.id
    && member.status === "active" && (member.role === "owner" || member.role === "moderator"));
  if (group.isLoading || members.isLoading) return <LoadingPanel label="Checking quiz publishing access" />;
  if (group.isError) return <p role="alert" className="err">Could not load this group: {(group.error as Error).message}</p>;
  if (members.isError) return <p role="alert" className="err">Could not check your group permissions: {(members.error as Error).message}</p>;
  if (!group.data) return <p className="card">This group is unavailable or not visible to your account.</p>;
  if (!isManager) return <section className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-6 text-center shadow-sm"><ShieldCheck className="mx-auto text-primary" size={24} /><h1 className="mt-3 text-lg font-black text-fg">Quiz publishing is for group managers</h1><p className="mt-2 text-sm text-muted">Only active group owners and moderators can publish quizzes.</p><Link className="btn-primary mt-4 inline-flex min-h-10 items-center rounded-xl px-4 font-bold" to={`/app/group-quiz/groups/${groupId}`}>Back to {group.data.name}</Link></section>;
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link to={`/app/group-quiz/groups/${groupId}`} className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />{group.data?.name ?? "Group"}</Link>
    <PageTitle eyebrow="New activity" title="Create a group quiz" description="Publishing makes this quiz visible to active group members right away. They can start it when the scheduled time arrives." />
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <section className="grid gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6">
        <label className="block sm:col-span-2"><span className="label">Quiz title</span><input className="input" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="label">Instructions</span><textarea className="input min-h-20" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="block"><span className="label">Starts at</span><input className="input" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
        <label className="block"><span className="label">Closes at</span><input className="input" type="datetime-local" required value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label>
        <label className="block"><span className="label">Time limit (minutes)</span><input className="input" type="number" min={1} max={240} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
        <label className="block"><span className="label">Answer and result release</span><select className="input" value={release} onChange={(event) => setRelease(event.target.value as GroupQuiz["answer_release"])}><option value="immediately">Immediately after submission</option><option value="after_close">After the quiz closes</option><option value="at_time">At a scheduled time</option></select></label>
        {release === "at_time" && <label className="block sm:col-span-2"><span className="label">Release time</span><input className="input" type="datetime-local" required value={releaseAt} onChange={(event) => setReleaseAt(event.target.value)} /></label>}
      </section>
      {questions.map((question, index) => <section key={index} className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-extrabold text-fg">Question {index + 1}</h2>{questions.length > 1 && <button type="button" className="text-xs font-bold text-danger" onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}>Remove</button>}</div>
        <label className="block"><span className="label">Question</span><textarea className="input min-h-20" required maxLength={2000} value={question.prompt} onChange={(event) => changeQuestion(index, { prompt: event.target.value })} /></label>
        <fieldset className="space-y-2"><legend className="label">Answer options · select the correct answer</legend>{question.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2">
          <input type="radio" name={`correct-${index}`} aria-label={`Mark option ${optionIndex + 1} correct`} checked={question.correctIndex === optionIndex} onChange={() => changeQuestion(index, { correctIndex: optionIndex })} />
          <input className="input" aria-label={`Question ${index + 1} option ${optionIndex + 1}`} required maxLength={500} value={option} onChange={(event) => changeQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? event.target.value : value) })} />
          {question.options.length > 2 && <button type="button" aria-label={`Remove option ${optionIndex + 1}`} className="rounded-lg p-2 text-muted hover:bg-bg" onClick={() => changeQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex), correctIndex: question.correctIndex === optionIndex ? -1 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex })}>×</button>}
        </div>)}
          {question.options.length < 6 && <button type="button" className="text-xs font-bold text-primary hover:underline" onClick={() => changeQuestion(index, { options: [...question.options, ""] })}>Add option</button>}
        </fieldset>
        <label className="block"><span className="label">Explanation <span className="font-normal text-muted">(optional, shown when answers release)</span></span><textarea className="input min-h-16" maxLength={2000} value={question.explanation} onChange={(event) => changeQuestion(index, { explanation: event.target.value })} /></label>
      </section>)}
      <button type="button" className="btn min-h-10 rounded-xl px-4 font-bold" disabled={questions.length >= 100} onClick={() => setQuestions((current) => [...current, makeDefaultQuestion()])}><Plus size={15} className="mr-1 inline" />Add question</button>
      <p className="rounded-xl bg-[#fff9f8] p-3 text-xs leading-5 text-muted">The quiz will be published live after validation. Group members see it immediately, but the server enforces the start time, closing time and answer-release schedule.</p>
      {save.isError && <p role="alert" className="err">{(save.error as Error).message}</p>}
      <div className="flex justify-end"><button className="btn-primary min-h-11 w-full rounded-xl px-5 font-bold sm:w-auto" disabled={save.isPending || group.isLoading}>{save.isPending ? "Publishing quiz…" : "Publish quiz"}</button></div>
    </form>
  </div>;
}

export function GroupQuizDetailsPage() {
  const { quizId = "" } = useParams();
  const navigate = useNavigate();
  const quiz = useQuery({ queryKey: ["group-quiz", quizId], queryFn: () => getGroupQuiz(quizId), enabled: !!quizId });
  const start = useMutation({ mutationFn: () => startGroupQuiz(quizId), onSuccess: (attempt) => navigate(`/app/group-quiz/attempts/${attempt.attempt_id}`) });
  const startDate = quiz.data ? new Date(quiz.data.starts_at) : null;
  const closed = !!quiz.data?.closes_at && new Date(quiz.data.closes_at).getTime() <= Date.now();
  const notStarted = !!startDate && startDate.getTime() > Date.now();
  return <div className="mx-auto max-w-2xl space-y-5">
    <Link to="/app/group-quiz" className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />Group Quiz</Link>
    {quiz.isLoading ? <LoadingPanel label="Loading quiz" /> : quiz.isError ? <p role="alert" className="err">Could not load this quiz: {(quiz.error as Error).message}</p> : !quiz.data ? <p className="card">This quiz is unavailable to your account.</p> : <>
      <section className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-7">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Group quiz</p><h1 className="text-2xl font-black text-fg sm:text-3xl">{quiz.data.title}</h1>
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{quiz.data.description || "No additional instructions."}</p>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#fff9f8] p-4 text-sm"><div><span className="block text-xs text-muted">Starts</span><b>{startDate?.toLocaleString()}</b></div><div><span className="block text-xs text-muted">Time limit</span><b>{quiz.data.duration_minutes} minutes</b></div><div><span className="block text-xs text-muted">Closes</span><b>{quiz.data.closes_at ? new Date(quiz.data.closes_at).toLocaleString() : "No closing time"}</b></div><div><span className="block text-xs text-muted">Answer release</span><b>{quiz.data.answer_release.replace("_", " ")}</b></div></div>
        <p className="text-xs leading-5 text-muted">One attempt per student. Your answers are graded securely after you submit.</p>
        {quiz.data.status === "published" && <button className="btn-primary min-h-11 w-full rounded-xl px-5 font-bold sm:w-auto" disabled={start.isPending || notStarted || closed} onClick={() => start.mutate()}>{start.isPending ? "Starting…" : notStarted ? "Quiz has not started yet" : closed ? "Quiz closed" : "Start quiz"}</button>}
        {start.isError && <p role="alert" className="err">{(start.error as Error).message}</p>}
      </section>
      <div className="flex flex-wrap gap-2"><Link className="btn min-h-10 rounded-xl px-4" to={`/app/group-quiz/quizzes/${quizId}/performance`}>Creator performance</Link></div>
    </>}
  </div>;
}

function useQuizCountdown(attempt: { started_at: string; duration_minutes: number; closes_at: string | null } | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => {
    if (!attempt) return 0;
    const end = new Date(attempt.started_at).getTime() + attempt.duration_minutes * 60_000;
    const close = attempt.closes_at ? new Date(attempt.closes_at).getTime() : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.ceil((Math.min(end, close) - now) / 1000));
  }, [attempt, now]);
}

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function GroupQuizAttemptPage() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const attempt = useQuery({ queryKey: ["quiz-attempt", attemptId], queryFn: () => getGroupQuizAttempt(attemptId), enabled: !!attemptId });
  const quiz = useQuery({ queryKey: ["group-quiz", attempt.data?.quiz_id], queryFn: () => getGroupQuiz(attempt.data!.quiz_id), enabled: !!attempt.data?.quiz_id });
  const questions = useQuery({ queryKey: ["group-quiz-questions", attempt.data?.quiz_id], queryFn: () => listGroupQuizQuestions(attempt.data!.quiz_id), enabled: !!attempt.data?.quiz_id });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const seconds = useQuizCountdown(attempt.data ?? undefined);
  const submit = useMutation({
    mutationFn: () => submitGroupQuiz(attemptId, (questions.data ?? []).map((question) => ({ question_id: question.id, selected_option_id: answers[question.id] ?? null }))),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["quiz-attempt", attemptId] }); navigate(`/app/group-quiz/attempts/${attemptId}/results`); },
  });
  useEffect(() => {
    if (seconds === 0 && attempt.data && !attempt.data.submitted_at && questions.data?.length && !submit.isPending && !submit.isError) {
      submit.mutate();
    }
  }, [attempt.data, questions.data, seconds, submit.isError, submit.isPending, submit.mutate]);
  if (attempt.isLoading || questions.isLoading) return <LoadingPanel label="Preparing your quiz" />;
  if (attempt.isError || questions.isError) return <p role="alert" className="err">Could not load this quiz attempt.</p>;
  if (!attempt.data || !questions.data?.length) return <p className="card">This attempt is unavailable or no longer active.</p>;
  if (attempt.data.submitted_at) return <div className="space-y-4"><p className="card">This quiz has already been submitted.</p><Link className="btn-primary inline-flex min-h-10 items-center rounded-xl px-4 font-bold" to={`/app/group-quiz/attempts/${attemptId}/results`}>View results</Link></div>;
  return <div className="mx-auto max-w-3xl space-y-4">
    <header className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-4 shadow-sm backdrop-blur"><div><p className="text-xs font-bold text-primary">Quiz in progress</p><h1 className="font-extrabold text-fg">{quiz.data?.title ?? "Group Quiz"}</h1></div><div role="timer" aria-label="Time remaining" className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 font-black tabular-nums ${seconds < 60 ? "bg-[#fff1ef] text-danger" : "bg-[#fff9f8] text-fg"}`}><Clock3 size={16} />{formatCountdown(seconds)}</div></header>
    <p className="text-sm text-muted">Your progress is local until you submit. Keep this page open; the server enforces the time limit.</p>
    {questions.data.map((question, index) => <fieldset key={question.id} className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6"><legend className="font-extrabold text-fg">Question {index + 1} of {questions.data!.length}</legend><p className="whitespace-pre-wrap text-sm leading-6 text-fg">{question.prompt}</p><div className="space-y-2">{question.options.map((option) => <label key={option.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${answers[question.id] === option.id ? "border-primary bg-[#fff7f6]" : "border-line hover:bg-[#fff9f8]"}`}><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} />{option.option_text}</label>)}</div></fieldset>)}
    {submit.isError && <p role="alert" className="err">{(submit.error as Error).message}</p>}
    <button className="btn-primary min-h-11 w-full rounded-xl font-bold sm:w-auto sm:px-6" disabled={submit.isPending || seconds === 0} onClick={() => { if (window.confirm("Submit your answers now? You cannot edit them after submission.")) submit.mutate(); }}>{submit.isPending ? "Submitting…" : seconds === 0 ? "Time is up — submitting…" : "Submit quiz"}</button>
  </div>;
}

export function GroupQuizResultPage() {
  const { attemptId = "" } = useParams();
  const attempt = useQuery({ queryKey: ["quiz-attempt", attemptId], queryFn: () => getGroupQuizAttempt(attemptId), enabled: !!attemptId });
  const result = useQuery({ queryKey: ["quiz-result", attemptId], queryFn: () => getGroupQuizAttemptResult(attemptId), enabled: !!attemptId, refetchInterval: (query) => query.state.data?.length ? false : 30_000 });
  if (attempt.isLoading || result.isLoading) return <LoadingPanel label="Loading quiz results" />;
  if (attempt.isError || result.isError) return <p role="alert" className="err">Could not load your quiz result.</p>;
  if (!attempt.data) return <p className="card">This attempt is unavailable.</p>;
  if (!attempt.data.submitted_at) return <p className="card">This quiz has not been submitted.</p>;
  if (!result.data?.length) return <section className="rounded-2xl border border-line bg-white p-6 text-center shadow-sm"><Clock3 className="mx-auto text-primary" /><h1 className="mt-3 text-xl font-black text-fg">Results are not released yet</h1><p className="mt-2 text-sm text-muted">Your submission is saved. The quiz creator's release schedule controls when answers and scores become visible.</p></section>;
  const first = result.data[0]!;
  return <div className="mx-auto max-w-3xl space-y-5">
    <PageTitle eyebrow="Quiz review" title={first.quiz_title} description={`Submitted ${new Date(first.submitted_at).toLocaleString()}.`} />
    <section className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-4 sm:p-6"><Score label="Score" value={`${first.score}/${result.data.length}`} /><Score label="Percentage" value={`${first.percentage}%`} /><Score label="Correct" value={String(first.correct_count)} /><Score label="Missed" value={String(first.incorrect_count + first.unanswered_count)} /></section>
    <h2 className="text-lg font-black text-fg">Answer review</h2>
    {result.data.map((row, index) => <section key={row.question_id} className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="font-bold text-fg">{index + 1}. {row.prompt}</p><p className={`text-sm font-semibold ${row.is_correct ? "text-primary" : "text-danger"}`}>{row.is_correct ? "Correct" : row.selected_option_id ? "Incorrect" : "Unanswered"}</p>{row.explanation && <p className="text-sm leading-5 text-muted">{row.explanation}</p>}</section>)}
    <Link to="/app/group-quiz" className="btn inline-flex min-h-10 items-center rounded-xl px-4">Back to Group Quiz</Link>
  </div>;
}

function Score({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#fff9f8] p-3 text-center"><span className="block text-xs text-muted">{label}</span><b className="mt-1 block text-lg font-black text-fg">{value}</b></div>;
}

export function GroupQuizPerformancePage() {
  const { quizId = "" } = useParams();
  const quiz = useQuery({ queryKey: ["group-quiz", quizId], queryFn: () => getGroupQuiz(quizId), enabled: !!quizId });
  const performance = useQuery({ queryKey: ["group-quiz-performance", quizId], queryFn: () => getGroupQuizPerformance(quizId), enabled: !!quizId });
  const leaderboard = useQuery({ queryKey: ["group-quiz-leaderboard", quizId], queryFn: () => getGroupQuizLeaderboard(quizId), enabled: !!quizId });
  if (quiz.isLoading || performance.isLoading || leaderboard.isLoading) return <LoadingPanel label="Loading quiz performance" />;
  if (quiz.isError || performance.isError || leaderboard.isError) return <p role="alert" className="err">Performance data is available only to group managers.</p>;
  if (!quiz.data) return <p className="card">Quiz not found.</p>;
  const roster = performance.data ?? [];
  const started = roster.filter((member) => member.attempt_id);
  const submitted = roster.filter((member) => member.submitted_at);
  return <div className="space-y-5">
    <Link to={`/app/group-quiz/quizzes/${quizId}`} className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />{quiz.data.title}</Link>
    <PageTitle eyebrow="Group manager dashboard" title="Quiz performance" description="All active group members are listed, including students who have not started yet." />
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Score label="Active members" value={String(roster.length)} /><Score label="Started" value={String(started.length)} /><Score label="Submitted" value={String(submitted.length)} /><Score label="Not started" value={String(roster.length - started.length)} /></section>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><h2 className="border-b border-line p-4 font-extrabold text-fg">Participants</h2><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#fff9f8] text-xs text-muted"><tr><th className="p-3">Student</th><th className="p-3">Status</th><th className="p-3">Score</th><th className="p-3">Correct / incorrect / missed</th><th className="p-3">Submitted</th></tr></thead><tbody className="divide-y divide-line">{roster.map((member) => <tr key={member.user_id}><td className="p-3">{member.display_name || member.username}</td><td className="p-3">{member.submitted_at ? "Submitted" : member.attempt_id ? "Started" : "Not started"}</td><td className="p-3">{member.score === null ? "—" : `${member.score} (${member.percentage}%)`}</td><td className="p-3">{member.submitted_at ? `${member.correct_count} / ${member.incorrect_count} / ${member.unanswered_count}` : "—"}</td><td className="p-3">{member.submitted_at ? new Date(member.submitted_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm"><h2 className="font-extrabold text-fg">Leaderboard</h2>{leaderboard.data?.length ? <ol className="mt-2 divide-y divide-line">{leaderboard.data.map((student, index) => <li key={student.user_id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{index + 1}. {student.display_name}</span><b>{student.score} · {student.percentage}%</b></li>)}</ol> : <p className="mt-2 text-sm text-muted">No released submissions yet.</p>}</section>
  </div>;
}
