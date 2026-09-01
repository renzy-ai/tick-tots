/**
 * Service Worker - 离线缓存
 *
 * 策略：
 * - /api/* 请求：直接走网络，不缓存（保证多设备同步实时性）
 * - 静态资源：网络优先，失败时回退缓存（保证离线可用）
 */

const CACHE_NAME = 'kid-timeline-v1';

// App Shell：安装时预缓存
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        /* 预缓存失败不阻塞安装 */
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 清理旧版本缓存
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API 与 SSE 不缓存，直接放行
  if (url.pathname.startsWith('/api/')) return;

  // 跨域资源不处理
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || caches.match('/index.html'))
      )
  );
});
