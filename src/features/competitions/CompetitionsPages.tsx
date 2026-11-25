import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Plus, Trophy } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { FeatureDialog } from "@/components/FeatureDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  completeCompetition, createCompetition, getMyCompetitionRegistration, inviteCompetitionTeammate,
  listCompetitionInstitutions, listCompetitions, moderateCompetition, registerForCompetition, respondToCompetitionTeamInvite,
  scoreCompetitionEntry, submitCompetitionEntry, uploadCompetitionAsset, type Competition,
  type CompetitionListItem,
} from "./api";
import { supabase } from "@/lib/supabase";

const card = "rounded-2xl border border-line bg-white p-4 shadow-sm";
const categories = ["coding", "hackathon", "business", "research", "debate", "quiz", "design", "science", "writing", "other"];
const human = (s: string) => s.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export function CompetitionsPage() {
  const [query, setQuery] = useState("");
  const [queryTerm, setQueryTerm] = useState("");
  const [category, setCategory] = useState("");
  const [create, setCreate] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setQueryTerm(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const rows = useQuery({ queryKey: ["competitions", queryTerm, category], queryFn: () => listCompetitions(queryTerm, category) });
  const now = Date.now();
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Across campuses</p><h1 className="mt-1 text-3xl font-black">Competitions</h1><p className="mt-1 text-sm text-muted">Find your next challenge, build a team and showcase your work.</p></div>
      <button className="btn-primary inline-flex items-center gap-2" onClick={() => setCreate(true)}><Plus size={16} /> Propose competition</button></header>
    <section className="rounded-3xl bg-gradient-to-br from-primary-deep via-primary to-primary-hover p-6 text-white sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-white/85">Compete. Create. Connect.</p>
      <h2 className="mt-2 max-w-2xl text-2xl font-black sm:text-3xl">Big ideas deserve a bigger arena.</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">Discover verified competitions and opportunities across Nigerian institutions.</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-[1fr,220px]">
      <input className="input min-w-0" aria-label="Search competitions" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search competitions" />
      <select className="input min-w-0" aria-label="Filter competition category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((x) => <option value={x} key={x}>{human(x)}</option>)}</select>
    </div>
    {rows.isLoading && <LoadingState label="Finding competitions" variant="panel" />}
    {rows.isError && <p role="alert" className="err">Could not load competitions. Please try again.</p>}
    {rows.data?.length === 0 && <div className={`${card} py-12 text-center`}><Trophy className="mx-auto text-primary" /><h2 className="mt-3 font-bold">No verified competitions listed</h2><p className="mt-1 text-sm text-muted">Check back soon or propose a new competition for review.</p></div>}
    <div className="grid gap-4 md:grid-cols-2">{rows.data?.map((row) => <CompetitionCard key={row.id} competition={row} now={now} />)}</div>
    {create && <CreateCompetitionDialog onClose={() => setCreate(false)} />}
  </div>;
}

function CompetitionCard({ competition: c, now }: { competition: CompetitionListItem; now: number }) {
  const closesSoon = new Date(c.registration_closes_at).getTime() - now < 7 * 86400000;
  return <article className={`${card} flex flex-col gap-3`}>
    <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-[#edf6fc] px-2.5 py-1 text-xs font-bold text-[#23627d]">{human(c.category)}</span><span className={`text-xs font-semibold ${closesSoon ? "text-primary" : "text-muted"}`}>{human(c.status)}</span></div>
    <div><h2 className="text-lg font-extrabold"><Link className="hover:text-primary" to={`/app/competitions/${c.id}`}>{c.name}</Link></h2><p className="mt-1 line-clamp-3 text-sm leading-6 text-muted">{c.description}</p></div>
    <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
      <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> Starts {new Date(c.starts_at).toLocaleDateString()}</span>
      <span>{c.participation_type === "individual" ? "Individual" : `Teams up to ${c.max_team_size}`}</span>
      {closesSoon && <span className="font-bold text-primary">Registration closing soon</span>}
    </div>
  </article>;
}

function CreateCompetitionDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [participatingInstitutions, setParticipatingInstitutions] = useState<string[]>([]);
  const institutions = useQuery({ queryKey: ["competition-institutions"], queryFn: listCompetitionInstitutions });
  const create = useMutation({ mutationFn: createCompetition, onSuccess: async (id) => {
    await qc.invalidateQueries({ queryKey: ["competitions"] }); onClose(); nav(`/app/competitions/${id}`);
  }, onError: (e: Error) => setError(e.message) });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const form = new FormData(e.currentTarget);
    create.mutate({
      name: String(form.get("name")), description: String(form.get("description")), category: String(form.get("category")),
      rules: String(form.get("rules") ?? ""), eligibility: String(form.get("eligibility") ?? ""), institutionId: null,
      participatingInstitutions, participationType: String(form.get("participationType")),
      maxTeamSize: Number(form.get("maxTeamSize")), registrationOpens: asIso(String(form.get("registrationOpens"))),
      registrationCloses: asIso(String(form.get("registrationCloses")), true), starts: asIso(String(form.get("starts"))),
      ends: asIso(String(form.get("ends")), true), submissionDeadline: String(form.get("submissionDeadline")) ? asIso(String(form.get("submissionDeadline")), true) : null,
      prizes: String(form.get("prizes") ?? ""),
    });
  }
  return <Dialog title="Propose a competition" onClose={onClose}><form onSubmit={submit} className="space-y-3">
    <Field name="name" label="Competition name" required maxLength={160} />
    <Field name="description" label="Description" required textarea maxLength={6000} />
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField name="category" label="Category" options={categories} />
      <SelectField name="participationType" label="Participation" options={["individual", "team", "both"]} />
      <Field name="maxTeamSize" label="Maximum team size" type="number" defaultValue="4" min="1" max="20" required />
      <Field name="eligibility" label="Eligibility" textarea maxLength={2000} />
      <Field name="registrationOpens" label="Registration opens" type="datetime-local" required />
      <Field name="registrationCloses" label="Registration closes" type="datetime-local" required />
      <Field name="starts" label="Competition starts" type="datetime-local" required />
      <Field name="ends" label="Competition ends" type="datetime-local" required />
      <Field name="submissionDeadline" label="Submission deadline" type="datetime-local" />
      <Field name="prizes" label="Prizes and rewards" maxLength={2000} />
    </div>
    <Field name="rules" label="Competition rules" textarea maxLength={5000} />
    <label className="block"><span className="label">Eligible institutions (optional)</span>
      <select className="input min-h-32 min-w-0 max-w-full" multiple value={participatingInstitutions} onChange={(e) => setParticipatingInstitutions(Array.from(e.target.selectedOptions, (option) => option.value))}>
        {institutions.data?.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
      </select>
      {institutions.isError && <span className="err">Could not load institutions. Retry before restricting eligibility.</span>}
      <span className="mt-1 block text-xs text-muted">Leave empty to allow students from any institution. Your organizer institution comes from your profile.</span>
    </label>
    <p className="rounded-xl bg-[#fff7e6] p-3 text-xs leading-5 text-[#73551e]">Competition proposals are private until an administrator verifies the organiser and approves publication. Do not claim university sponsorship without authorization.</p>
    {error && <p role="alert" className="err">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={create.isPending}>{create.isPending ? "Submitting…" : "Submit for review"}</button></div>
  </form></Dialog>;
}

export function CompetitionDetailsPage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryFile, setEntryFile] = useState<File | null>(null);
  const [teammateId, setTeammateId] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const comp = useQuery({ queryKey: ["competition", id], queryFn: async () => {
    const { data, error } = await supabase.from("competitions").select("*").eq("id", id).maybeSingle();
    if (error) throw error; return data as Competition | null;
  } });
  const registrations = useQuery({ queryKey: ["competition-registrations", id], enabled: !!id && comp.data?.organizer_id === session?.user.id, queryFn: async () => {
    const { data, error } = await supabase.from("competition_registrations").select("id,user_id,team_name,status,created_at").eq("competition_id", id).order("created_at");
    if (error) throw error; return data ?? [];
  } });
  const myRegistration = useQuery({ queryKey: ["competition-my-registration", id, session?.user.id], enabled: !!id && !!session, queryFn: async () => {
    const data = await getMyCompetitionRegistration(id); return data[0] ?? null;
  } });
  const teamInvites = useQuery({ queryKey: ["competition-team-invites", id, session?.user.id], enabled: !!id && !!session, queryFn: async () => {
    const { data, error } = await supabase.from("competition_team_invitations")
      .select("id,registration_id,inviter_id,created_at,competition_registrations!inner(competition_id)")
      .eq("invitee_id", session!.user.id).eq("status", "pending").eq("competition_registrations.competition_id", id);
    if (error) throw error; return data ?? [];
  } });
  const submissions = useQuery({ queryKey: ["competition-submissions", id], enabled: !!id && (!!session && (comp.data?.organizer_id === session.user.id || comp.data?.status === "completed")), queryFn: async () => {
    const { data, error } = await supabase.from("competition_submissions").select("id,registration_id,submitted_by,title,description,asset_path,score,rank,judge_feedback,submitted_at").eq("competition_id", id).order("rank", { ascending: true });
    if (error) throw error; return data ?? [];
  } });
  const register = useMutation({ mutationFn: () => registerForCompetition(id, teamName.trim() || null), onSuccess: async () => {
    setStatusMessage("Registration confirmed."); await qc.invalidateQueries({ queryKey: ["competition-my-registration", id] });
  }, onError: (e: Error) => setStatusMessage(e.message) });
  const submit = useMutation({ mutationFn: async () => {
    const assetPath = entryFile ? await uploadCompetitionAsset(id, entryFile) : null;
    return submitCompetitionEntry(id, entryTitle, entryDescription, assetPath);
  }, onSuccess: async () => {
    setEntryTitle(""); setEntryDescription(""); setEntryFile(null); setStatusMessage("Your entry was submitted.");
    await qc.invalidateQueries({ queryKey: ["competition-submissions", id] });
  }, onError: (e: Error) => setStatusMessage(e.message) });
  const announcement = useMutation({ mutationFn: async (body: string) => {
    const { error } = await supabase.from("competition_announcements").insert({ competition_id: id, body }); if (error) throw error;
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["competition-announcements", id] }); },
    onError: (error: Error) => setStatusMessage(error.message) });
  const announcements = useQuery({ queryKey: ["competition-announcements", id], enabled: !!id && !!comp.data, queryFn: async () => {
    const { data, error } = await supabase.from("competition_announcements").select("id,body,created_at").eq("competition_id", id).order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  } });
  const inviteTeam = useMutation({ mutationFn: () => inviteCompetitionTeammate(myRegistration.data!.registration_id, teammateId.trim()), onSuccess: () => { setTeammateId(""); setStatusMessage("Teammate invited."); }, onError: (e: Error) => setStatusMessage(e.message) });
  const respondInvite = useMutation({ mutationFn: ({ invitationId, accept }: { invitationId: string; accept: boolean }) => respondToCompetitionTeamInvite(invitationId, accept), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["competition-team-invites", id] }); await qc.invalidateQueries({ queryKey: ["competition-my-registration", id] });
  }, onError: (e: Error) => setStatusMessage(e.message) });
  const score = useMutation({ mutationFn: ({ submissionId, value, rank }: { submissionId: string; value: number; rank: number | null }) => scoreCompetitionEntry(submissionId, value, rank, ""), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["competition-submissions", id] });
  }, onError: (e: Error) => setStatusMessage(e.message) });
  const complete = useMutation({ mutationFn: () => completeCompetition(id), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["competition", id] }); await qc.invalidateQueries({ queryKey: ["competition-submissions", id] });
  }, onError: (e: Error) => setStatusMessage(e.message) });
  const report = useMutation({ mutationFn: async () => {
    const { error } = await supabase.from("competition_reports").insert({ competition_id: id, reason: reportReason.trim() });
    if (error) throw error;
  }, onSuccess: () => { setReportReason(""); setStatusMessage("Report sent to moderators."); }, onError: (e: Error) => setStatusMessage(e.message) });

  if (comp.isLoading) return <LoadingState label="Loading competition" variant="panel" />;
  if (comp.isError || !comp.data) return <p role="alert" className="err">This competition is unavailable or still awaiting review.</p>;
  const c = comp.data;
  const organizer = c.organizer_id === session?.user.id;
  const time = Date.now();
  const canRegister = c.verification_status === "approved" && ["upcoming", "registration_open"].includes(c.status)
    && new Date(c.registration_opens_at).getTime() <= time && new Date(c.registration_closes_at).getTime() > time;
  const canSubmit = myRegistration.data && c.verification_status === "approved"
    && new Date(c.starts_at).getTime() <= time && new Date(c.ends_at).getTime() >= time
    && (!c.submission_deadline || new Date(c.submission_deadline).getTime() >= time);
  return <div className="space-y-4">
    <Link to="/app/competitions" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary"><ArrowLeft size={16} /> Competitions</Link>
    {c.verification_status === "pending" && <div className="rounded-xl bg-[#fff7e6] p-3 text-sm text-[#73551e]">Pending verification. Only you can see this proposal until it is approved.</div>}
    <section className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wider text-primary">{human(c.category)} · {human(c.status)}</span><h1 className="mt-1 text-2xl font-black">{c.name}</h1></div>
        {c.verification_status === "approved" && <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">Verified listing</span>}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{c.description}</p>
      <div className="grid gap-2 text-sm sm:grid-cols-2"><Info label="Registration closes" value={new Date(c.registration_closes_at).toLocaleString()} /><Info label="Competition dates" value={`${new Date(c.starts_at).toLocaleDateString()} – ${new Date(c.ends_at).toLocaleDateString()}`} /><Info label="Format" value={c.participation_type === "individual" ? "Individual" : `Team (up to ${c.max_team_size})`} /><Info label="Prizes" value={c.prizes || "Details to be announced"} /></div>
      {c.eligibility && <p className="rounded-xl bg-bg p-3 text-sm"><strong>Eligibility:</strong> {c.eligibility}</p>}
      {c.rules && <details className="rounded-xl bg-bg p-3 text-sm"><summary className="cursor-pointer font-bold">Competition rules</summary><p className="mt-2 whitespace-pre-wrap">{c.rules}</p></details>}
    </section>
    {statusMessage && <p role="status" className="text-sm text-primary">{statusMessage}</p>}
    {canRegister && !myRegistration.data && <section className={card}><h2 className="font-bold">Join the competition</h2>
      {c.participation_type !== "individual" && <label className="mt-2 block"><span className="label">Team name</span><input className="input" maxLength={100} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Name your team" /></label>}
      <button className="btn-primary mt-3" disabled={register.isPending || (c.participation_type !== "individual" && !teamName.trim())} onClick={() => register.mutate()}>{register.isPending ? "Registering…" : "Register"}</button>
    </section>}
    {canSubmit && <section className={card}>
      <h2 className="font-bold">Submit your entry</h2><div className="mt-2 grid gap-2 sm:grid-cols-2"><input className="input" aria-label="Entry title" maxLength={160} value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)} placeholder="Entry title" /><input className="input" aria-label="Entry description" maxLength={3000} value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} placeholder="Short description" /></div>
      <label className="mt-2 block"><span className="label">Optional supporting file (10 MB max)</span><input className="input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.zip" onChange={(e) => setEntryFile(e.target.files?.[0] ?? null)} /></label>
      <button className="btn-primary mt-2" disabled={submit.isPending || !entryTitle.trim()} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit entry"}</button>
    </section>}
    {organizer && <section className={card}><h2 className="font-bold">Participants ({registrations.data?.length ?? 0})</h2>
      {registrations.isError && <p role="alert" className="err">Could not load registrations.</p>}
      <ul className="mt-2 space-y-1 text-sm">{registrations.data?.map((r) => <li className="rounded-lg bg-bg px-3 py-2" key={r.id}>{r.team_name || "Individual"} · Participant {r.user_id.slice(0, 8)} · {r.status}</li>)}</ul>
      <h3 className="mt-4 font-bold">Entries and judging</h3>
      {submissions.data?.map((entry) => <SubmissionScore key={entry.id} entry={entry} onScore={(value, rank) => score.mutate({ submissionId: entry.id, value, rank })} />)}
      {c.status !== "completed" && new Date(c.ends_at).getTime() <= time && <button className="btn-primary mt-3" disabled={complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? "Publishing…" : "Complete competition and publish results"}</button>}
      <AnnouncementForm onSubmit={(body) => announcement.mutate(body)} busy={announcement.isPending} />
    </section>}
    {myRegistration.data?.team_role === "captain" && <section className={card}><h2 className="font-bold">Invite a teammate</h2><div className="mt-2 flex gap-2"><input className="input" aria-label="Teammate user ID" value={teammateId} onChange={(e) => setTeammateId(e.target.value)} placeholder="Student user ID" /><button className="btn" disabled={inviteTeam.isPending || !teammateId.trim()} onClick={() => inviteTeam.mutate()}>Invite</button></div></section>}
    {teamInvites.data?.map((invitation) => <section key={invitation.id} className={card}><p className="text-sm">You have a team invitation for this competition.</p><div className="mt-2 flex gap-2"><button className="btn-primary" onClick={() => respondInvite.mutate({ invitationId: invitation.id, accept: true })}>Accept</button><button className="btn" onClick={() => respondInvite.mutate({ invitationId: invitation.id, accept: false })}>Decline</button></div></section>)}
    {(organizer || c.status === "completed") && submissions.data?.length ? <section className={card}><h2 className="font-bold">Results and entries</h2>{submissions.data.map((entry) => <SubmissionScore key={entry.id} entry={entry} />)}</section> : null}
    <section className={card}><h2 className="font-bold">Report a concern</h2><p className="mt-1 text-xs text-muted">Reports are sent to the moderation team and are not shown to the organizer.</p><div className="mt-2 flex gap-2"><input className="input" aria-label="Report reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)} maxLength={1000} placeholder="Describe the issue (5–1000 characters)" /><button className="btn" disabled={report.isPending || reportReason.trim().length < 5} onClick={() => report.mutate()}>Report</button></div></section>
    <section className={card}><h2 className="font-bold">Organizer updates</h2>{announcements.isError && <p role="alert" className="err">Could not load updates.</p>}
      {!announcements.data?.length && <p className="mt-2 text-sm text-muted">No announcements yet.</p>}
      {announcements.data?.map((a) => <p key={a.id} className="mt-2 whitespace-pre-wrap rounded-xl bg-bg p-3 text-sm">{a.body}</p>)}
    </section>
  </div>;
}

