<!--
  「用上了？跟作者说一声」弹层（设置页与展示页共用）

  点击按钮 → 弹层 → 那行文本自动进剪贴板 → 旁边放公众号二维码
  家长扫旁边的码关注公众号 → 在公众号会话里粘贴 → 发给作者

  不发任何网络请求（隐私承诺：默认不上传，只有你点这个按钮才复制一行字）。
-->
<script lang="ts">
  import { buildReportText } from '../meta';

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();

  let reportText = $derived(buildReportText());
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(reportText);
    } catch {
      // 剪贴板 API 不可用（如非 https）：退回选中文本
      const ta = document.createElement('textarea');
      ta.value = reportText;
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
    copyTimer = setTimeout(() => (copied = false), 2500);
  }

  function handleClose() {
    if (copyTimer) clearTimeout(copyTimer);
    copied = false;
    onClose();
  }
</script>

{#if visible}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') handleClose();
    }}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="告诉作者你在用">
      <header class="modal-header">
        <h2>用上了？跟作者说一声</h2>
        <button class="close-btn" onclick={handleClose} aria-label="关闭">✕</button>
      </header>

      <p class="hint">
        点一下复制下面这行，然后扫旁边的公众号二维码关注，在公众号会话里粘贴发给我就行。
      </p>

      <div class="report-box">
        <div class="report-text">{reportText}</div>
        <button class="btn copy-btn" onclick={copyText}>
          {copied ? '✓ 已复制' : '复制这行'}
        </button>
      </div>

      <div class="qr-section">
        <img src="/contact-me.png" alt="公众号二维码" width="160" height="160" />
        <p class="qr-hint">长按识别关注<br />然后在公众号里粘贴发给我</p>
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

  .report-box {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 14px;
  }

  .report-text {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.8;
    word-break: break-word;
    margin-bottom: 10px;
  }

  .copy-btn {
    width: 100%;
    padding: 12px;
    font-size: 15px;
    font-weight: 700;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    color: white;
    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  }

  .qr-section {
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
    padding: 12px;
  }

  .qr-section img {
    display: block;
    border-radius: 8px;
    background: white;
    padding: 4px;
    flex-shrink: 0;
  }

  .qr-hint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1.6;
    margin: 0;
  }
</style>
