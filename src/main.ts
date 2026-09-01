import { mount } from 'svelte';
import App from './App.svelte';
// 全局 design token：必须在组件样式之前加载
import './lib/theme.css';
import {
  initializeFromServer,
  subscribeToServerUpdates
} from './lib/stores/timer';

const app = mount(App, {
  target: document.getElementById('app')!
});

// 从服务端拉取配置（异步，就绪后覆盖本地缓存）
initializeFromServer();

// 订阅 SSE：局域网内其他设备改动配置后，本设备实时同步
subscribeToServerUpdates();

// 暂时禁用 Service Worker 自动注册，并主动注销浏览器里已存在的旧 SW。
// 原因：v1 SW 曾缓存了早期「白屏版」index.html + 已失效的旧 JS hash，
// 失败回退时导致反复白屏（chrome-extension://invalid/）。注销后改走纯网络，
// 确保始终加载最新构建。待运行时稳定后再恢复 PWA 离线能力。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {});
  });
}

export default app;
