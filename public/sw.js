/**
 * Service Worker - 离线缓存（网页版 MVP）
 *
 * 策略（文档 8.4 + 白屏事故复盘）：
 * - /api/* 请求：直接放行不缓存（保留给 main 分支自部署版；网页版不发这些请求）
 * - 带 hash 的 /assets/*：**Cache First**（文件名含 hash，内容永不变化）
 * - index.html 与导航请求：**stale-while-revalidate**（先回缓存保离线与首屏速度，
 *   后台拉网更新）。全用 Cache First 会重蹈 v1 白屏覆辙——旧 index.html 指向
 *   已失效的 JS hash，永远打不开新版本；全用 Network First 离线又开不了。
 * - 其它静态资源（manifest / 图标）：stale-while-revalidate，同上。
 */

const CACHE_NAME = 'kid-tots-v2';

// App Shell：安装时预缓存（hash 资源由运行时按需写入）
const SHELL = ['/index.html', '/manifest.json', '/icon.svg'];

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
  // 清理旧版本缓存（CACHE_NAME 升级即淘汰 v1 的白屏缓存）
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

/** 带 hash 的构建产物：文件名唯一，可安全长期缓存 */
function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/** 页面入口（index.html / 导航） */
function isNavigation(request, url) {
  return request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';
}

/** Cache First：缓存命中直接返回，未命中再拉网并写入 */
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

/** Stale-while-revalidate：先回缓存保离线，同时后台更新缓存 */
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      return cached || network.then((r) => r || caches.match('/index.html'));
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API 与 SSE 不缓存，直接放行
  if (url.pathname.startsWith('/api/')) return;

  // 跨域资源不处理
  if (url.origin !== self.location.origin) return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // index.html / 导航 / 其它静态资源：stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});
