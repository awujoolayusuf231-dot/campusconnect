import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Room } from "livekit-client";
import { Mic, MicOff, PhoneOff, Radio } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getVoiceToken, joinVoiceRoom, leaveVoiceRoom } from "./api";

interface VoiceCallContextValue {
  roomId: string | null;
  roomTitle: string;
  connected: boolean;
  connecting: boolean;
  canPublish: boolean;
  isMuted: boolean;
  error: string;
  endedRoomId: string | null;
  endedNotice: string;
  setError: (message: string) => void;
  dismissEndedNotice: () => void;
  connect: (roomId: string, title: string, micMode: string, role: string) => Promise<void>;
  leave: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  toggleMicrophone: () => Promise<void>;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const roomRef = useRef<Room | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const remoteAudioRef = useRef(new Set<HTMLMediaElement>());
  const playbackPausedRef = useRef(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState("");
  const [endedRoomId, setEndedRoomId] = useState<string | null>(null);
  const [endedNotice, setEndedNotice] = useState("");

  const clearRemoteAudio = useCallback(() => {
    for (const element of remoteAudioRef.current) element.remove();
    remoteAudioRef.current.clear();
  }, []);

  const setRemotePlaybackPaused = useCallback((paused: boolean) => {
    playbackPausedRef.current = paused;
    for (const element of remoteAudioRef.current) {
      if (paused) {
        element.pause();
      } else {
        void element.play().catch(() => setError("Audio is connected. Tap the page if your browser blocks playback."));
      }
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = paused ? "paused" : "playing";
    }
  }, []);

  const leave = useCallback(async () => {
    const activeId = activeRoomIdRef.current;
    const activeRoom = roomRef.current;
    roomRef.current = null;
    activeRoomIdRef.current = null;
    setRoomId(null);
    setRoomTitle("");
    setConnected(false);
    setCanPublish(false);
    setIsMuted(true);
    playbackPausedRef.current = false;
    clearRemoteAudio();
    if (activeRoom) await activeRoom.disconnect();
    if (activeId) {
      try {
        await leaveVoiceRoom(activeId);
      } catch (caught) {
        console.error("Voice audio disconnected, but participant state could not be updated.", caught);
        setError("Audio disconnected, but your Voice Space membership could not be updated. Refresh and try again.");
      }
    }
  }, [clearRemoteAudio]);

  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    if (enabled && !activeRoom.localParticipant.permissions?.canPublish) {
      setCanPublish(false);
      setIsMuted(true);
      setError("The host has not enabled your microphone. Raise your hand to request permission.");
      return;
    }
    try {
      await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
      setCanPublish(Boolean(activeRoom.localParticipant.permissions?.canPublish));
      setIsMuted(!enabled);
      setError("");
    } catch (caught) {
      setIsMuted(true);
      setError(caught instanceof Error ? caught.message : "Microphone permission failed.");
    }
  }, []);

  const toggleMicrophone = useCallback(async () => {
    await setMicrophoneEnabled(isMuted);
  }, [isMuted, setMicrophoneEnabled]);
  const dismissEndedNotice = useCallback(() => {
    setEndedNotice("");
    setEndedRoomId(null);
  }, []);

  const connect = useCallback(async (nextRoomId: string, title: string, micMode: string, currentRole: string) => {
    if (roomRef.current && activeRoomIdRef.current === nextRoomId && connected) return;
    setConnecting(true);
    setError("");
    setEndedNotice("");
    setEndedRoomId(null);
    playbackPausedRef.current = false;
    try {
      if (roomRef.current || activeRoomIdRef.current) await leave();

      const joinedRole = await joinVoiceRoom(nextRoomId);
      const publishAllowed = micMode === "open" || ["host", "speaker"].includes(joinedRole || currentRole);
      const { url, token } = await getVoiceToken(nextRoomId, publishAllowed);
      const { Room, RoomEvent } = await import("livekit-client");
      const liveRoom = new Room({ adaptiveStream: true, dynacast: true });

      liveRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnected(state === "connected");
        if (state === "disconnected" && roomRef.current === liveRoom) {
          roomRef.current = null;
          activeRoomIdRef.current = null;
          setRoomId(null);
          setRoomTitle("");
          setCanPublish(false);
          setIsMuted(true);
          setError("The connection to this Voice Space was lost. Rejoin to reconnect.");
          clearRemoteAudio();
          void leaveVoiceRoom(nextRoomId).catch((caught: unknown) => {
            console.error("Could not update Voice Space membership after the audio connection closed.", caught);
            setError("Audio disconnected, but your Voice Space membership could not be updated.");
          });
        }
      });
      liveRoom.on(RoomEvent.ParticipantPermissionsChanged, () => {
        const allowed = Boolean(liveRoom.localParticipant.permissions?.canPublish);
        setCanPublish(allowed);
        if (!allowed) {
          setIsMuted(true);
          void liveRoom.localParticipant.setMicrophoneEnabled(false);
        }
      });
      liveRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== "audio") return;
        const element = track.attach();
        element.autoplay = true;
        element.setAttribute("playsinline", "");
        document.body.appendChild(element);
        remoteAudioRef.current.add(element);
        if (!playbackPausedRef.current) {
          void element.play().catch(() => setError("Audio is connected. Tap the page if your browser blocks playback."));
        }
      });
      liveRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const element of track.detach()) {
          element.remove();
          remoteAudioRef.current.delete(element);
        }
      });

      roomRef.current = liveRoom;
      activeRoomIdRef.current = nextRoomId;
      setRoomId(nextRoomId);
      setRoomTitle(title);
      await liveRoom.connect(url, token);
      if (publishAllowed) {
        try {
          await liveRoom.localParticipant.setMicrophoneEnabled(true);
        } catch (caught) {
          setError(caught instanceof Error
            ? `You joined as a listener because microphone access failed: ${caught.message}`
            : "You joined as a listener because microphone access failed.");
        }
      }
      setCanPublish(Boolean(liveRoom.localParticipant.permissions?.canPublish));
      setIsMuted(!publishAllowed || !liveRoom.localParticipant.isMicrophoneEnabled);
      setConnected(true);
    } catch (caught) {
      const activeRoom = roomRef.current;
      roomRef.current = null;
      activeRoomIdRef.current = null;
      if (activeRoom) await activeRoom.disconnect();
      clearRemoteAudio();
      setRoomId(null);
      setRoomTitle("");
      setConnected(false);
      setCanPublish(false);
      setIsMuted(true);
      try {
        await leaveVoiceRoom(nextRoomId);
      } catch (leaveError) {
        console.error("Could not clear the failed Voice Space membership.", leaveError);
      }
      const message = caught instanceof Error ? caught.message : "Could not connect to live audio.";
      setError(message);
      throw caught;
    } finally {
      setConnecting(false);
    }
  }, [clearRemoteAudio, connected, leave]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`voice-active-call-${roomId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "voice_rooms",
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        if ((payload.new as { status?: string }).status === "ended") {
          setEndedRoomId(roomId);
          setEndedNotice("This Voice Space has ended.");
          void leave();
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [roomId, roomTitle, leave]);

  useEffect(() => () => {
    const activeId = activeRoomIdRef.current;
    const activeRoom = roomRef.current;
    roomRef.current = null;
    activeRoomIdRef.current = null;
    if (activeRoom) void activeRoom.disconnect();
    clearRemoteAudio();
    if (activeId) void leaveVoiceRoom(activeId).catch((caught: unknown) => {
      console.error("Could not clear Voice Space membership during cleanup.", caught);
    });
  }, [clearRemoteAudio]);

  useEffect(() => {
    if (!roomId || !connected || !("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    if (typeof MediaMetadata !== "undefined") {
      mediaSession.metadata = new MediaMetadata({
        title: roomTitle,
        artist: "CampusConnect Voice Space",
      });
    }
    mediaSession.playbackState = playbackPausedRef.current ? "paused" : "playing";
    try {
      mediaSession.setActionHandler("pause", () => setRemotePlaybackPaused(true));
      mediaSession.setActionHandler("play", () => setRemotePlaybackPaused(false));
    } catch {
      setError("System audio controls are not available in this browser.");
    }
    return () => {
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
      try {
        mediaSession.setActionHandler("pause", null);
        mediaSession.setActionHandler("play", null);
      } catch {
        // Some browsers expose Media Session without supporting every action.
      }
    };
  }, [connected, roomId, roomTitle, setRemotePlaybackPaused]);

  const value = useMemo(() => ({
    roomId, roomTitle, connected, connecting, canPublish, isMuted, error,
    endedRoomId, endedNotice, setError, dismissEndedNotice,
    connect, leave, setMicrophoneEnabled, toggleMicrophone,
  }), [roomId, roomTitle, connected, connecting, canPublish, isMuted, error, endedRoomId, endedNotice,
    dismissEndedNotice, connect, leave, setMicrophoneEnabled, toggleMicrophone]);

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}

export function useVoiceCall() {
  const context = useContext(VoiceCallContext);
  if (!context) throw new Error("useVoiceCall must be used within VoiceCallProvider.");
  return context;
}

export function VoiceCallDock() {
  const call = useVoiceCall();
  const { pathname } = useLocation();
  const showEndedNotice = !!call.endedNotice && pathname !== `/app/voice-spaces/${call.endedRoomId}`;
  if ((!call.roomId || pathname === `/app/voice-spaces/${call.roomId}`) && !showEndedNotice) return null;

  return (
    <aside className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-primary-border bg-white p-3 text-fg shadow-xl lg:inset-x-auto lg:bottom-4 lg:right-4">
      {showEndedNotice && <div role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
        <Radio size={17} className="shrink-0 text-danger" aria-hidden="true" />
        <span className="min-w-0 flex-1">{call.endedNotice}</span>
        <button type="button" className="text-xs font-bold text-muted underline" onClick={call.dismissEndedNotice}>Dismiss</button>
      </div>}
      {call.roomId && <>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${call.connected ? "bg-green-400" : "animate-pulse bg-amber-300"}`} aria-hidden="true" />
      <Link to={`/app/voice-spaces/${call.roomId}`} className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold">{call.roomTitle || "Voice Space"}</span>
        <span className="block truncate text-[10px] text-muted">{call.error || (call.connected ? "Connected · return to conversation" : "Reconnecting to conversation…")}</span>
      </Link>
      {call.canPublish && <button type="button" className="rounded-lg border border-line p-2 text-fg hover:bg-primary-soft" aria-label={call.isMuted ? "Unmute microphone" : "Mute microphone"} onClick={() => void call.toggleMicrophone()}>
        {call.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>}
      <button type="button" className="rounded-lg border border-line p-2 text-fg hover:bg-primary-soft" aria-label="Leave Voice Space" onClick={() => void call.leave()}><PhoneOff size={16} /></button>
      </>}
    </aside>
  );
}
