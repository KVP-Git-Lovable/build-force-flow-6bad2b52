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

// ---------- Background Location Tracking ----------
// Capture location periodically even when app is closed via Background Sync API
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-location") {
    event.waitUntil(captureLocationInBackground());
  }
});

async function captureLocationInBackground() {
  try {
    // Get auth token from IndexedDB (set by main app during foreground activity)
    const token = await getAuthTokenFromStorage();
    if (!token) {
      console.log("No auth token in background, skipping location capture");
      return;
    }

    // Get current position with geolocation API
    let position;
    try {
      position = await new Promise((resolve, reject) => {
        // Note: geolocation in background is limited on some browsers
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        } else {
          reject(new Error("Geolocation not available"));
        }
      });
    } catch (geoError) {
      console.warn("Geolocation unavailable in background:", geoError.message);
      // Still need to retry or handle gracefully
      throw geoError;
    }

    const today = new Date().toISOString().split("T")[0];
    const locationData = {
      date: today,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      timestamp: new Date().toISOString(),
    };

    // Call Supabase edge function to save location
    const supabaseUrl = self.location.origin; // Will be used to construct edge function URL
    const response = await fetch(`${supabaseUrl}/functions/v1/capture-gps-location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(locationData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to save location: ${response.statusText} - ${error}`);
    }

    console.log("Location captured in background");
  } catch (error) {
    console.error("Error capturing location in background:", error);
    throw error; // Retry by browser
  }
}

async function getAuthTokenFromStorage() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["auth"], "readonly");
      const store = tx.objectStore("auth");
      const req = store.get("token");
      req.onsuccess = () => resolve(req.result?.value);
      req.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn("Error reading auth from IndexedDB:", error);
    return null;
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sbee-cables");
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("auth")) {
        db.createObjectStore("auth", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
