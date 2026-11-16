import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Radio, Users, Hand, Send, PhoneOff, Plus, VolumeX, Volume2 } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { FeatureDialog } from "@/components/FeatureDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { submitFeatureReport } from "@/features/reports/api";
import { supabase } from "@/lib/supabase";
import {
  createVoiceRoom, endVoiceRoom, listVoiceRooms, requestToSpeak,
  listMyVoiceCommunities, listMyVoiceProjects, respondToVoiceInvitation, resolveRaisedHand,
  sendVoiceMessage, setVoiceMicMode, syncVoiceRoomPermissions, type VoiceRoom,
} from "./api";
import { useVoiceCall } from "./VoiceCallProvider";

const card = "rounded-2xl border border-line bg-white p-4 shadow-sm";
const human = (s: string) => s.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export function VoiceSpacesPage() {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const rooms = useQuery({ queryKey: ["voice-rooms"], queryFn: () => listVoiceRooms(), refetchInterval: 15000 });
  const filtered = rooms.data?.filter((room) => `${room.title} ${room.description} ${room.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Live audio conversations</p><h1 className="mt-1 text-3xl font-black">Voice Spaces</h1><p className="mt-1 text-sm text-muted">Listen, learn, and join the conversation on campus.</p></div>
      <button className="btn-primary inline-flex items-center gap-2" onClick={() => setCreating(true)}><Plus size={16} /> Schedule a space</button></header>
    <section className="rounded-3xl bg-gradient-to-br from-[#202439] via-[#3b435f] to-[#79556e] p-6 text-white sm:p-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-violet-100"><Radio size={16} /> Hear what campus is thinking</div>
      <h2 className="mt-2 max-w-2xl text-2xl font-black sm:text-3xl">A better conversation starts when everyone can join in.</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">Study together, ask questions, exchange ideas or host a community discussion.</p>
    </section>
    <input className="input" aria-label="Search voice spaces" placeholder="Search rooms and topics" value={search} onChange={(e) => setSearch(e.target.value)} />
    {rooms.isLoading && <LoadingState label="Finding voice spaces" variant="panel" />}
    {rooms.isError && <p role="alert" className="err">Could not load Voice Spaces. Please try again.</p>}
    {filtered?.length === 0 && <div className={`${card} py-12 text-center`}><Radio className="mx-auto text-primary" /><h2 className="mt-3 font-bold">No rooms found</h2><p className="mt-1 text-sm text-muted">Schedule the first room or change your search.</p></div>}
    <div className="grid gap-4 md:grid-cols-2">{filtered?.map((room) => <VoiceRoomCard key={room.id} room={room} />)}</div>
    {creating && <CreateVoiceRoomDialog onClose={() => setCreating(false)} />}
  </div>;
}

function VoiceRoomCard({ room }: { room: VoiceRoom }) {
  const live = room.status === "live";
  return <article className={`${card} flex flex-col gap-3`}>
    <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#f2edfc] px-2.5 py-1 text-xs font-bold text-[#5b3e92]">{human(room.category)}</span>
      <span className={`inline-flex items-center gap-1 text-xs font-bold ${live ? "text-red-600" : "text-muted"}`}>{live && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}{live ? "LIVE NOW" : new Date(room.scheduled_at).toLocaleString()}</span></div>
    <div><h2 className="text-lg font-extrabold"><Link className="hover:text-primary" to={`/app/voice-spaces/${room.id}`}>{room.title}</Link></h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{room.description || "Join the campus conversation."}</p></div>
    <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-muted"><span>{human(room.room_type)} · {human(room.visibility)}</span><Link className="font-bold text-primary hover:underline" to={`/app/voice-spaces/${room.id}`}>{live ? "Join live room" : "View details"} →</Link></div>
  </article>;
}

function CreateVoiceRoomDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const [roomType, setRoomType] = useState("personal");
  const [error, setError] = useState("");
  const communities = useQuery({ queryKey: ["voice-create-communities", session?.user.id], enabled: !!session && roomType === "community", queryFn: () => listMyVoiceCommunities(session!.user.id) });
  const projects = useQuery({ queryKey: ["voice-create-projects", session?.user.id], enabled: !!session && roomType === "group", queryFn: () => listMyVoiceProjects(session!.user.id) });
  const create = useMutation({ mutationFn: createVoiceRoom, onSuccess: async (id) => {
    await qc.invalidateQueries({ queryKey: ["voice-rooms"] }); onClose(); navigate(`/app/voice-spaces/${id}`);
  }, onError: (e: Error) => setError(e.message) });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const form = new FormData(e.currentTarget);
    const time = String(form.get("scheduledAt"));
    create.mutate({
      title: String(form.get("title")), description: String(form.get("description") ?? ""),
      category: String(form.get("category")), roomType, visibility: String(form.get("visibility")),
      communityId: roomType === "community" ? String(form.get("communityId") || "") || null : null,
      projectId: roomType === "group" ? String(form.get("projectId") || "") || null : null,
      scheduledAt: new Date(time).toISOString(),
    });
  }
  return <Dialog title="Schedule a Voice Space" onClose={onClose}><form className="space-y-3" onSubmit={submit}>
    <Field name="title" label="Room title" required maxLength={120} />
    <Field name="description" label="What will you discuss?" textarea maxLength={1200} />
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField name="category" label="Topic" options={["academic","technology","study","mentorship","community","general","other"]} />
      <SelectField name="roomType" label="Room type" options={["personal","community","group"]} value={roomType} onChange={setRoomType} />
      <SelectField name="visibility" label="Who can join?" options={["public","followers","community","invite_only"]} />
      <Field name="scheduledAt" label="Start time" type="datetime-local" required />
    </div>
    {roomType === "community" && <label className="block"><span className="label">Community</span><select name="communityId" className="input" required><option value="">Choose a community</option>{communities.data?.filter((item) => ["owner","moderator"].includes(item.role)).map((item) => <option value={item.community.id} key={item.community.id}>{item.community.name}</option>)}</select>{communities.isError && <span className="err">Could not load communities you manage.</span>}</label>}
    {roomType === "group" && <label className="block"><span className="label">Project team</span><select name="projectId" className="input" required><option value="">Choose a project</option>{projects.data?.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select>{projects.isError && <span className="err">Could not load your project teams.</span>}</label>}
    <p className="rounded-xl bg-bg p-3 text-xs leading-5 text-muted">Audio is not recorded. Participants can talk by default; the host can mute the room and approve raised hands to speak.</p>
    {error && <p role="alert" className="err">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={create.isPending}>{create.isPending ? "Scheduling…" : "Create room"}</button></div>
  </form></Dialog>;
}

export function VoiceRoomPage() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const qc = useQueryClient();
  const voiceCall = useVoiceCall();
  const { connected, connecting, canPublish, isMuted, roomId: activeCallRoomId } = voiceCall;
  const connectedToThisRoom = connected && activeCallRoomId === id;
  const [audioError, setAudioError] = useState("");
  const [chatText, setChatText] = useState("");
  const [invitee, setInvitee] = useState("");
  const [messageError, setMessageError] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [permissionSyncFailed, setPermissionSyncFailed] = useState(false);
  const room = useQuery({ queryKey: ["voice-room", id], enabled: !!id, refetchInterval: 10000, queryFn: async () => {
    const { data, error } = await supabase.from("voice_rooms").select("*").eq("id", id).maybeSingle();
    if (error) throw error; return data as VoiceRoom | null;
  } });
  const myMember = useQuery({ queryKey: ["voice-member", id, session?.user.id], enabled: !!id && !!session, queryFn: async () => {
    const { data, error } = await supabase.from("voice_room_members").select("role,left_at").eq("room_id", id).eq("user_id", session!.user.id).maybeSingle();
    if (error) throw error; return data;
  } });
  const members = useQuery({ queryKey: ["voice-members", id], enabled: !!id && connectedToThisRoom, refetchInterval: 10000, queryFn: async () => {
    const { data, error } = await supabase.from("voice_room_members").select("user_id,role,left_at").eq("room_id", id).is("left_at", null).order("joined_at");
    if (error) throw error; return data ?? [];
  } });
  const hands = useQuery({ queryKey: ["voice-hands", id], enabled: !!id && connectedToThisRoom && ["host","cohost"].includes(myMember.data?.role ?? ""), refetchInterval: 5000, queryFn: async () => {
    const { data, error } = await supabase.from("voice_hand_requests").select("user_id,status,created_at").eq("room_id", id).eq("status", "pending").order("created_at");
    if (error) throw error; return data ?? [];
  } });
  const invitations = useQuery({ queryKey: ["voice-invites", id, session?.user.id], enabled: !!id && !!session, queryFn: async () => {
    const { data, error } = await supabase.from("voice_room_invitations").select("id,requested_role,created_at").eq("room_id", id).eq("invitee_id", session!.user.id).eq("status", "pending");
    if (error) throw error; return data ?? [];
  } });
  const chat = useQuery({ queryKey: ["voice-chat", id], enabled: !!id && connectedToThisRoom, refetchInterval: 5000, queryFn: async () => {
    const { data, error } = await supabase.from("voice_room_messages").select("id,author_id,body,created_at").eq("room_id", id).order("created_at", { ascending: false }).limit(50);
    if (error) throw error; return (data ?? []).reverse();
  } });
  const manager = ["host","cohost"].includes(myMember.data?.role ?? "");
  const host = room.data?.host_id === session?.user.id;
  const currentRole = myMember.data?.role ?? "listener";
  async function connectToRoom() {
    if (!room.data) return;
    setAudioError("");
    try {
      await voiceCall.connect(id, room.data.title, room.data.mic_mode, currentRole);
      await qc.invalidateQueries({ queryKey: ["voice-room", id] });
      await qc.invalidateQueries({ queryKey: ["voice-member", id] });
      await qc.invalidateQueries({ queryKey: ["voice-rooms"] });
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Could not connect to live audio.");
    }
  }

  useEffect(() => {
    if (!connectedToThisRoom) return;
    const channel = supabase.channel(`voice-room-live-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_rooms", filter: `id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["voice-room", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_room_members", filter: `room_id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["voice-members", id] });
        void qc.invalidateQueries({ queryKey: ["voice-member", id, session?.user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_hand_requests", filter: `room_id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["voice-hands", id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "voice_room_messages", filter: `room_id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["voice-chat", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_room_invitations", filter: `room_id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["voice-invites", id, session?.user.id] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [connectedToThisRoom, id, qc, session?.user.id]);

  const request = useMutation({ mutationFn: () => requestToSpeak(id), onSuccess: () => setAudioError("Hand raised. The host can approve your speaker request.") });
  const respondInvite = useMutation({ mutationFn: ({ invitationId, accept }: { invitationId: string; accept: boolean }) => respondToVoiceInvitation(invitationId, accept), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: ["voice-invites", id, session?.user.id] });
    await qc.invalidateQueries({ queryKey: ["voice-member", id, session?.user.id] });
  }, onError: (e: Error) => setAudioError(e.message) });
  const resolve = useMutation({ mutationFn: async ({ userId, approve }: { userId: string; approve: boolean }) => {
    await resolveRaisedHand(id, userId, approve);
    if (approve) {
      try {
        await syncVoiceRoomPermissions(id);
      } catch (error) {
        setPermissionSyncFailed(true);
        throw new Error(`Speaker approval was saved, but LiveKit permissions could not be synchronized: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }, onSuccess: async () => {
    setPermissionSyncFailed(false);
    await qc.invalidateQueries({ queryKey: ["voice-hands", id] });
    await qc.invalidateQueries({ queryKey: ["voice-members", id] });
    await qc.invalidateQueries({ queryKey: ["voice-member", id, session?.user.id] });
  }, onError: (error: Error) => setAudioError(error.message) });
  const end = useMutation({ mutationFn: () => endVoiceRoom(id), onSuccess: async () => {
    await voiceCall.leave();
    await qc.invalidateQueries({ queryKey: ["voice-room", id] });
    await qc.invalidateQueries({ queryKey: ["voice-rooms"] });
  }, onError: (error: Error) => setAudioError(error.message) });
  const micMode = useMutation({
    mutationFn: async (mode: "open" | "host_controlled") => {
      await setVoiceMicMode(id, mode);
      try {
        await syncVoiceRoomPermissions(id);
      } catch (error) {
        setPermissionSyncFailed(true);
        throw new Error(`Room microphone mode was saved, but LiveKit permissions could not be synchronized: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
    onSuccess: async () => {
      setPermissionSyncFailed(false);
      setAudioError("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["voice-room", id] }),
        qc.invalidateQueries({ queryKey: ["voice-members", id] }),
        qc.invalidateQueries({ queryKey: ["voice-member", id, session?.user.id] }),
      ]);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["voice-room", id] });
      await qc.invalidateQueries({ queryKey: ["voice-members", id] });
      await qc.invalidateQueries({ queryKey: ["voice-member", id, session?.user.id] });
    },
    onError: (error: Error) => setAudioError(`Room microphone permissions could not be updated: ${error.message}`),
  });
  const retryPermissionSync = useMutation({
    mutationFn: () => syncVoiceRoomPermissions(id),
    onSuccess: () => {
      setPermissionSyncFailed(false);
      setAudioError("");
    },
    onError: (error: Error) => setAudioError(`LiveKit permission sync is still failing: ${error.message}`),
  });
  const postChat = useMutation({ mutationFn: () => sendVoiceMessage(id, chatText.trim()), onSuccess: async () => {
    setChatText(""); setMessageError(""); await qc.invalidateQueries({ queryKey: ["voice-chat", id] });
  }, onError: (error: Error) => setMessageError(error.message) });
  const invite = useMutation({ mutationFn: async () => {
    const { error } = await supabase.from("voice_room_invitations").insert({ room_id: id, invitee_id: invitee.trim(), requested_role: "speaker" });
    if (error) throw error;
  }, onSuccess: () => { setInvitee(""); setMessageError("Speaker invitation sent."); }, onError: (e: Error) => setMessageError(e.message) });
  const report = useMutation({ mutationFn: () => submitFeatureReport("voice_room", id, reportReason), onSuccess: () => {
    setReportReason(""); setReportMessage("Report sent to the moderation team.");
  }, onError: (error: Error) => setReportMessage(error.message) });
  const leave = async () => {
    await voiceCall.leave();
    await qc.invalidateQueries({ queryKey: ["voice-members", id] });
    await qc.invalidateQueries({ queryKey: ["voice-member", id, session?.user.id] });
  };
  const send = (e: FormEvent) => { e.preventDefault(); if (chatText.trim()) postChat.mutate(); };

  if (room.isLoading) return <LoadingState label="Loading Voice Space" variant="panel" />;
  if (room.isError || !room.data) return <p role="alert" className="err">This Voice Space is unavailable or you do not have permission to join.</p>;
  const value = room.data;
  return <div className="space-y-4">
    <Link to="/app/voice-spaces" className="text-sm font-semibold text-muted hover:text-primary">← All Voice Spaces</Link>
    <section className="overflow-hidden rounded-3xl bg-[#202439] text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-200">{human(value.category)} · {human(value.room_type)}</p><h1 className="mt-1 text-2xl font-black">{value.title}</h1></div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${value.status === "live" ? "bg-red-500 text-white" : "bg-white/10 text-violet-100"}`}>{value.status === "live" ? "LIVE" : new Date(value.scheduled_at).toLocaleString()}</span>
      </div>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.4fr,1fr]">
        <div><p className="text-sm leading-6 text-white/75">{value.description || "Welcome to the conversation. Please be respectful and follow the host's directions."}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!connectedToThisRoom && <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#202439] disabled:opacity-60" disabled={connecting || value.status === "ended" || value.status === "cancelled" || (value.status === "scheduled" && !host)} onClick={() => void connectToRoom()}>{connecting ? "Connecting…" : activeCallRoomId ? "Switch to this room" : value.status === "live" ? "Join room" : host ? "Start room" : "Join room"}</button>}
            {connectedToThisRoom && canPublish && <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#202439]" onClick={() => void voiceCall.toggleMicrophone()}>{isMuted ? <MicOff size={16} /> : <Mic size={16} />}{isMuted ? "Unmute" : "Mute"}</button>}
            {connectedToThisRoom && currentRole === "listener" && value.mic_mode === "host_controlled" && <button className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-bold" disabled={request.isPending} onClick={() => request.mutate()}><Hand size={16} /> Raise hand</button>}
            {connectedToThisRoom && <button className="rounded-xl border border-white/25 px-4 py-2.5 text-sm font-bold" onClick={() => void leave()}><PhoneOff className="mr-1 inline" size={16} /> Leave</button>}
            {host && connectedToThisRoom && <button className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold disabled:opacity-60" disabled={micMode.isPending} onClick={() => micMode.mutate(value.mic_mode === "open" ? "host_controlled" : "open")}>
              {value.mic_mode === "open" ? <><VolumeX size={16} /> Mute everyone</> : <><Volume2 size={16} /> Allow everyone to speak</>}
            </button>}
            {host && connectedToThisRoom && <button className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold" disabled={end.isPending} onClick={() => end.mutate()}>End for everyone</button>}
          </div>
          {connectedToThisRoom && value.mic_mode === "host_controlled" && !canPublish && currentRole === "listener" && <p className="mt-3 text-xs text-violet-200">You are listening. Raise your hand and the host can enable your microphone.</p>}
          {audioError && <p role="status" className="mt-3 text-sm text-violet-100">{audioError}</p>}
          {permissionSyncFailed && host && connectedToThisRoom && <button className="mt-2 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-60" disabled={retryPermissionSync.isPending} onClick={() => retryPermissionSync.mutate()}>{retryPermissionSync.isPending ? "Retrying…" : "Retry speaker permissions"}</button>}
          {voiceCall.error && <p role="status" className="mt-3 text-sm text-violet-100">{voiceCall.error}</p>}
                {invitations.data?.map((invitation) => <div key={invitation.id} className="mt-3 rounded-xl bg-white/10 p-3 text-sm">You are invited to join as a {invitation.requested_role}.
                  <div className="mt-2 flex gap-2"><button className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-[#202439]" onClick={() => respondInvite.mutate({ invitationId: invitation.id, accept: true })}>Accept</button><button className="rounded-lg border border-white/30 px-3 py-1 text-xs" onClick={() => respondInvite.mutate({ invitationId: invitation.id, accept: false })}>Decline</button></div>
                </div>)}
          {!connectedToThisRoom && value.status === "scheduled" && !host && <p className="mt-3 text-xs text-white/60">This room is scheduled. Join when it is live; only the host can start it.</p>}
          <div className="mt-5 rounded-2xl bg-white/5 p-4"><h2 className="flex items-center gap-2 font-bold"><Users size={16} /> In the room · {members.data?.length ?? 0}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">{members.data?.map((m) => <li key={m.user_id} className="rounded-full border border-white/15 px-3 py-1.5 text-xs">{m.user_id === session?.user.id ? "You" : `Student ${m.user_id.slice(0, 6)}`} · {m.role}</li>)}</ul>
            {!members.data?.length && <p className="mt-2 text-xs text-white/60">Join the room to see participants.</p>}
          </div>
          {manager && connectedToThisRoom && <div className="mt-4 rounded-2xl bg-white/5 p-4">
            <h2 className="font-bold">Speaker requests</h2>
            {hands.data?.map((hand) => <div key={hand.user_id} className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="flex-1">Student {hand.user_id.slice(0, 8)} is requesting to speak</span>
              <button className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-[#202439]" disabled={resolve.isPending} onClick={() => resolve.mutate({ userId: hand.user_id, approve: true })}>Allow to speak</button>
              <button className="rounded-lg border border-white/20 px-2 py-1 text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ userId: hand.user_id, approve: false })}>Decline</button>
            </div>)}
            {!hands.data?.length && <p className="mt-2 text-xs text-white/60">No raised hands.</p>}
            {host && <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (invitee.trim()) invite.mutate(); }}>
              <input className="input min-w-0 bg-white text-fg" aria-label="Invite speaker by user ID" value={invitee} onChange={(e) => setInvitee(e.target.value)} placeholder="Invite speaker by user ID" />
              <button className="rounded-xl bg-white px-3 text-xs font-bold text-[#202439]" disabled={invite.isPending || !invitee.trim()}>Invite</button>
            </form>}
          </div>}
        </div>
        <section className="flex min-h-[350px] flex-col rounded-2xl bg-white p-4 text-fg">
          <h2 className="font-extrabold">Room chat</h2>
          {!connectedToThisRoom && <p className="mt-2 text-xs text-muted">Join the room to read and send messages.</p>}
          <div className="mt-3 flex-1 space-y-2 overflow-auto" role="log" aria-live="polite">
            {chat.data?.map((msg) => <div key={msg.id} className="rounded-xl bg-bg p-2.5"><p className="text-[10px] text-muted">{msg.author_id === session?.user.id ? "You" : `Student ${msg.author_id.slice(0, 7)}`}</p><p className="mt-1 break-words text-sm">{msg.body}</p></div>)}
            {!chat.data?.length && connectedToThisRoom && <p className="py-12 text-center text-sm text-muted">Start a friendly room chat.</p>}
          </div>
          {connectedToThisRoom && <form className="mt-3 flex gap-2" onSubmit={send}><input className="input" aria-label="Room chat message" maxLength={500} value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Write a message…" />
            <button className="btn-primary px-3" aria-label="Send chat message" disabled={postChat.isPending || !chatText.trim()}><Send size={16} /></button></form>}
          {messageError && <p role="status" className="mt-2 text-xs text-primary">{messageError}</p>}
        </section>
      </div>
    </section>
    {!host && <section className={card}><h2 className="font-bold">Report this Voice Space</h2>
      <div className="mt-2 flex flex-wrap gap-2"><input className="input min-w-0 flex-1" aria-label="Voice Space report reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)} maxLength={1000} placeholder="Tell moderators what concerns you (5–1000 characters)" />
        <button className="btn" disabled={report.isPending || reportReason.trim().length < 5} onClick={() => report.mutate()}>{report.isPending ? "Sending…" : "Report"}</button></div>
      {reportMessage && <p role="status" className="mt-2 text-sm text-primary">{reportMessage}</p>}
    </section>}
  </div>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <FeatureDialog title={title} onClose={onClose}>{children}</FeatureDialog>;
}
function Field({ name, label, type = "text", required = false, maxLength, textarea = false }: { name: string; label: string; type?: string; required?: boolean; maxLength?: number; textarea?: boolean }) {
  return <label className="block"><span className="label">{label}</span>{textarea
    ? <textarea name={name} className="input" rows={3} required={required} maxLength={maxLength} />
    : <input name={name} className="input" type={type} required={required} maxLength={maxLength} />}</label>;
}
function SelectField({ name, label, options, value, onChange }: { name: string; label: string; options: string[]; value?: string; onChange?: (value: string) => void }) {
  return <label className="block"><span className="label">{label}</span><select name={name} className="input" value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined}>{options.map((x) => <option key={x} value={x}>{human(x)}</option>)}</select></label>;
}
