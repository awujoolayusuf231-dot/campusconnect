import { afterEach, describe, expect, it, vi } from "vitest";
import { getPushServiceWorkerUrl } from "./pushConfig";

const firebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_VAPID_KEY",
] as const;

afterEach(() => vi.unstubAllEnvs());

describe("getPushServiceWorkerUrl", () => {
  it("uses the root Firebase service worker even before Firebase is configured", () => {
    for (const key of firebaseEnvKeys) vi.stubEnv(key, "");
    expect(getPushServiceWorkerUrl()).toBe("/firebase-messaging-sw.js");
  });

  it("passes the frontend Firebase app config to that same root worker", () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "web-api-key");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "web-app-id");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "web-sender-id");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "campusconnect-project");
    vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "public-vapid-key");

    const url = new URL(getPushServiceWorkerUrl(), "https://campusconnect.example");
    expect(url.pathname).toBe("/firebase-messaging-sw.js");
    expect(url.searchParams.get("apiKey")).toBe("web-api-key");
    expect(url.searchParams.get("appId")).toBe("web-app-id");
    expect(url.searchParams.get("messagingSenderId")).toBe("web-sender-id");
    expect(url.searchParams.get("projectId")).toBe("campusconnect-project");
  });
});
