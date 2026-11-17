import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { timeAgo } from "@/lib/time";
import { LoadingState } from "@/app/LoadingState";
import { disablePushNotifications, enablePushNotifications, getPushNotificationStatus, requestPushPermission, showPushTestNotification } from "@/features/push/pushNotifications";
import { getFirebaseBrowserConfigStatus, PUSH_CONFIG_MISCONFIGURED_MESSAGE } from "@/features/push/pushConfig";
import { isIOSDevice, isStandalone, supportsPush } from "@/features/push/PushPermissionPrompt";
import { describeNotification, type NotificationCopyInput } from "./notificationCopy";

export interface Notif extends NotificationCopyInput {
  id: number;
  created_at: string;
  read_at: string | null;
}
export { describeNotification } from "./notificationCopy";
const PAGE = 30;
const PREFS: [string, string, boolean?][] = [
  ["notify_follows", "New followers"],
  ["notify_likes", "Likes"],
  ["notify_comments", "Comments"],
  ["notify_community", "Community activity"],
  ["notify_messages", "Messages"],
  ["notify_discussions", "Assignment discussion replies"],
  ["notify_followed_posts", "New posts from people I follow", false],
  ["notify_celebrations", "Celebration cards"],
  ["notify_push", "Browser push notifications"],
];

