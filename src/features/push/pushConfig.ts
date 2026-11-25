export type FirebaseBrowserConfig = {
  apiKey: string;
  appId: string;
  messagingSenderId: string;
  projectId: string;
  vapidKey: string;
};

export const PUSH_CONFIG_MISCONFIGURED_MESSAGE = "Push notifications are misconfigured.";

type FirebaseBrowserConfigResult =
  | { status: "missing" | "invalid"; config: null }
  | { status: "configured"; config: FirebaseBrowserConfig };

const invalidVariablesLogged = new Set<string>();

function logInvalidVariable(variable: string, reason: string) {
  if (invalidVariablesLogged.has(variable)) return;
  invalidVariablesLogged.add(variable);
  console.error(`Invalid Firebase push configuration: ${variable} ${reason}`);
}

function readFirebaseBrowserConfig(): FirebaseBrowserConfigResult {
  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_VAPID_KEY,
  } = import.meta.env;

  const variables = [
    ["VITE_FIREBASE_API_KEY", VITE_FIREBASE_API_KEY],
    ["VITE_FIREBASE_APP_ID", VITE_FIREBASE_APP_ID],
    ["VITE_FIREBASE_MESSAGING_SENDER_ID", VITE_FIREBASE_MESSAGING_SENDER_ID],
    ["VITE_FIREBASE_PROJECT_ID", VITE_FIREBASE_PROJECT_ID],
    ["VITE_FIREBASE_VAPID_KEY", VITE_FIREBASE_VAPID_KEY],
  ] as const;
  let invalid = false;
  for (const [variable, value] of variables) {
    if (!value) continue;
    if (/["',\s]/u.test(value)) {
      logInvalidVariable(variable, "must not contain quotes, commas, or whitespace.");
      invalid = true;
    } else if (variable === "VITE_FIREBASE_PROJECT_ID" && !/^[a-z0-9-]+$/.test(value)) {
      logInvalidVariable(variable, "must match /^[a-z0-9-]+$/.");
      invalid = true;
    }
  }
  if (invalid) return { status: "invalid", config: null };

  if (
    !VITE_FIREBASE_API_KEY
    || !VITE_FIREBASE_APP_ID
    || !VITE_FIREBASE_MESSAGING_SENDER_ID
    || !VITE_FIREBASE_PROJECT_ID
    || !VITE_FIREBASE_VAPID_KEY
  ) return { status: "missing", config: null };

  return {
    status: "configured",
    config: {
      apiKey: VITE_FIREBASE_API_KEY,
      appId: VITE_FIREBASE_APP_ID,
      messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
      projectId: VITE_FIREBASE_PROJECT_ID,
      vapidKey: VITE_FIREBASE_VAPID_KEY,
    },
  };
}

export function getFirebaseBrowserConfigStatus(): FirebaseBrowserConfigResult["status"] {
  return readFirebaseBrowserConfig().status;
}

export function getFirebaseBrowserConfig(): FirebaseBrowserConfig | null {
  return readFirebaseBrowserConfig().config;
}

export function isBrowserPushConfigured(): boolean {
  return getFirebaseBrowserConfig() !== null;
}

export function getPushServiceWorkerUrl(): string {
  const serviceWorkerPath = "/firebase-messaging-sw.js";
  const config = getFirebaseBrowserConfig();
  if (!config) return serviceWorkerPath;
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    projectId: config.projectId,
  });
  return `${serviceWorkerPath}?${params.toString()}`;
}
