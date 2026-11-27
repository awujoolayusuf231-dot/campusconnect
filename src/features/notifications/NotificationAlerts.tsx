import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  catchUpPresentation,
  claimNotificationForDisplay,
  notificationAllowedByPreferences,
  pushNotificationAllowedByPreferences,
  type NotificationPreferences,
} from "./realtimeNotificationLogic";
import { describeNotification, type NotificationCopyInput } from "./notificationCopy";
import { safeAppPath } from "../../../supabase/functions/_shared/notificationRoute";
import { isBrowserPushConfigured } from "@/features/push/pushConfig";
import type { ForegroundPushToast } from "@/features/push/pushNotifications";
import { PushPermissionPrompt } from "@/features/push/PushPermissionPrompt";

type NotificationRow = NotificationCopyInput & {
  id: number | string;
  actor_id: string | null;
  created_at: string;
  read_at: string | null;
};
type ActorProfile = { id: string; display_name: string | null; username: string | null };
type Toast = { id: string; title?: string; text: string; to: string };

const preferenceFields = "notify_enabled,notify_push,notify_follows,notify_likes,notify_comments,notify_community,notify_messages,notify_discussions,notify_followed_posts,notify_celebrations,notify_voice,notify_collaboration";
const defaultPreferences: NotificationPreferences = {};
const LAST_SEEN_KEY_PREFIX = "campusconnect-notifications-last-seen:";

function lastSeenKey(userId: string): string {
  return `${LAST_SEEN_KEY_PREFIX}${userId}`;
}

function getLastSeenAt(userId: string): string {
  try {
    const stored = localStorage.getItem(lastSeenKey(userId));
    if (stored && Number.isFinite(Date.parse(stored))) return stored;
    const now = new Date().toISOString();
    localStorage.setItem(lastSeenKey(userId), now);
    return now;
  } catch (error) {
    console.warn("CampusConnect could not read notification catch-up state.", error);
    return new Date().toISOString();
  }
}

function setLastSeenAt(userId: string, value = new Date().toISOString()): void {
  try {
    localStorage.setItem(lastSeenKey(userId), value);
  } catch (error) {
    console.warn("CampusConnect could not save notification catch-up state.", error);
  }
}

