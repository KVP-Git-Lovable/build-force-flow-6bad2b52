// SBEE Cables PWA service worker: app-shell runtime cache + web push + offline support.
// NOTE: registration is guarded in src/main.tsx (skipped in Lovable preview/dev).

const RUNTIME_CACHE = "sbee-cables-runtime-v2";
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
  );
  // Do NOT skipWaiting automatically — wait for user to accept the update prompt
  // so we don't hot-swap chunks mid-session.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOriginGet(request, url) {
  return request.method === "GET" && url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (!isSameOriginGet(request, url)) return;
  // Skip Supabase / API / auth callbacks / SW / build meta
  if (url.pathname.startsWith("/sw.js")) return;
  if (url.pathname.startsWith("/build-meta.json")) return;
  if (url.pathname.startsWith("/~oauth")) return;

  // HTML navigations: NetworkFirst with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(OFFLINE_URL, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = (await cache.match(request)) || (await cache.match(OFFLINE_URL));
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Hashed built assets: CacheFirst
  if (/\/assets\/.+\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|gif)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          return cached || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Other same-origin GETs (icons, manifest, etc): StaleWhileRevalidate
  if (/\.(png|jpg|jpeg|svg|webp|gif|ico|webmanifest|json)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((resp) => {
            if (resp.ok) cache.put(request, resp.clone()).catch(() => {});
            return resp;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

// ---------- Web Push (unchanged behavior) ----------
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "Jovo", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "SBEE Cables";
  const options = {
    body: payload.message || payload.body || "",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
    tag: payload.tag || undefined,
    data: payload.data || { url: "/" },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
