import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationStatus,
  requestPushPermission,
  showPushTestNotification,
} from "@/features/push/pushNotifications";
import { getFirebaseBrowserConfigStatus, PUSH_CONFIG_MISCONFIGURED_MESSAGE } from "@/features/push/pushConfig";
import { isIOSDevice, isStandalone, supportsPush } from "@/features/push/PushPermissionPrompt";
import { supabase } from "@/lib/supabase";

type PreferenceKey =
  | "notify_enabled"
  | "notify_follows"
  | "notify_likes"
  | "notify_comments"
  | "notify_community"
  | "notify_messages"
  | "notify_discussions"
  | "notify_followed_posts"
  | "notify_celebrations"
  | "notify_voice"
  | "notify_collaboration"
  | "notify_email"
  | "marketing_email_consent"
  | "notify_push";

const categories: { key: PreferenceKey; label: string; defaultValue?: boolean }[] = [
  { key: "notify_follows", label: "New followers" },
  { key: "notify_likes", label: "Likes and reposts" },
  { key: "notify_comments", label: "Comments" },
  { key: "notify_community", label: "Community activity" },
  { key: "notify_messages", label: "Messages" },
  { key: "notify_discussions", label: "Assignment discussion replies" },
  { key: "notify_followed_posts", label: "New posts from people I follow", defaultValue: false },
  { key: "notify_celebrations", label: "Celebration cards and reminders" },
  { key: "notify_voice", label: "Voice Space invitations" },
  { key: "notify_collaboration", label: "Project and competition activity" },
  { key: "notify_email", label: "Email activity notifications", defaultValue: false },
  { key: "notify_push", label: "Browser push notifications" },
];

function PreferenceSwitch({ label, checked, disabled, onChange }: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled}
    onClick={onChange}
    className={`flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-2 text-left text-sm transition hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50`}>
    <span>{label}</span>
    <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-primary" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
    </span>
  </button>;
}

