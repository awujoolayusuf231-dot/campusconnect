import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Grip, Radio } from "lucide-react";
import { Avatar } from "@/features/social/components/Avatar";
import { useAuth } from "@/features/auth/AuthProvider";
import { listActiveVoicePresence } from "./api";
import { useVoiceCall } from "./VoiceCallProvider";
import { supabase } from "@/lib/supabase";

type Position = { left: number; top: number };
type DragState = { pointerId: number; x: number; y: number; left: number; top: number };
const POSITION_KEY = "campusconnect-voice-indicator-position";

function clampPosition(position: Position, width: number, height: number, elementWidth: number, elementHeight: number): Position {
  return {
    left: Math.max(8, Math.min(position.left, width - elementWidth - 8)),
    top: Math.max(8, Math.min(position.top, height - elementHeight - 8)),
  };
}

function initialPosition(): Position {
  if (typeof window === "undefined") return { left: 16, top: 100 };
  try {
    const stored = localStorage.getItem(POSITION_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed === "object" && parsed !== null && "left" in parsed && "top" in parsed
        && typeof parsed.left === "number" && typeof parsed.top === "number") {
        return { left: parsed.left, top: parsed.top };
      }
    }
  } catch (error) {
    console.warn("Could not restore the Voice Space indicator position.", error);
  }
  return { left: Math.max(8, window.innerWidth - 290), top: Math.max(8, window.innerHeight - 150) };
}

export function VoiceActiveIndicator() {
  const { session } = useAuth();
  const call = useVoiceCall();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uid = session?.user.id;
  const active = useQuery({
    queryKey: ["voice-active-presence", uid],
    enabled: !!uid,
    queryFn: listActiveVoicePresence,
    refetchInterval: 10000,
  });
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const moved = useRef(false);
  const [position, setPosition] = useState<Position>(initialPosition);
  const positionRef = useRef(position);
  const [accessMessage, setAccessMessage] = useState("");

  useEffect(() => {
    if (!uid) return;
    const channel = supabase.channel("campusconnect:voice-presence", { config: { private: true } })
      .on("broadcast", { event: "voice_presence_changed" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["voice-active-presence", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_rooms" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["voice-active-presence", uid] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, uid]);

  const updatePosition = (next: Position) => {
    const bounds = element.current?.getBoundingClientRect();
    const bounded = clampPosition(
      next,
      window.innerWidth,
      window.innerHeight,
      bounds?.width ?? 272,
      bounds?.height ?? 60,
    );
    positionRef.current = bounded;
    setPosition(bounded);
  };

  useEffect(() => {
    const resize = () => updatePosition(positionRef.current);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const spaces = (active.data ?? []).filter((space) => space.room_id !== call.roomId);
  if (!uid) return null;
  if (active.isError) return <p role="status" className="fixed bottom-24 right-3 z-40 rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted shadow-lg">Could not check active Voice Spaces.</p>;
  if (!spaces.length) return null;
  const space = spaces[0];
  if (!space) return null;

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: positionRef.current.left,
      top: positionRef.current.top,
    };
    moved.current = false;
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - activeDrag.x;
    const dy = event.clientY - activeDrag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    if (moved.current) updatePosition({ left: activeDrag.left + dx, top: activeDrag.top + dy });
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    if (moved.current) {
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current));
      } catch (error) {
        console.warn("Could not save the Voice Space indicator position.", error);
      }
      event.preventDefault();
      window.setTimeout(() => { moved.current = false; }, 0);
    }
  };

  return <div
    ref={element}
    className="fixed z-40 w-[min(17rem,calc(100vw-1rem))]"
    style={{
      left: position.left,
      top: position.top,
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}
  >
    <button
      type="button"
      className="flex min-h-14 w-full touch-none items-center gap-2 rounded-2xl border border-primary-border bg-white/95 p-2.5 text-left text-fg shadow-xl backdrop-blur"
      aria-label={`${space.can_join ? "Join" : "View"} live Voice Space: ${space.title}${spaces.length > 1 ? `, and ${spaces.length - 1} more live` : ""}`}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => {
        if (moved.current) {
          moved.current = false;
          return;
        }
        if (space.can_join) {
          navigate(`/app/voice-spaces/${space.room_id}`);
          return;
        }
        setAccessMessage("This Voice Space is restricted. You need an invitation or the required membership to join.");
      }}
    >
      {space.can_join && space.host_display_name
        ? <Avatar name={space.host_display_name} path={space.host_avatar_path} size={34} />
        : <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Radio size={17} /></span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-danger"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />Live{space.participant_count !== null ? ` · ${space.participant_count}` : ""}</span>
        <span className="block truncate text-xs font-bold">{space.title}</span>
        {space.can_join && space.host_display_name && <span className="block truncate text-[10px] text-muted">Hosted by {space.host_display_name}</span>}
      </span>
      {spaces.length > 1 && <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">+{spaces.length - 1}</span>}
      <Grip className="shrink-0 text-muted" size={15} aria-hidden="true" />
    </button>
    {accessMessage && <div role="status" className="mt-2 rounded-xl border border-line bg-white p-3 text-xs text-fg shadow-lg">
      <p>{accessMessage}</p>
      <button type="button" className="mt-2 font-bold text-primary underline" onClick={() => setAccessMessage("")}>Dismiss</button>
    </div>}
  </div>;
}
