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
if (Object.values(firebaseConfig).every(Boolean)) {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js",
  );
  firebase.initializeApp(firebaseConfig);
  firebase.messaging().onBackgroundMessage((payload) => {
    const data = payload.data || {};
    return self.registration.showNotification(data.title || "CampusConnect", {
      body: data.body || "You have a new update.",
      icon: "/icons/campusconnect-192.png",
      data: { url: data.url || "/app/notifications" },
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/app/notifications";
  const parsedDestination = new URL(path, self.location.origin);
  const destination = (parsedDestination.origin === self.location.origin ? parsedDestination : new URL("/app/notifications", self.location.origin)).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      void existing.navigate(destination);
      return existing.focus();
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
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/index.html"))),
    );
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
