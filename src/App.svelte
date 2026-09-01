<!--
  KidTimeline 主应用

  挂钟模型：当前活动由「当前时间」实时推算，不保存倒计时状态。
  布局：当前活动大字 → 剩余时间（自适应精度）→ 线性时间轴
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Timeline from './lib/components/Timeline.svelte';
  import ParentPanel from './lib/components/ParentPanel.svelte';
  import Onboarding from './lib/components/Onboarding.svelte';
  import { getActivity } from './lib/activities';
  import { nodeDuration } from './lib/timeline';
  import {
    timelineConfig,
    dayType,
    currentTime,
    settings,
    currentNode,
    nextNode,
    remainingSeconds,
    currentTimeStr,
    tick,
    initializeFromServer,
    initEditScheduleType,
    formatRemaining
  } from './lib/stores/timer';
  import { checkReminders, unlockAudio } from './lib/beeper';

  let showParentPanel = $state(false);
  let parentTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
  let showOnboarding = $state(false);

  let config = $derived($timelineConfig);
  let node = $derived($currentNode);
  let activity = $derived(node ? getActivity(node.activity) : null);
  let nextActivity = $derived($nextNode ? getActivity($nextNode.activity) : null);
  let remain = $derived($remainingSeconds);

  /** 自适应精度：剩余 ≤ urgentSeconds 进入紧急态，≤ soonSeconds 进入放大态（阈值可在家长面板调整，默认 5/10 分钟） */
  let urgency = $derived<'normal' | 'soon' | 'urgent'>(
    !node
      ? 'normal'
      : remain <= ($settings.urgentSeconds ?? 300)
        ? 'urgent'
        : remain <= ($settings.soonSeconds ?? 600)
          ? 'soon'
          : 'normal'
  );

  // 睡觉节点：不显示「还剩 X」倒计时（跨夜长时段，无意义），改为显示已睡时长 + 起床时间
  let isSleep = $derived(node?.activity === 'sleep');
  let sleptLabel = $derived.by(() => {
    if (!isSleep || !node) return '';
    const totalSec = nodeDuration(node) * 60;
    const sleptSec = Math.max(0, totalSec - remain);
    const h = Math.floor(sleptSec / 3600);
    const m = Math.floor((sleptSec % 3600) / 60);
    return h > 0 ? `${h}小时${m}分` : `${m}分`;
  });

  // ====== 家长面板：长按左上角 2 秒 ======

  function startParentTrigger(e: Event) {
    e.preventDefault();
    unlockAudio();
    parentTriggerTimeout = setTimeout(() => {
      showParentPanel = true;
      if (navigator.vibrate) navigator.vibrate(50);
    }, 2000);
  }

  function cancelParentTrigger() {
    if (parentTriggerTimeout) {
      clearTimeout(parentTriggerTimeout);
      parentTriggerTimeout = null;
    }
  }

  // ====== 双击全屏 ======

  let lastTap = 0;
  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTap < 300) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    lastTap = now;
  }

  // ====== Wake Lock ======

  let wakeLockSentinel: WakeLockSentinel | null = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockSentinel = await (navigator as Navigator & {
        wakeLock: { request: (t: string) => Promise<WakeLockSentinel> };
      }).wakeLock.request('screen');
    } catch {
      /* 不支持或被拒绝时静默降级 */
    }
  }

  onMount(() => {
    // 每秒推进一次挂钟
    const interval = setInterval(() => {
      tick();
      checkReminders(
        node,
        remain,
        $settings.beepLeadMinutes ?? 5,
        $settings.beepEnabled ?? true,
      $settings.beepVolume ?? 0.5,
      $settings.beepDuration ?? 0.35,
      $settings.beepRepeat ?? 2
      );
    }, 1000);

    const preventContext = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);

    // 首次任意交互解锁音频（浏览器策略要求）
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, { once: true });

    // 页面回到前台：立即刷新时间 + 重新申请常亮
    const handleVisibility = () => {
      if (!document.hidden) {
        tick();
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    requestWakeLock();
    initEditScheduleType();
    initializeFromServer();

    // 首次使用引导：未标记过则弹出（标记存本地，不随多设备同步）
    if (!localStorage.getItem('kid-timeline-onboarding-v1')) {
      showOnboarding = true;
    }

    return () => {
      clearInterval(interval);
      if (parentTriggerTimeout) clearTimeout(parentTriggerTimeout);
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockSentinel?.release?.().catch(() => {});
    };
  });
