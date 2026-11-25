import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFirebaseBrowserConfig,
  getFirebaseBrowserConfigStatus,
  getPushServiceWorkerUrl,
} from "./pushConfig";

const firebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_VAPID_KEY",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubValidFirebaseEnv() {
  vi.stubEnv("VITE_FIREBASE_API_KEY", "web-api-key");
  vi.stubEnv("VITE_FIREBASE_APP_ID", "web-app-id");
  vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "web-sender-id");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "campusconnect-project");
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "public-vapid-key");
}

describe("getPushServiceWorkerUrl", () => {
  it("uses the root Firebase service worker even before Firebase is configured", () => {
    for (const key of firebaseEnvKeys) vi.stubEnv(key, "");
    expect(getPushServiceWorkerUrl()).toBe("/firebase-messaging-sw.js");
  });

  it("passes the frontend Firebase app config to that same root worker", () => {
    stubValidFirebaseEnv();

    const url = new URL(getPushServiceWorkerUrl(), "https://campusconnect.example");
    expect(url.pathname).toBe("/firebase-messaging-sw.js");
    expect(url.searchParams.get("apiKey")).toBe("web-api-key");
    expect(url.searchParams.get("appId")).toBe("web-app-id");
    expect(url.searchParams.get("messagingSenderId")).toBe("web-sender-id");
    expect(url.searchParams.get("projectId")).toBe("campusconnect-project");
  });
});

describe("Firebase browser configuration validation", () => {
  it.each([
    ["VITE_FIREBASE_API_KEY", "private api-key"],
    ["VITE_FIREBASE_APP_ID", 'web"app-id'],
    ["VITE_FIREBASE_MESSAGING_SENDER_ID", "123,456"],
    ["VITE_FIREBASE_VAPID_KEY", "public'vapid-key"],
  ] as const)("rejects invalid %s without logging its value", (variable, value) => {
    stubValidFirebaseEnv();
    vi.stubEnv(variable, value);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(getFirebaseBrowserConfigStatus()).toBe("invalid");
    expect(getFirebaseBrowserConfig()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining(variable));
    expect(error.mock.calls.flat().join(" ")).not.toContain(value);
  });

  it("rejects project IDs that do not match the Firebase project ID format", () => {
    stubValidFirebaseEnv();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "Campus_Connect");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(getFirebaseBrowserConfigStatus()).toBe("invalid");
    expect(getFirebaseBrowserConfig()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("VITE_FIREBASE_PROJECT_ID"));
    expect(error.mock.calls.flat().join(" ")).not.toContain("Campus_Connect");
  });

  it("distinguishes missing configuration from malformed values", () => {
    for (const key of firebaseEnvKeys) vi.stubEnv(key, "");

    expect(getFirebaseBrowserConfigStatus()).toBe("missing");
    expect(getFirebaseBrowserConfig()).toBeNull();
  });
});