export function NotificationAlerts({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const preferencesRef = useRef<NotificationPreferences>(defaultPreferences);
  const preferencesLoadedRef = useRef(false);
  const catchUpRunningRef = useRef(false);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);

  const showToast = useCallback((toast: Toast | ForegroundPushToast) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { ...toast, id }].slice(-3));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 6000);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let disconnected = false;
    let channel: ReturnType<typeof supabase.channel>;

    const loadPreferences = async (): Promise<NotificationPreferences | null> => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select(preferenceFields)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("Could not load notification preferences for alerts.", error);
        return null;
      }
      const preferences = (data ?? {}) as NotificationPreferences;
      if (active) {
        preferencesRef.current = preferences;
        preferencesLoadedRef.current = true;
        setPushEnabled(preferences.notify_push !== false);
      }
      return preferences;
    };

    const loadActors = async (rows: NotificationRow[]): Promise<Map<string, ActorProfile>> => {
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => !!id))];
      if (actorIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,username")
        .in("id", actorIds);
      if (error) {
        console.error("Could not load notification actor profiles.", error);
        return new Map();
      }
      return new Map(((data ?? []) as ActorProfile[]).map((profile) => [profile.id, profile]));
    };

    const enrich = (row: NotificationRow, actors: Map<string, ActorProfile>): NotificationCopyInput => {
      const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
      return {
        ...row,
        actor_display_name: actor?.display_name ?? null,
        actor_username: actor?.username ?? null,
      };
    };

    const showSystemNotification = async (row: NotificationRow, copy: { text: string; to: string }) => {
      if (!("serviceWorker" in navigator) || typeof Notification === "undefined"
        || Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const announcement = row.type === "announcement";
      const title = announcement && typeof row.data.title === "string" ? row.data.title : copy.text;
      const body = announcement && typeof row.data.body === "string"
        ? row.data.body
        : "Open CampusConnect to view this update.";
      await registration.showNotification(title, {
        body,
        tag: `notification:${row.id}`,
        icon: "/icons/campusconnect-192.png",
        data: { url: safeAppPath(copy.to) },
      });
    };

    const handleInsert = async (row: NotificationRow) => {
      if (!active || row.id === undefined || row.id === null || !row.type) return;
      const preferences = preferencesLoadedRef.current
        ? preferencesRef.current
        : await loadPreferences();
      if (!active || !preferences || !notificationAllowedByPreferences(row.type, preferences)) {
        setLastSeenAt(userId);
        return;
      }

      const visible = document.visibilityState === "visible";
      if (!visible && (!pushNotificationAllowedByPreferences(preferences)
        || typeof Notification === "undefined" || Notification.permission !== "granted")) {
        setLastSeenAt(userId);
        return;
      }
      const actors = await loadActors([row]);
      if (!active || !claimNotificationForDisplay(row.id)) return;
      const copy = describeNotification(enrich(row, actors));
      if (visible) {
        showToast({
          id: String(row.id),
          ...(row.type === "announcement" && typeof row.data.title === "string" ? { title: row.data.title } : {}),
          text: row.type === "announcement" && typeof row.data.body === "string" ? row.data.body : copy.text,
          to: copy.to,
        });
        if (pushNotificationAllowedByPreferences(preferences)) {
          try {
            await showSystemNotification(row, copy);
          } catch (error) {
            console.error("Could not show a notification while CampusConnect was visible.", error);
          }
        }
      }
      else {
        try {
          await showSystemNotification(row, copy);
        } catch (error) {
          console.error("Could not show a notification received while CampusConnect was hidden.", error);
        }
      }
      setLastSeenAt(userId);
      void queryClient.invalidateQueries({ queryKey: ["unread", "notifications"] });
    };

    const catchUp = async () => {
      if (!active || catchUpRunningRef.current || !navigator.onLine) return;
      catchUpRunningRef.current = true;
      let completed = false;
      try {
        const since = getLastSeenAt(userId);
        const [{ data, error }, preferences] = await Promise.all([
          supabase
            .from("notifications")
            .select("id,type,actor_id,entity_type,entity_id,data,created_at,read_at")
            .eq("user_id", userId)
            .is("read_at", null)
            .gt("created_at", since)
            .order("created_at", { ascending: true })
            .limit(50),
          preferencesLoadedRef.current ? Promise.resolve(preferencesRef.current) : loadPreferences(),
        ]);
        if (error) throw error;
        if (!active || !preferences) return;
        completed = true;
        const rows = ((data ?? []) as NotificationRow[])
          .filter((row) => notificationAllowedByPreferences(row.type, preferences))
          .filter((row) => claimNotificationForDisplay(row.id));
        if (rows.length === 0) return;

        if (catchUpPresentation(rows.length) === "summary") {
          showToast({
            id: `catch-up-${Date.now()}`,
            text: `You have ${rows.length} new notifications`,
            to: "/app/notifications",
          });
        } else {
          const actors = await loadActors(rows);
          for (const row of rows) {
            const copy = describeNotification(enrich(row, actors));
            showToast({
              id: String(row.id),
              ...(row.type === "announcement" && typeof row.data.title === "string" ? { title: row.data.title } : {}),
              text: row.type === "announcement" && typeof row.data.body === "string" ? row.data.body : copy.text,
              to: copy.to,
            });
          }
        }
        void queryClient.invalidateQueries({ queryKey: ["unread", "notifications"] });
      } catch (error) {
        console.error("Could not catch up on notifications.", error);
        return;
      } finally {
        if (active) {
          if (completed) setLastSeenAt(userId);
          catchUpRunningRef.current = false;
        }
      }
    };

    void loadPreferences();
    channel = supabase.channel(`notification-alerts-${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        void handleInsert(payload.new as NotificationRow);
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_preferences",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        preferencesRef.current = payload.new as NotificationPreferences;
        preferencesLoadedRef.current = true;
        setPushEnabled(preferencesRef.current.notify_push !== false);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "CLOSED") disconnected = true;
        if (status === "SUBSCRIBED" && disconnected) {
          disconnected = false;
          void catchUp();
        }
      });

    const handleOnline = () => { void catchUp(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    let stopForegroundPush = () => {};
    if (isBrowserPushConfigured() && typeof Notification !== "undefined" && "serviceWorker" in navigator) {
      void import("@/features/push/pushNotifications").then(({ listenForForegroundPushNotifications }) =>
        listenForForegroundPushNotifications(showToast)
      ).then((stop) => {
        if (active) stopForegroundPush = stop;
        else stop();
      }).catch((error: unknown) => console.error("CampusConnect foreground push notifications could not be started.", error));
    }

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopForegroundPush();
      void supabase.removeChannel(channel);
    };
  }, [queryClient, showToast, userId]);

  return (
    <>
      <PushPermissionPrompt userId={userId} pushEnabled={pushEnabled} />
      {toasts.length > 0 && (
        <div className="fixed inset-x-3 bottom-24 z-50 ml-auto flex max-w-sm flex-col gap-2 lg:bottom-4" aria-live="polite">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              className="rounded-xl border border-line bg-white px-4 py-3 text-left text-sm font-semibold text-fg shadow-lg"
              onClick={() => {
                setToasts((current) => current.filter((item) => item.id !== toast.id));
                navigate(safeAppPath(toast.to));
              }}
            >
              {toast.title && <span className="mb-1 block text-xs font-bold text-primary">{toast.title}</span>}
              <span>{toast.text}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
