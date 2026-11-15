export type FirebaseBrowserConfig = {
  apiKey: string;
  appId: string;
  messagingSenderId: string;
  projectId: string;
  vapidKey: string;
};

export function getFirebaseBrowserConfig(): FirebaseBrowserConfig | null {
  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_VAPID_KEY,
  } = import.meta.env;
  if (
    !VITE_FIREBASE_API_KEY
    || !VITE_FIREBASE_APP_ID
    || !VITE_FIREBASE_MESSAGING_SENDER_ID
    || !VITE_FIREBASE_PROJECT_ID
    || !VITE_FIREBASE_VAPID_KEY
  ) return null;

  return {
    apiKey: VITE_FIREBASE_API_KEY,
    appId: VITE_FIREBASE_APP_ID,
    messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
    projectId: VITE_FIREBASE_PROJECT_ID,
    vapidKey: VITE_FIREBASE_VAPID_KEY,
  };
}

export function isBrowserPushConfigured(): boolean {
  return getFirebaseBrowserConfig() !== null;
}

export function getPushServiceWorkerUrl(): string {
  const config = getFirebaseBrowserConfig();
  if (!config) return "/sw.js";
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    projectId: config.projectId,
  });
  return `/sw.js?${params.toString()}`;
}