export function NotificationsPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const pushConfigStatus = getFirebaseBrowserConfigStatus();
  const [testFeedback, setTestFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [testPending, setTestPending] = useState(false);
  const testFeedbackTimer = useRef<number | null>(null);
  const iosInstallRequired = isIOSDevice() && !isStandalone();
  const pushSupported = supportsPush();
  useEffect(() => () => {
    if (testFeedbackTimer.current !== null) window.clearTimeout(testFeedbackTimer.current);
  }, []);
  const sendTestNotification = async () => {
    setTestPending(true);
    try {
      await showPushTestNotification();
      setTestFeedback({ kind: "success", text: "Notifications enabled. A test notification was sent." });
    } catch (error) {
      console.error("CampusConnect could not show the test notification.", error);
      setTestFeedback({
        kind: "error",
        text: "The test notification could not be shown. Check your browser and OS notification settings.",
      });
    } finally {
      setTestPending(false);
      if (testFeedbackTimer.current !== null) window.clearTimeout(testFeedbackTimer.current);
      testFeedbackTimer.current = window.setTimeout(() => setTestFeedback(null), 5000);
    }
  };
  const list = useInfiniteQuery({ queryKey: ["notifications"], initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => { const { data, error } = await supabase.rpc("notifications_list", { p_before: pageParam, p_limit: PAGE }); if (error) throw error; return (data ?? []) as Notif[]; },
    getNextPageParam: (last): number | undefined => (last.length === PAGE ? last[last.length - 1]?.id : undefined) });
  const items = list.data?.pages.flat() ?? [];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); void qc.invalidateQueries({ queryKey: ["unread"] }); };
  const markAll = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("mark_notifications_read"); if (error) throw error; }, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: async (id: number) => { const { error } = await supabase.rpc("mark_notifications_read", { p_ids: [id] }); if (error) throw error; }, onSuccess: refresh });
  const prefs = useQuery({ queryKey: ["prefs", uid], enabled: !!uid, queryFn: async () => { const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", uid).maybeSingle(); if (error) throw error; return (data ?? {}) as Record<string, boolean>; } });
  const savePref = useMutation({ mutationFn: async (v: { key: string; on: boolean }) => {
    const { error } = await supabase.from("user_preferences").upsert({ user_id: uid, [v.key]: v.on }, { onConflict: "user_id" });
    if (error) {
      console.error("Could not save notification preference.", error);
      throw error;
    }
  }, onSuccess: () => void qc.invalidateQueries({ queryKey: ["prefs"] }) });
  const pushStatus = useQuery({ queryKey: ["push-subscription", uid], enabled: !!uid && pushConfigStatus === "configured", queryFn: getPushNotificationStatus });
  const enablePush = useMutation({ mutationFn: (permissionRequest: Promise<NotificationPermission>) => enablePushNotifications(permissionRequest, uid), onSuccess: () => {
    void qc.invalidateQueries({ queryKey: ["push-subscription", uid] });
    void sendTestNotification();
  } });
  const disablePush = useMutation({ mutationFn: () => disablePushNotifications(uid), onSuccess: () => void qc.invalidateQueries({ queryKey: ["push-subscription", uid] }) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Notifications</h1><button className="btn" disabled={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</button></div>
      {list.isLoading && <LoadingState label="Gathering your notifications" variant="panel" />}
      {list.isError && <p role="alert" className="err">Could not load notifications.</p>}
      {!list.isLoading && items.length === 0 && <p className="card text-center text-muted">You are all caught up.</p>}
      <ul className="space-y-2">{items.map((n) => { const d = describeNotification(n); const body = <><span className={n.read_at ? "" : "font-semibold"}>{d.text}</span><span className="ml-2 text-xs text-muted">{timeAgo(n.created_at)}</span></>;
        return <li key={n.id} className={`card flex items-center justify-between gap-2 ${n.read_at ? "" : "border-primary"}`}>
          {d.to ? <Link to={d.to} onClick={() => markOne.mutate(n.id)} className="flex-1 hover:underline">{body}</Link> : <span className="flex-1">{body}</span>}
          {!n.read_at && <button className="text-xs underline text-muted" onClick={() => markOne.mutate(n.id)}>Mark read</button>}</li>; })}</ul>
      {list.hasNextPage && <button className="btn w-full" onClick={() => void list.fetchNextPage()}>Load more</button>}
      <section className="card space-y-2"><h2 className="font-medium">Notify me about</h2>
        {PREFS.map(([key, label, defaultValue]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.data?.[key] ?? defaultValue ?? true} disabled={savePref.isPending} onChange={(e) => savePref.mutate({ key, on: e.target.checked })} />{label}</label>)}
        <p className="text-xs text-muted">Platform announcements and moderator warnings are always delivered.</p>
        {savePref.isError && <p role="alert" className="err">Could not save your preference: {(savePref.error as Error).message}</p>}</section>
      <section className="card space-y-2"><h2 className="font-medium">This device</h2>
        {typeof Notification !== "undefined" && Notification.permission === "denied" && <p className="text-xs text-muted">Notifications are blocked. Open this site's browser settings, change Notifications to Allow, then reload CampusConnect.</p>}
        {pushConfigStatus === "invalid" ? <p role="alert" className="err">{PUSH_CONFIG_MISCONFIGURED_MESSAGE}</p>
          : pushConfigStatus === "missing" ? <p className="text-sm text-muted">Browser push is not configured for this app yet.</p>
          : iosInstallRequired ? <div className="text-sm text-muted">
            <p>Add CampusConnect to your Home Screen to receive notifications:</p>
            <ol className="mt-1 list-inside list-decimal">
              <li>In Safari, tap Share.</li><li>Choose “Add to Home Screen”.</li><li>Open CampusConnect from your Home Screen.</li>
            </ol>
          </div>
          : !pushSupported ? <p className="text-sm text-muted">Browser push is not supported on this device. Try a supported browser over HTTPS.</p>
          : pushStatus.isLoading ? <LoadingState label="Checking this device" />
            : pushStatus.isError ? <p role="alert" className="err">Could not check this device's push status: {(pushStatus.error as Error).message}</p>
              : <><p className="text-sm text-muted">{pushStatus.data ? "This device is registered for browser push." : "This device is not registered for browser push."}</p>
                {typeof Notification !== "undefined" && Notification.permission === "default" && <p className="text-xs text-muted">Select “Enable on this device”; your browser will then ask you to allow notifications.</p>}
                <button className="btn min-h-10 rounded-xl px-4 font-bold" disabled={enablePush.isPending || disablePush.isPending}
                  onClick={() => {
                    if (pushStatus.data) {
                      disablePush.mutate();
                      return;
                    }
                    enablePush.mutate(requestPushPermission());
                  }}>
                  {enablePush.isPending || disablePush.isPending ? "Updating…" : pushStatus.data ? "Disable on this device" : "Enable on this device"}
                </button>
                {pushStatus.data && prefs.data?.notify_push !== false && <button className="btn min-h-10 rounded-xl px-4" disabled={testPending} onClick={() => void sendTestNotification()}>
                  {testPending ? "Sending test…" : "Send test notification"}
                </button>}
                {testFeedback && <div role={testFeedback.kind === "error" ? "alert" : "status"} className="fixed bottom-24 right-3 z-50 max-w-sm rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-fg shadow-lg lg:bottom-4">{testFeedback.text}</div>}
                {enablePush.isError && <p role="alert" className="err">Could not enable notifications: {(enablePush.error as Error).message}</p>}
                {disablePush.isError && <p role="alert" className="err">Could not disable notifications: {(disablePush.error as Error).message}</p>}</>}
      </section>
    </div>
  );
}
