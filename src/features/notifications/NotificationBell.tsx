import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Bell, Heart, MessageCircle, Radio, UserRound } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/time";
import { describeNotification, type NotificationCopyInput } from "./notificationCopy";

type PreviewNotification = NotificationCopyInput & {
  id: number;
  created_at: string;
  read_at: string | null;
};
type DropdownPosition = { top: number; left: number; width: number; maxHeight: number };

function iconFor(type: string) {
  if (type === "voice_invitation") return Radio;
  if (type === "message" || type === "discussion_reply") return MessageCircle;
  if (type === "like" || type === "repost") return Heart;
  if (type === "follow") return UserRound;
  return Bell;
}

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const queryClient = useQueryClient();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const markingRead = useRef(new Set<number>());
  const [open, setOpen] = useState(false);
  const [readError, setReadError] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const preview = useQuery({
    queryKey: ["notifications", "preview"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notifications_list", { p_before: null, p_limit: 5 });
      if (error) throw error;
      return (data ?? []) as PreviewNotification[];
    },
  });

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !panel.current?.contains(event.target)
        && !dropdown.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const margin = 12;
      const width = Math.min(384, window.innerWidth - margin * 2);
      const mobile = window.innerWidth < 768;
      const top = mobile ? Math.max(margin, Math.min(72, window.innerHeight - 180)) : bounds.bottom + 8;
      const left = mobile
        ? (window.innerWidth - width) / 2
        : Math.min(Math.max(margin, bounds.right - width), window.innerWidth - width - margin);
      setDropdownPosition({
        top,
        left,
        width,
        maxHeight: Math.max(160, window.innerHeight - top - margin * 2),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const markRead = useCallback(async (ids: number[]) => {
    const pendingIds = [...new Set(ids)].filter((id) => !markingRead.current.has(id));
    if (pendingIds.length === 0) return;
    pendingIds.forEach((id) => markingRead.current.add(id));
    setReadError("");
    const { error } = await supabase.rpc("mark_notifications_read", { p_ids: pendingIds });
    if (error) {
      pendingIds.forEach((id) => markingRead.current.delete(id));
      setReadError("Could not update this notification's read status.");
      console.error("Could not mark a notification as read.", error);
      return;
    }
    queryClient.setQueryData<PreviewNotification[]>(["notifications", "preview"], (current) =>
      current?.map((item) => pendingIds.includes(item.id) && !item.read_at
        ? { ...item, read_at: new Date().toISOString() }
        : item));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["unread"] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    const root = list.current;
    if (!open || !root || !preview.data?.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visibleUnreadIds = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
        .map((entry) => Number((entry.target as HTMLLIElement).dataset.notificationId))
        .filter((id) => preview.data?.some((item) => item.id === id && !item.read_at));
      if (visibleUnreadIds.length > 0) void markRead(visibleUnreadIds);
    }, { root, threshold: 0.6 });
    root.querySelectorAll<HTMLLIElement>("[data-notification-id]").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [markRead, open, preview.data]);

  return <div ref={panel} className="relative">
    <button
      ref={trigger}
      type="button"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      aria-expanded={open}
      aria-controls="notification-preview"
      title="Notifications"
      onClick={() => setOpen((current) => !current)}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border bg-white transition hover:border-primary/30 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${open ? "border-primary/30 bg-primary-soft text-primary" : "border-line text-muted"}`}
    >
      <Bell size={18} aria-hidden="true" />
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && dropdownPosition && createPortal(<section
      ref={dropdown}
      id="notification-preview"
      aria-label="Recent notifications"
      style={{
        position: "fixed",
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        maxHeight: dropdownPosition.maxHeight,
      }}
      className="z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-bold">Notifications</h2>
        {unreadCount > 0 && <span className="text-xs font-semibold text-primary">{unreadCount > 99 ? "99+" : unreadCount} unread</span>}
      </header>
      {preview.isLoading && <p className="px-4 py-6 text-center text-sm text-muted">Loading notifications…</p>}
      {preview.isError && <p role="alert" className="px-4 py-6 text-center text-sm text-danger">Could not load notifications.</p>}
      {!preview.isLoading && !preview.isError && !preview.data?.length && <p className="px-4 py-8 text-center text-sm text-muted">You have no notifications yet.</p>}
      {!!preview.data?.length && <ul ref={list} className="min-h-0 flex-1 overflow-y-auto">
        {preview.data.map((item) => {
          const copy = describeNotification(item);
          const Icon = iconFor(item.type);
          return <li key={item.id} data-notification-id={item.id} className={`border-b border-line/70 last:border-0 ${item.read_at ? "bg-white" : "bg-primary-soft/40"}`}>
            <Link to={copy.to} onClick={() => { setOpen(false); if (!item.read_at) void markRead([item.id]); }} className="flex min-h-[4.5rem] items-start gap-3 px-4 py-3 hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary">
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.read_at ? "bg-bg text-muted" : "bg-primary-soft text-primary"}`}><Icon size={17} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm leading-5 ${item.read_at ? "text-fg" : "font-bold text-fg"}`}>{copy.text}</span>
                <span className="mt-1 block text-xs text-muted">{timeAgo(item.created_at)}</span>
              </span>
              {!item.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            </Link>
          </li>;
        })}
      </ul>}
      {readError && <p role="alert" className="px-4 py-2 text-xs text-danger">{readError}</p>}
      <footer className="border-t border-line p-2">
        <Link to="/app/notifications" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-center text-sm font-bold text-primary hover:bg-primary-soft">View all notifications</Link>
      </footer>
    </section>, document.body)}
  </div>;
}
