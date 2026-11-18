const CACHE_NAME = "campusconnect-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/campusconnect-icon.svg",
  "/apple-touch-icon.png",
  "/icons/campusconnect-192.png",
  "/icons/campusconnect-512.png",
  "/icons/campusconnect-maskable-512.png",
];

const firebaseParams = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: firebaseParams.get("apiKey"),
  appId: firebaseParams.get("appId"),
  messagingSenderId: firebaseParams.get("messagingSenderId"),
  projectId: firebaseParams.get("projectId"),
};
function safeAppPath(path) {
  if (typeof path !== "string" || !path.startsWith("/app/")) return "/app/notifications";
  const url = new URL(path, self.location.origin);
  return url.origin === self.location.origin && url.pathname.startsWith("/app/")
    ? `${url.pathname}${url.search}${url.hash}`
    : "/app/notifications";
}

if (Object.values(firebaseConfig).every(Boolean)) {
  importScripts(
    "https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js",
  );
  firebase.initializeApp(firebaseConfig);
  firebase.messaging().onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const tag = typeof data.tag === "string" ? data.tag : "";
    const url = safeAppPath(data.url);
    return self.registration.showNotification(data.title || "CampusConnect", {
      body: data.body || "You have a new update.",
      icon: "/icons/campusconnect-192.png",
      ...(tag ? { tag, renotify: true } : {}),
      data: { url },
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(safeAppPath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      return existing.navigate(destination).then(() => existing.focus());
    }
    return self.clients.openWindow(destination);
  }));
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const updateShell = fetch(request).then((response) => {
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return response;
      return caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", response.clone())).then(() => response);
    });
    event.waitUntil(updateShell.then(() => undefined).catch(() => undefined));
    event.respondWith(caches.match("/index.html").then((cached) => cached ?? updateShell));
    return;
  }

  if (url.pathname.startsWith("/assets/") || APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
