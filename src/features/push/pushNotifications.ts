import { getApps, initializeApp, type FirebaseApp } from "@firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload, type Messaging } from "@firebase/messaging";
import { supabase } from "@/lib/supabase";
import { getFirebaseBrowserConfig, getPushServiceWorkerUrl } from "./pushConfig";

export { getPushServiceWorkerUrl, isBrowserPushConfigured } from "./pushConfig";

let firebaseApp: FirebaseApp | undefined;
const PUSH_TOKEN_KEY = "campusconnect-push-token";

function firebaseConfig() {
  const config = getFirebaseBrowserConfig();
  if (!config) {
    throw new Error("Browser push is not configured. Add the Firebase web app values and Web Push certificate key to .env.local.");
  }
  return config;
}

async function getMessagingContext(): Promise<{ messaging: Messaging; registration: ServiceWorkerRegistration; vapidKey: string }> {
  const config = firebaseConfig();
  if (!("serviceWorker" in navigator) || !("Notification" in window)) throw new Error("This browser does not support web push notifications.");
  if (!(await isSupported())) throw new Error("This browser does not support Firebase web push notifications.");
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

export async function enablePushNotifications(): Promise<void> {
  const { messaging, registration, vapidKey } = await getMessagingContext();
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error(permission === "denied"
    ? "Notifications are blocked in your browser settings. Allow them for CampusConnect, then try again."
    : "Allow notifications to enable browser push.");
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return a browser push token.");
  const { error } = await supabase.rpc("register_push_subscription", { p_token: token });
  if (error) {
    await deleteToken(messaging);
    throw error;
  }
  localStorage.setItem(PUSH_TOKEN_KEY, token);
}

export async function disablePushNotifications(): Promise<void> {
  const { messaging, registration, vapidKey } = await getMessagingContext();
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (token) {
    const { error } = await supabase.rpc("unregister_push_subscription", { p_token: token });
    if (error) throw error;
  }
  await deleteToken(messaging);
  localStorage.removeItem(PUSH_TOKEN_KEY);
}

export async function unregisterPushNotificationsForSignOut() {
  const token = localStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  const { error } = await supabase.rpc("unregister_push_subscription", { p_token: token });
  if (error) throw error;
  localStorage.removeItem(PUSH_TOKEN_KEY);
}

function notificationContent(payload: MessagePayload) {
  const data = payload.data ?? {};
  return {
    title: data.title || "CampusConnect",
    body: data.body || "You have a new update.",
    url: data.url || "/app/notifications",
  };
}

export async function listenForForegroundPushNotifications(): Promise<() => void> {
  const { messaging } = await getMessagingContext();
  return onMessage(messaging, (payload) => {
    if (Notification.permission !== "granted") return;
    const content = notificationContent(payload);
    void navigator.serviceWorker.ready.then((registration) => registration.showNotification(content.title, {
      body: content.body,
      icon: "/icons/campusconnect-192.png",
      data: { url: content.url },
    }));
  });
}
