/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = { title: '🔔 우리 가족 금융', body: '새 변경이 있어요' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url ?? '/home' },
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/home';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      // 이미 열린 탭이 있으면 포커스 + 라우팅
      for (const c of clients) {
        if ('focus' in c) {
          await (c as WindowClient).focus();
          if ('navigate' in c) (c as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    }),
  );
});

// GET 캐시 전략 (오프라인 읽기) — 우리 API 응답
self.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open('api-cache').then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m ?? new Response(null, { status: 503 }))),
    );
  }
});
