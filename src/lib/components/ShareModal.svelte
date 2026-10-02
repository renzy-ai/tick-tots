<!--
  分享弹层：复制链接 + 二维码（设置页与展示页共用）

  二维码内容 = 完整 URL（含 `#/view?c=...`），前端生成，不依赖后端（文档 7.3）。
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import type { Config } from '../types';
  import { buildShareUrl } from '../share';

  interface Props {
    visible: boolean;
    config: Config;
    onClose: () => void;
  }

  let { visible, config, onClose }: Props = $props();

  let url = $derived(buildShareUrl(config));
  let qrDataUrl = $state('');
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!visible) return;
    let alive = true;
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#0b1020', light: '#ffffff' } })
      .then((d) => {
        if (alive) qrDataUrl = d;
      })
      .catch(() => {
        if (alive) qrDataUrl = '';
      });
    return () => {
      alive = false;
    };
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 剪贴板 API 不可用（如非 https）：退回选中文本
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(ta);
    }
    copied = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 2000);
  }

  onMount(() => () => {
    if (copyTimer) clearTimeout(copyTimer);
  });
</script>

{#if visible}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="分享给家人">
      <header class="modal-header">
        <h2>分享给家人</h2>
        <button class="close-btn" onclick={onClose} aria-label="关闭">✕</button>
      </header>

      <p class="hint">把这个链接或二维码发给家人，打开就是你家的时间轴。链接即配置，无需注册。</p>

      <div class="qr-box">
        {#if qrDataUrl}
          <img src={qrDataUrl} alt="时间轴二维码" width="240" height="240" />
        {:else}
          <div class="qr-fallback">二维码生成中…</div>
        {/if}
      </div>

      <div class="link-row">
        <input class="link-input" readonly value={url} onclick={(e) => (e.target as HTMLInputElement).select()} aria-label="分享链接" />
        <button class="btn primary" onclick={copyLink}>{copied ? '已复制' : '复制链接'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal {
    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    padding: 20px;
    width: 100%;
    max-width: 420px;
    animation: pop 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes pop {
    from {
      transform: scale(0.92);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: white;
  }

  .close-btn {
    width: 40px;
    height: 40px;
    font-size: 20px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
  }

  .hint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 14px;
    line-height: 1.6;
  }

  .qr-box {
    background: white;
    border-radius: 14px;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    min-height: 240px;
  }

  .qr-box img {
    display: block;
    image-rendering: pixelated;
  }

  .qr-fallback {
    color: #64748b;
    font-size: 14px;
  }

  .link-row {
    display: flex;
    gap: 8px;
  }

  .link-input {
    flex: 1;
    min-width: 0;
    padding: 12px;
    font-size: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .btn {
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 700;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    color: white;
    white-space: nowrap;
  }

  .btn.primary {
    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  }
</style>
