// TG Monitor Service Worker - PWA + Push v6
const CACHE_NAME = "tg-monitor-v6";
const STATIC_ASSETS = ["/", "/register"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("/api/")) return;
  if (event.request.url.includes("supabase")) return;
  event.respondWith(
    fetch(event.request)
      .then((r) => {
        if (r.status === 200) {
          const c = r.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, c));
        }
        return r;
      })
      .catch(() => caches.match(event.request))
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || "",
    icon: "/pwa-icons/icon-192.png",
    badge: "/pwa-icons/icon-72.png",
    tag: data.tag || "tg-monitor",
    renotify: true,
    data: { url: data.url || "/alerts" },
  };
  if (data.vibrate) options.vibrate = [200, 100, 200, 100, 200];
  if (data.sound) options.silent = false;
  event.waitUntil(self.registration.showNotification(data.title || "TG Monitor", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/alerts";
  const fullUrl = self.location.origin + path;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Try to find and focus an existing window
      for (const client of windowClients) {
        try {
          if (client.url && client.url.startsWith(self.location.origin)) {
            client.postMessage({ type: "NAVIGATE", url: path });
            return client.focus();
          }
        } catch (e) {}
      }
      // No existing window found - open new one
      return clients.openWindow(fullUrl);
    })
  );
});