function SubmissionScore({ entry, onScore }: { entry: { id: string; title: string; description: string; asset_path: string | null; score: number | null; rank: number | null; judge_feedback: string | null; submitted_at: string }; onScore?: (score: number, rank: number | null) => void }) {
  const [scoreValue, setScoreValue] = useState(entry.score?.toString() ?? "");
  const [rank, setRank] = useState(entry.rank?.toString() ?? "");
  const [fileUrl, setFileUrl] = useState("");
  useEffect(() => {
    if (!entry.asset_path) return;
    void supabase.storage.from("competition-assets").createSignedUrl(entry.asset_path, 300).then(({ data, error }) => {
      if (!error && data?.signedUrl) setFileUrl(data.signedUrl);
    });
  }, [entry.asset_path]);
  return <article className="mt-2 rounded-xl border border-line p-3"><h4 className="font-bold">{entry.title}</h4><p className="mt-1 text-sm text-muted">{entry.description}</p>
    {fileUrl && <a className="mt-1 inline-block text-sm font-bold text-primary underline" href={fileUrl} target="_blank" rel="noreferrer">Open supporting file</a>}
    {entry.score !== null && <p className="mt-2 text-sm">Score: {entry.score} · Rank: {entry.rank ?? "—"} {entry.judge_feedback && `· ${entry.judge_feedback}`}</p>}
    {onScore && <div className="mt-2 flex flex-wrap gap-2"><input className="input w-24" aria-label={`Score for ${entry.title}`} type="number" min="0" max="100000" value={scoreValue} onChange={(e) => setScoreValue(e.target.value)} placeholder="Score" /><input className="input w-24" aria-label={`Rank for ${entry.title}`} type="number" min="1" max="1000" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Rank" /><button className="btn" disabled={!scoreValue || Number(scoreValue) < 0} onClick={() => onScore(Number(scoreValue), rank ? Number(rank) : null)}>Save score</button></div>}
  </article>;
}

export function CompetitionReviewPage() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ["competition-review"], queryFn: async () => {
    const { data, error } = await supabase.from("competitions").select("*").eq("verification_status", "pending").order("created_at");
    if (error) throw error; return (data ?? []) as Competition[];
  } });
  const review = useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => moderateCompetition(id, approve), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["competition-review"] }); await qc.invalidateQueries({ queryKey: ["competitions"] });
  } });
  return <div className="space-y-4"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Moderation</p><h1 className="text-2xl font-black">Competition verification</h1></div>
    {pending.isLoading && <LoadingState label="Loading proposals" variant="panel" />}
    {pending.isError && <p role="alert" className="err">Could not load competition proposals.</p>}
    {!pending.isLoading && !pending.data?.length && <p className={card}>No competitions are waiting for review.</p>}
    {pending.data?.map((c) => <article className={`${card} space-y-2`} key={c.id}><h2 className="font-bold">{c.name}</h2><p className="text-sm text-muted">{c.category} · Organizer {c.organizer_id.slice(0, 8)}</p><p className="text-sm">{c.description}</p><p className="text-xs text-muted">Review for false sponsorship claims and eligibility. No institutional endorsement is implied by listing.</p>
      <div className="flex gap-2"><button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: c.id, approve: true })}>Verify and publish</button><button className="btn" disabled={review.isPending} onClick={() => review.mutate({ id: c.id, approve: false })}>Reject</button></div>
    </article>)}
  </div>;
}

