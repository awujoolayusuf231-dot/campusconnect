import { getApps, initializeApp, type FirebaseApp } from "@firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload, type Messaging } from "@firebase/messaging";
import { supabase } from "@/lib/supabase";
import {
  getFirebaseBrowserConfig,
  getFirebaseBrowserConfigStatus,
  getPushServiceWorkerUrl,
  PUSH_CONFIG_MISCONFIGURED_MESSAGE,
} from "./pushConfig";
import { safeAppPath } from "../../../supabase/functions/_shared/notificationRoute";
import { claimNotificationForDisplay } from "@/features/notifications/realtimeNotificationLogic";

export { getPushServiceWorkerUrl, isBrowserPushConfigured } from "./pushConfig";
export { requestPushPermission } from "./pushPermission";

let firebaseApp: FirebaseApp | undefined;
const PUSH_TOKEN_KEY = "campusconnect-push-token";
const PUSH_ENABLED_USER_KEY = "campusconnect-push-enabled-user";

function unsupportedPushMessage() {
  return "Web push is not available in this browser. On iPhone or iPad, add CampusConnect to your Home Screen (iOS/iPadOS 16.4+) and open it there.";
}

function firebaseConfig() {
  if (getFirebaseBrowserConfigStatus() === "invalid") {
    throw new Error(PUSH_CONFIG_MISCONFIGURED_MESSAGE);
  }
  const config = getFirebaseBrowserConfig();
  if (!config) {
    throw new Error("Browser push is not configured. Add the Firebase web app values and Web Push certificate key to .env.local.");
  }
  return config;
}

async function getMessagingContext(): Promise<{ messaging: Messaging; registration: ServiceWorkerRegistration; vapidKey: string }> {
  const config = firebaseConfig();
  if (!("serviceWorker" in navigator) || !("Notification" in window)) throw new Error(unsupportedPushMessage());
  if (!(await isSupported())) throw new Error(unsupportedPushMessage());
  firebaseApp ??= getApps()[0] ?? initializeApp({
    apiKey: config.apiKey,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    projectId: config.projectId,
  });
  const registration = await navigator.serviceWorker.register(getPushServiceWorkerUrl(), { scope: "/" });
  const worker = registration.installing ?? registration.waiting;
  if (worker && worker.state !== "activated") {
    await new Promise<void>((resolve, reject) => {
      const onStateChange = () => {
        if (worker.state === "activated") { worker.removeEventListener("statechange", onStateChange); resolve(); }
        else if (worker.state === "redundant") { worker.removeEventListener("statechange", onStateChange); reject(new Error("The push service worker could not be activated.")); }
      };
      worker.addEventListener("statechange", onStateChange);
      onStateChange();
    });
  }
  return { messaging: getMessaging(firebaseApp), registration, vapidKey: config.vapidKey };
}

export async function getPushNotificationStatus(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_push_subscription");
  if (error) throw error;
  return data === true;
}

async function registerCurrentPushToken(userId: string): Promise<void> {
  if (!userId) throw new Error("Sign in to enable notifications.");
  const { messaging, registration, vapidKey } = await getMessagingContext();
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return a browser push token.");
  const previousToken = localStorage.getItem(PUSH_TOKEN_KEY);
  const { error } = await supabase.rpc("register_push_subscription", { p_token: token });
  if (error) {
    console.error("CampusConnect push subscription registration failed.", error);
    throw error;
  }
  localStorage.setItem(PUSH_TOKEN_KEY, token);
  localStorage.setItem(PUSH_ENABLED_USER_KEY, userId);

  if (previousToken && previousToken !== token) {
    const { error: cleanupError } = await supabase.rpc("unregister_push_subscription", { p_token: previousToken });
    if (cleanupError) console.error("CampusConnect could not remove an outdated push subscription.", cleanupError);
  }
}

export async function enablePushNotifications(
  permissionRequest: Promise<NotificationPermission>,
  userId: string,
): Promise<void> {
  const permission = await permissionRequest;
  if (permission !== "granted") throw new Error(permission === "denied"
    ? "Notifications are blocked in your browser settings. Allow them for CampusConnect, then try again."
    : "Allow notifications to enable browser push.");
  await registerCurrentPushToken(userId);
}

export async function showPushTestNotification(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    throw new Error("Allow notifications in your browser before sending a test notification.");
  }
  const { registration } = await getMessagingContext();
  await registration.showNotification("Notifications are on", {
    body: "You'll get alerts from CampusConnect here.",
    tag: "push-test",
    icon: "/icons/campusconnect-192.png",
    data: { url: "/app/notifications" },
  });
}

export async function syncPushSubscription(userId: string): Promise<void> {
  if (!userId || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const optedIn = localStorage.getItem(PUSH_ENABLED_USER_KEY) === userId
    || await getPushNotificationStatus();
  if (!optedIn) return;
  await registerCurrentPushToken(userId);
}

export async function disablePushNotifications(userId: string): Promise<void> {
  let token = localStorage.getItem(PUSH_TOKEN_KEY);
  let messaging: Messaging | undefined;
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const context = await getMessagingContext();
    messaging = context.messaging;
    token = await getToken(context.messaging, {
      vapidKey: context.vapidKey,
      serviceWorkerRegistration: context.registration,
    }) || token;
  }
  if (token) {
    const { error } = await supabase.rpc("unregister_push_subscription", { p_token: token });
    if (error) {
      console.error("CampusConnect push subscription removal failed.", error);
      throw error;
    }
  }
  if (messaging) await deleteToken(messaging);
  localStorage.removeItem(PUSH_TOKEN_KEY);
  if (localStorage.getItem(PUSH_ENABLED_USER_KEY) === userId) localStorage.removeItem(PUSH_ENABLED_USER_KEY);
}

export async function unregisterPushNotificationsForSignOut() {
  const token = localStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  const { error } = await supabase.rpc("unregister_push_subscription", { p_token: token });
  if (error) {
    console.error("CampusConnect push subscription removal before sign-out failed.", error);
    throw error;
  }
  localStorage.removeItem(PUSH_TOKEN_KEY);
}

function notificationContent(payload: MessagePayload) {
  const data = payload.data ?? {};
  return {
    title: data.title || "CampusConnect",
    body: data.body || "You have a new update.",
    url: safeAppPath(data.url),
    tag: data.tag || "",
    notificationId: data.notification_id || "",
  };
}

export type ForegroundPushToast = { id: string; title?: string; text: string; to: string };

export async function listenForForegroundPushNotifications(
  showToast?: (toast: ForegroundPushToast) => void,
): Promise<() => void> {
  const { messaging } = await getMessagingContext();
  return onMessage(messaging, (payload) => {
    const content = notificationContent(payload);
    if (document.visibilityState === "visible" && showToast) {
      if ((content.notificationId || content.tag)
        && !claimNotificationForDisplay(content.notificationId, content.tag)) return;
      showToast({
        id: content.notificationId || content.tag,
        title: content.title,
        text: content.body,
        to: content.url,
      });
      return;
    }
    if (Notification.permission !== "granted") return;
    if ((content.notificationId || content.tag)
      && !claimNotificationForDisplay(content.notificationId, content.tag)) return;
    void navigator.serviceWorker.ready.then((registration) => registration.showNotification(content.title, {
      body: content.body,
      icon: "/icons/campusconnect-192.png",
      ...(content.tag ? { tag: content.tag, renotify: true } : {}),
      data: { url: content.url },
    })).catch((error: unknown) => console.error("Could not display a foreground push notification.", error));
  });
}
