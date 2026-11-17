import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = {
  notification: { data?: { url?: string }; close: () => void };
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
    importScripts: vi.fn(),
    firebase: { initializeApp: vi.fn(), messaging: () => messaging },
  });

  if (!backgroundHandler) throw new Error("The service worker did not register its background message handler.");
  return { backgroundHandler, listeners, showNotification, client };
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
});
