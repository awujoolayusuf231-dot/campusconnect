import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = {
  notification?: { data?: { url?: string }; close: () => void };
  request?: { method: string; mode: string; url: string };
  respondWith?: (promise: Promise<unknown>) => void;
  waitUntil: (promise: Promise<unknown>) => void;
};

const serviceWorkerSource = readFileSync(
  resolve(process.cwd(), "public", "firebase-messaging-sw.js"),
  "utf8",
);

function initializeServiceWorker() {
  let backgroundHandler: ((payload: { data?: Record<string, string> }) => unknown) | undefined;
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const shellCache = { put: vi.fn().mockResolvedValue(undefined) };
  const cacheMatch = vi.fn().mockResolvedValue(undefined);
  const fetchRequest = vi.fn();
  const client = {
    url: "https://campusconnect.example/app",
    navigate: vi.fn().mockResolvedValue(undefined),
    focus: vi.fn().mockResolvedValue(undefined),
  };
  const self = {
    location: {
      href: "https://campusconnect.example/firebase-messaging-sw.js?apiKey=k&appId=a&messagingSenderId=s&projectId=p",
      origin: "https://campusconnect.example",
    },
    registration: { showNotification },
    clients: { matchAll: vi.fn().mockResolvedValue([client]), openWindow: vi.fn() },
    addEventListener: (type: string, listener: (event: WorkerEvent) => void) => listeners.set(type, listener),
  };
  const messaging = {
    onBackgroundMessage: (handler: (payload: { data?: Record<string, string> }) => unknown) => {
      backgroundHandler = handler;
    },
  };

  runInNewContext(serviceWorkerSource, {
    self,
    URL,
    caches: {
      match: cacheMatch,
      open: vi.fn().mockResolvedValue(shellCache),
    },
    fetch: fetchRequest,
    importScripts: vi.fn(),
    firebase: { initializeApp: vi.fn(), messaging: () => messaging },
  });

  if (!backgroundHandler) throw new Error("The service worker did not register its background message handler.");
  return { backgroundHandler, listeners, showNotification, client, shellCache, cacheMatch, fetchRequest };
}

describe("firebase messaging service worker", () => {
  it("shows data-only messages with their tag and focuses the requested app route", async () => {
    const { backgroundHandler, listeners, showNotification, client } = initializeServiceWorker();
    await backgroundHandler({
      data: {
        title: "New message",
        body: "Amina sent you a message",
        url: "/app/messages/conversation-1",
        tag: "message:conversation-1",
      },
    });

    expect(showNotification).toHaveBeenCalledWith("New message", expect.objectContaining({
      body: "Amina sent you a message",
      tag: "message:conversation-1",
      renotify: true,
      data: { url: "/app/messages/conversation-1" },
    }));

    let clickPromise: Promise<unknown> | undefined;
    listeners.get("notificationclick")?.({
      notification: { data: { url: "/app/messages/conversation-1" }, close: vi.fn() },
      waitUntil: (promise) => { clickPromise = promise; },
    });
    await clickPromise;
    expect(client.navigate).toHaveBeenCalledWith("https://campusconnect.example/app/messages/conversation-1");
    expect(client.focus).toHaveBeenCalledOnce();
  });

  it("omits tag options without a tag and falls back from non-app destinations", async () => {
    const { backgroundHandler, showNotification } = initializeServiceWorker();
    await backgroundHandler({ data: { url: "/app/../login" } });

    const options = showNotification.mock.calls[0]?.[1];
    expect(options).toMatchObject({ data: { url: "/app/notifications" } });
    expect(options).not.toHaveProperty("tag");
    expect(options).not.toHaveProperty("renotify");
  });

  it("serves the cached app shell immediately while refreshing it in the background", async () => {
    const { listeners, shellCache, cacheMatch, fetchRequest } = initializeServiceWorker();
    const cachedShell = { source: "cached" };
    const freshShell = {
      ok: true,
      headers: { get: () => "text/html; charset=utf-8" },
      clone: vi.fn(),
    };
    freshShell.clone.mockReturnValue(freshShell);
    cacheMatch.mockResolvedValue(cachedShell);
    fetchRequest.mockResolvedValue(freshShell);

    let response: Promise<unknown> | undefined;
    let update: Promise<unknown> | undefined;
    listeners.get("fetch")?.({
      request: { method: "GET", mode: "navigate", url: "https://campusconnect.example/app/feed" },
      respondWith: (promise) => { response = promise; },
      waitUntil: (promise) => { update = promise; },
    });

    await expect(response).resolves.toBe(cachedShell);
    await update;
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(shellCache.put).toHaveBeenCalledWith("/index.html", freshShell);
  });
});
