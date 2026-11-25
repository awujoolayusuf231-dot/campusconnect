import { useEffect, useRef, useState } from "react";
import { requestPushPermission } from "./pushPermission";
import { isBrowserPushConfigured } from "./pushConfig";
import {
  getPushPermissionPromptMode,
  PUSH_PROMPT_DISMISSED_KEY,
  PUSH_PROMPT_SESSION_KEY,
  type PushPermissionPromptMode,
} from "./pushPermissionPromptLogic";

const PROMPT_DELAY_MS = 3000;
const FEEDBACK_DURATION_MS = 5000;

export function isIOSDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (window.matchMedia?.("(display-mode: standalone)").matches ?? false)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function supportsPush(): boolean {
  return typeof Notification !== "undefined"
    && "serviceWorker" in navigator
    && typeof (window as Window & { PushManager?: unknown }).PushManager !== "undefined"
    && window.isSecureContext !== false;
}

export function PushPermissionPrompt({
  userId,
  pushEnabled,
}: {
  userId: string;
  pushEnabled: boolean | null;
}) {
  const [mode, setMode] = useState<PushPermissionPromptMode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const sessionShownRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (pushEnabled !== true) {
      setMode(null);
      return;
    }
    if (!userId || !isBrowserPushConfigured()) return;
    const timer = window.setTimeout(() => {
      let shownThisSession = sessionShownRef.current;
      try {
        shownThisSession ||= sessionStorage.getItem(`${PUSH_PROMPT_SESSION_KEY}:${userId}`) === "1";
      } catch (storageError) {
        console.warn("CampusConnect could not read push prompt session state.", storageError);
      }

      let dismissedAt: number | null = null;
      try {
        const stored = localStorage.getItem(`${PUSH_PROMPT_DISMISSED_KEY}:${userId}`);
        const parsed = stored === null ? NaN : Number(stored);
        if (Number.isFinite(parsed)) dismissedAt = parsed;
      } catch (storageError) {
        console.warn("CampusConnect could not read push prompt dismissal state.", storageError);
      }

      const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
      const promptMode = getPushPermissionPromptMode({
        permission,
        supported: supportsPush(),
        pushEnabled,
        isIOS: isIOSDevice(),
        standalone: isStandalone(),
        dismissedAt,
        shownThisSession,
        now: Date.now(),
      });
      if (!promptMode) return;

      sessionShownRef.current = true;
      setMode(promptMode);
      try {
        sessionStorage.setItem(`${PUSH_PROMPT_SESSION_KEY}:${userId}`, "1");
      } catch (storageError) {
        console.warn("CampusConnect could not save push prompt session state.", storageError);
      }
    }, PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pushEnabled, userId]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const showFeedback = (next: { kind: "success" | "error"; text: string }) => {
    setFeedback(next);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(`${PUSH_PROMPT_DISMISSED_KEY}:${userId}`, String(Date.now()));
    } catch (storageError) {
      console.warn("CampusConnect could not save push prompt dismissal state.", storageError);
    }
    setMode(null);
  };

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const permissionRequest = requestPushPermission();
      const { enablePushNotifications, showPushTestNotification } = await import("./pushNotifications");
      await enablePushNotifications(permissionRequest, userId);
      setMode(null);
      try {
        await showPushTestNotification();
        showFeedback({ kind: "success", text: "Notifications enabled. A test notification was sent." });
      } catch (testError) {
        console.error("CampusConnect enabled push, but could not show the test notification.", testError);
        showFeedback({
          kind: "error",
          text: "Notifications are enabled, but the test could not be shown. Check your browser and OS notification settings.",
        });
      }
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {mode && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <section role="dialog" aria-modal="true" aria-labelledby="push-prompt-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="push-prompt-title" className="text-lg font-extrabold text-fg">
              {mode === "ios-install" ? "Add CampusConnect to your Home Screen" : "Get CampusConnect alerts"}
            </h2>
            {mode === "ios-install" ? (
              <>
                <p className="mt-2 text-sm leading-6 text-muted">Add the site to your iPhone or iPad Home Screen to receive notifications:</p>
                <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-fg">
                  <li>In Safari, tap the Share button.</li>
                  <li>Choose “Add to Home Screen”.</li>
                  <li>Open CampusConnect from your Home Screen.</li>
                </ol>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted">Get alerts for messages, follows, and replies even when CampusConnect isn't open.</p>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn min-h-10 rounded-xl px-4" disabled={busy} onClick={dismiss}>Not now</button>
              {mode === "enable" && (
                <button type="button" className="btn min-h-10 rounded-xl px-4 font-bold" disabled={busy} onClick={() => void enable()}>
                  {busy ? "Enabling…" : "Enable notifications"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {feedback && (
        <div role={feedback.kind === "error" ? "alert" : "status"} className="fixed bottom-24 right-3 z-[70] max-w-sm rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-fg shadow-lg lg:bottom-4">
          {feedback.text}
        </div>
      )}
    </>
  );
}
