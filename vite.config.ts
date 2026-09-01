import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    // 不自动清空输出目录：沙箱环境可能拦截 rmSync(emptyDir)
    emptyOutDir: false
  },
  server: {
    // 监听 0.0.0.0：方便手机/平板在同一局域网访问开发服务器调试
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173
  }
});