export function NotificationSettings() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const uid = session?.user.id ?? "";
  const configStatus = getFirebaseBrowserConfigStatus();
  const iosInstallRequired = isIOSDevice() && !isStandalone();
  const pushSupported = supportsPush();
  const [testFeedback, setTestFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [testPending, setTestPending] = useState(false);
  const testFeedbackTimer = useRef<number | null>(null);
  const preferences = useQuery({
    queryKey: ["prefs", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", uid).maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, boolean>;
    },
  });
  const savePreference = useMutation({
    mutationFn: async ({ key, enabled }: { key: PreferenceKey; enabled: boolean }) => {
      const { data: existing, error: lookupError } = await supabase.from("user_preferences")
        .select("user_id").eq("user_id", uid).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) {
        const { error: insertError } = await supabase.from("user_preferences").insert({ user_id: uid, [key]: enabled });
        if (!insertError) return;
        if (insertError.code !== "23505") throw insertError;
      }
      const { error } = await supabase.from("user_preferences").update({ [key]: enabled }).eq("user_id", uid);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["prefs", uid] }); },
  });
  const pushStatus = useQuery({
    queryKey: ["push-subscription", uid],
    enabled: !!uid && configStatus === "configured",
    queryFn: getPushNotificationStatus,
  });
  const enablePush = useMutation({
    mutationFn: (permissionRequest: Promise<NotificationPermission>) => enablePushNotifications(permissionRequest, uid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["push-subscription", uid] });
      void sendTestNotification();
    },
  });
  const disablePush = useMutation({
    mutationFn: () => disablePushNotifications(uid),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["push-subscription", uid] }); },
  });

  useEffect(() => () => {
    if (testFeedbackTimer.current !== null) window.clearTimeout(testFeedbackTimer.current);
  }, []);

  async function sendTestNotification() {
    setTestPending(true);
    try {
      await showPushTestNotification();
      setTestFeedback({ kind: "success", text: "Notifications enabled. A test notification was sent." });
    } catch (error) {
      console.error("CampusConnect could not show the test notification.", error);
      setTestFeedback({ kind: "error", text: "The test notification could not be shown. Check your browser and OS notification settings." });
    } finally {
      setTestPending(false);
      if (testFeedbackTimer.current !== null) window.clearTimeout(testFeedbackTimer.current);
      testFeedbackTimer.current = window.setTimeout(() => setTestFeedback(null), 5000);
    }
  }

  const values = preferences.data ?? {};
  const getValue = (key: PreferenceKey, fallback = true) => values[key] ?? fallback;

  return <section className="card space-y-3">
    <div>
      <h2 className="font-medium">Notification settings</h2>
      <p className="mt-1 text-xs leading-5 text-muted">Choose which activity updates you receive. Account and essential service messages may still be sent.</p>
    </div>
    {preferences.isLoading && <p className="text-sm text-muted">Loading notification preferences…</p>}
    {preferences.isError && <p role="alert" className="text-sm text-danger">Could not load notification preferences: {(preferences.error as Error).message}</p>}
    {preferences.data && <>
      <PreferenceSwitch label="Enable notifications" checked={getValue("notify_enabled")}
        disabled={savePreference.isPending} onChange={() => savePreference.mutate({ key: "notify_enabled", enabled: !getValue("notify_enabled") })} />
      <div className="space-y-1 border-t border-line pt-2">
        <h3 className="px-2 text-xs font-bold uppercase tracking-wide text-muted">Notification types</h3>
        {categories.map(({ key, label, defaultValue }) => <PreferenceSwitch key={key} label={label}
          checked={getValue(key, defaultValue ?? true)}
          disabled={savePreference.isPending || !getValue("notify_enabled")}
          onChange={() => savePreference.mutate({ key, enabled: !getValue(key, defaultValue ?? true) })} />)}
      </div>
      <div className="border-t border-line pt-2">
        <PreferenceSwitch label="Campus news and product updates (marketing)" checked={getValue("marketing_email_consent", false)}
          disabled={savePreference.isPending}
          onChange={() => savePreference.mutate({ key: "marketing_email_consent", enabled: !getValue("marketing_email_consent", false) })} />
        <p className="px-2 text-xs text-muted">Marketing consent is separate from activity notifications. Verified addresses and provider unsubscribe choices are always respected.</p>
      </div>
      {savePreference.isError && <p role="alert" className="text-sm text-danger">Could not save your preference: {(savePreference.error as Error).message}</p>}
    </>}
    <div className="space-y-2 border-t border-line pt-3">
      <h3 className="font-medium">This device</h3>
      {typeof Notification !== "undefined" && Notification.permission === "denied" && <p className="text-xs text-muted">Notifications are blocked. Change this site's notification permission in your browser settings, then reload CampusConnect.</p>}
      {configStatus === "invalid" ? <p role="alert" className="err">{PUSH_CONFIG_MISCONFIGURED_MESSAGE}</p>
        : configStatus === "missing" ? <p className="text-sm text-muted">Browser push is not configured for this app yet.</p>
        : iosInstallRequired ? <div className="text-sm text-muted">
          <p>Add CampusConnect to your Home Screen to receive notifications:</p>
          <ol className="mt-1 list-inside list-decimal"><li>In Safari, tap Share.</li><li>Choose “Add to Home Screen”.</li><li>Open CampusConnect from your Home Screen.</li></ol>
        </div>
        : !pushSupported ? <p className="text-sm text-muted">Browser push is not supported on this device. Try a supported browser over HTTPS.</p>
        : pushStatus.isLoading ? <p className="text-sm text-muted">Checking this device…</p>
        : pushStatus.isError ? <p role="alert" className="err">Could not check this device's push status: {(pushStatus.error as Error).message}</p>
        : <>
          <p className="text-sm text-muted">{pushStatus.data ? "This device is registered for browser push." : "This device is not registered for browser push."}</p>
          {typeof Notification !== "undefined" && Notification.permission === "default" && <p className="text-xs text-muted">Select “Enable on this device”; your browser will then ask you to allow notifications.</p>}
          <button className="btn min-h-10 rounded-xl px-4 font-bold" disabled={enablePush.isPending || disablePush.isPending || (!pushStatus.data && !getValue("notify_enabled"))}
            aria-disabled={!pushStatus.data && !getValue("notify_enabled")}
            onClick={() => pushStatus.data ? disablePush.mutate() : enablePush.mutate(requestPushPermission())}>
            {enablePush.isPending || disablePush.isPending ? "Updating…" : pushStatus.data ? "Disable on this device" : "Enable on this device"}
          </button>
          {!getValue("notify_enabled") && !pushStatus.data && <p className="mt-1 text-xs text-muted">Turn on notifications to enable browser push.</p>}
          {pushStatus.data && getValue("notify_enabled") && getValue("notify_push") && <button className="btn ml-2 min-h-10 rounded-xl px-4" disabled={testPending} onClick={() => void sendTestNotification()}>
            {testPending ? "Sending test…" : "Send test notification"}
          </button>}
          {enablePush.isError && <p role="alert" className="err">Could not enable notifications: {(enablePush.error as Error).message}</p>}
          {disablePush.isError && <p role="alert" className="err">Could not disable notifications: {(disablePush.error as Error).message}</p>}
        </>}
    </div>
    {testFeedback && <div role={testFeedback.kind === "error" ? "alert" : "status"} className="fixed bottom-24 right-3 z-50 max-w-sm rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-fg shadow-lg lg:bottom-4">{testFeedback.text}</div>}
  </section>;
}
