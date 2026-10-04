import { mount } from 'svelte';
import App from './App.svelte';
// 全局 design token：必须在组件样式之前加载
import './lib/theme.css';

const app = mount(App, {
  target: document.getElementById('app')!
});

// 网页版 MVP（零后端）：配置初始化在 App.svelte 的 hash 路由里走
// applyUrlThenLocal()（URL → localStorage → 设置页），此处不再拉服务端 / SSE。
//
// Service Worker 恢复注册：离线可开是验收项（文档 8.4）。
// 注意 v1 SW 曾缓存白屏版 index.html + 失效 JS hash 导致反复白屏，
// 因此 sw.js 的缓存策略已改版（CACHE_NAME 升级 + 带 hash 资源 Cache First +
// index.html 走 stale-while-revalidate），旧缓存随 CACHE_NAME 升级自动淘汰。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[TickTots] Service Worker 注册失败（不影响使用）:', e);
    });
  });
}

export default app;