</script>

<main
  class="app"
  class:night={isSleep}
  style="background: {isSleep
    ? 'linear-gradient(160deg, var(--night-bg-from) 0%, var(--night-bg-to) 100%)'
    : activity?.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}"
  ontouchend={handleDoubleTap}
  role="application"
>
  <!-- 顶部：当前时间放右上（醒目）+ 今日作息时段（右下次要） -->
  <div class="clock-bar">
    <div class="clock-right">
      <span class="wall-clock">现在 {$currentTimeStr}</span>
      {#if config.nodes.length > 0}
        <span class="day-range">今日作息 {config.wakeTime} – {config.sleepTime}</span>
      {/if}
    </div>
  </div>

  <!-- 当前活动 -->
  <div class="now-section">
    {#if activity && node}
      <div class="activity-icon">{activity.icon}</div>
      <div class="activity-name">{activity.name}</div>
      <div class="time-info">
        {#if isSleep}
          <div class="remaining sleep-mode">已睡 {sleptLabel} · {node.endTime} 起床</div>
        {:else}
          <div class="remaining {urgency}">
            {#if remain > 0}
              还剩 {formatRemaining(remain)}
            {:else}
              时间到啦
            {/if}
          </div>
          <div class="end-at">到 {node.endTime} 结束</div>
        {/if}
      </div>
    {:else}
      <div class="activity-icon">🌈</div>
      <div class="activity-name">自由时间</div>
      {#if nextActivity && $nextNode}
        <div class="time-info">
          <div class="next-hint">
            接下来 {$nextNode.startTime} · {nextActivity.icon} {nextActivity.name}
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- 时间轴 -->
  <div class="timeline-section">
    <Timeline {config} currentNode={node} currentTime={$currentTime} scaleBias={$settings.scaleBias ?? 0.85} />
  </div>

  <!-- 家长触发区（左上角长按 2 秒，半透明齿轮做引导 D13） -->
  <div
    class="parent-trigger"
    role="button"
    tabindex="-1"
    aria-label="长按进入家长设置"
    onmousedown={startParentTrigger}
    onmouseup={cancelParentTrigger}
    onmouseleave={cancelParentTrigger}
    ontouchstart={startParentTrigger}
    ontouchend={cancelParentTrigger}
    ontouchcancel={cancelParentTrigger}
  >
    <svg class="gear" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="11" fill="none" stroke="#ffffff" stroke-width="2" />
      <circle cx="15" cy="15" r="5" fill="none" stroke="#ffffff" stroke-width="2" />
      <line x1="15" y1="1" x2="15" y2="4" stroke="#ffffff" stroke-width="2" />
      <line x1="15" y1="26" x2="15" y2="29" stroke="#ffffff" stroke-width="2" />
      <line x1="1" y1="15" x2="4" y2="15" stroke="#ffffff" stroke-width="2" />
      <line x1="26" y1="15" x2="29" y2="15" stroke="#ffffff" stroke-width="2" />
    </svg>
    <span class="schedule-tag-muted">{$dayType === 'weekend' ? '周末' : '工作日'}</span>
  </div>
</main>

<ParentPanel visible={showParentPanel} onClose={() => (showParentPanel = false)} />

<Onboarding
  visible={showOnboarding}
  onClose={() => {
    localStorage.setItem('kid-timeline-onboarding-v1', '1');
    showOnboarding = false;
  }}
/>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(html, body) {
    height: 100%;
    overflow: hidden;
    font-family: var(--font-ui);
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
  }

  .app {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .app::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.28) 0%, transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(0, 0, 0, 0.18) 0%, transparent 50%);
    pointer-events: none;
    z-index: 1;
  }

  .clock-bar {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: flex-end; /* 当前时间靠右上 */
    align-items: flex-start;
    padding: 16px 24px 0;
    padding-left: 110px; /* 避开长按触发区 */
  }

  .clock-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    text-align: right;
  }

  .wall-clock {
    font-size: 28px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.98);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .day-range {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
  }

  /* 工作日/周末：低调灰字，居中挂在齿轮（设置入口）正下方，强制单行不换行 */
  .schedule-tag-muted {
    position: absolute;
    top: 48px;
    left: 31px;
    transform: translateX(-50%);
    width: auto;
    white-space: nowrap;
    text-align: center;
    font-size: 11px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.4);
    pointer-events: none;
    z-index: 51;
  }

  .now-section {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 8px 20px 18px;
    min-height: 0;
  }

  /* 倒计时 + 辅助时间：与活动名、与刻度线都拉开分组间距 */
  .time-info {
    margin-top: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .activity-icon {
    font-size: min(22vw, 130px);
    line-height: 1;
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.22));
    animation: gentle-float 3s ease-in-out infinite;
  }

  @keyframes gentle-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  .activity-name {
    font-size: min(11vw, 62px);
    font-weight: 800;
    color: white;
    margin-top: 10px;
    /* 中文名带符号（如「洗手+早饭」），字距过大显散，2px 是观感平衡点 */
    letter-spacing: 2px;
    text-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  }

  .remaining {
    margin-top: 0;
    font-weight: 800;
    color: white;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
    transition: all 0.3s ease;
  }

  /* 自适应精度：最后 10 分钟转为红橙大字 */
  .remaining.sleep-mode {
    font-size: min(7vw, 38px);
    color: #cfe3ff;
    opacity: 0.95;
  }

  .remaining.normal {
    font-size: min(6vw, 34px);
    opacity: 0.95;
  }

  .remaining.soon {
    font-size: min(9vw, 54px);
    color: #fff1e6;
    text-shadow: 0 0 22px rgba(255, 107, 53, 0.65);
  }

  .remaining.urgent {
    font-size: min(13vw, 82px);
    color: var(--c-urgent);
    text-shadow: 0 0 30px rgba(255, 90, 43, 0.85);
    animation: urgent-pulse 1s ease-in-out infinite;
  }

  @keyframes urgent-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.06);
    }
  }

  .end-at,
  .next-hint {
    margin-top: 0;
    font-size: min(3.4vw, 16px);
    color: rgba(255, 255, 255, 0.68);
    font-variant-numeric: tabular-nums;
  }

  .timeline-section {
    position: relative;
    z-index: 2;
    margin-top: 18px;
    padding: 0 8px 12px;
    flex-shrink: 0;
  }

  .parent-trigger {
    position: absolute;
    top: 0;
    left: 0;
    width: 100px;
    height: 100px;
    z-index: 50;
    cursor: pointer;
  }

  /* 半透明齿轮：给孩子不留干扰，家长能发现（D13） */
  .gear {
    position: absolute;
    top: 16px;
    left: 16px;
    width: 30px;
    height: 30px;
    opacity: 0.28;
    pointer-events: none;
  }

  /* ---- 夜间态（睡觉时段，主屏切深色夜空）---- */

  /* 高光层在深色底上会泛白成"脏雾"，夜间大幅收敛，只留一点顶部提亮 */
  .app.night::before {
    background: radial-gradient(
      ellipse at top left,
      rgba(255, 255, 255, 0.07) 0%,
      transparent 50%
    );
  }

  /* 辅助文字改走夜间 token：纯白在 #1a1a2e 上刺眼，睡前看屏幕会越看越精神 */
  .app.night .wall-clock {
    color: var(--night-text);
  }

  .app.night .day-range,
  .app.night .end-at,
  .app.night .next-hint {
    color: var(--night-dim);
  }

  /* 布局统一为上下结构（设计规范 §3.1）：挂墙应用建议竖屏，不再做横屏左右分栏 */
</style>
