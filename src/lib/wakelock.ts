/**
 * 屏幕常亮（《嘀嗒童行_MVP开发规格_v1.md》第 8.2 节）
 *
 * 挂墙展示设备不能熄屏。不支持的浏览器**静默跳过，不弹提示**
 * （家长不需要知道）：iOS Safari 16.4+ / Android Chrome / 微信内核
 * 大多可用，个别不支持时页面照常工作。
 */

let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await (
      navigator as Navigator & {
        wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinel> };
      }
    ).wakeLock.request('screen');
  } catch {
    /* 不支持或被拒绝时静默降级 */
  }
}

export function releaseWakeLock(): void {
  try {
    sentinel?.release?.();
  } catch {
    /* 忽略 */
  }
  sentinel = null;
}

// 页面回到前台（iOS 会丢掉锁）：自动重新申请
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (sentinel && document.visibilityState === 'visible') requestWakeLock();
  });
}