function AnnouncementForm({ onSubmit, busy }: { onSubmit: (body: string) => void; busy: boolean }) {
  const [body, setBody] = useState("");
  return <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) { onSubmit(body.trim()); setBody(""); } }}>
    <input className="input" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} aria-label="New announcement" placeholder="Post an update…" />
    <button className="btn" disabled={busy || !body.trim()}>Post</button>
  </form>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <FeatureDialog title={title} onClose={onClose}>{children}</FeatureDialog>;
}
function Field({ name, label, type = "text", required = false, maxLength, textarea = false, defaultValue, min, max }: { name: string; label: string; type?: string; required?: boolean; maxLength?: number; textarea?: boolean; defaultValue?: string; min?: string; max?: string }) {
  return <label className="block"><span className="label">{label}</span>{textarea
    ? <textarea name={name} className="input" rows={3} required={required} maxLength={maxLength} defaultValue={defaultValue} />
    : <input name={name} className="input" type={type} required={required} maxLength={maxLength} defaultValue={defaultValue} min={min} max={max} />}</label>;
}
function SelectField({ name, label, options }: { name: string; label: string; options: string[] }) {
  return <label className="block"><span className="label">{label}</span><select name={name} className="input">{options.map((x) => <option key={x} value={x}>{human(x)}</option>)}</select></label>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <p className="rounded-xl bg-bg p-3"><span className="block text-xs font-semibold text-muted">{label}</span><span>{value}</span></p>;
}
function asIso(value: string, endOfMinute = false) {
  return new Date(`${value}${endOfMinute ? ":59" : ""}`).toISOString();
}
