<!--
  嘀嗒童行 主应用（网页版 MVP：hash 路由两页）

  `#/`        设置页（家长）：选模板 → 微调 → 生成链接 / 二维码
  `#/view`    展示页（孩子）：全屏时间轴 + 常亮
  `#/view?c=` 展示页（带配置）：扫码 / 点链接直接加载

  展示页沿用挂钟模型视觉：当前活动大字 → 剩余时间（自适应精度）→ 线性时间轴。
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Timeline from './lib/components/Timeline.svelte';
  import ParentPanel from './lib/components/ParentPanel.svelte';
  import Setup from './lib/components/Setup.svelte';
  import ShareModal from './lib/components/ShareModal.svelte';
  import NightSky from './lib/components/NightSky.svelte';
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
    initEditScheduleType,
    formatRemaining,
    manualTime,
    setManualTime,
    applyUrlThenLocal,
    ensureLocalInit,
    currentConfig
  } from './lib/stores/timer';
  import { checkReminders, unlockAudio } from './lib/beeper';
  import { requestWakeLock, releaseWakeLock } from './lib/wakelock';
  import { trackDisplayOpened } from './lib/meta';
  import { extractParam } from './lib/share';

  // ====== 路由 ======

  type Route = 'setup' | 'view';
  let route = $state<Route>('setup');

  /** URL 是否带配置参数（带 = 孩子设备扫码进来；不带 = 家长设备） */
  let hasUrlConfig = $state(false);

  function parseRoute(): Route {
    return location.hash.replace(/^#/, '').startsWith('/view') ? 'view' : 'setup';
  }

  /** URL 坏了但本地还有配置：顶部淡出提示一次 */
  let degradedHint = $state(false);
  let degradedTimer: ReturnType<typeof setTimeout> | null = null;
  function showDegradedHint() {
    degradedHint = true;
    if (degradedTimer) clearTimeout(degradedTimer);
    degradedTimer = setTimeout(() => (degradedHint = false), 6000);
  }

  /** 隐私声明首开提示（展示页底部淡出，只显示一次） */
  let privacyHint = $state(false);
  const PRIVACY_SEEN_KEY = 'ticktots.privacy-seen';
  function maybePrivacyHint() {
    if (localStorage.getItem(PRIVACY_SEEN_KEY)) return;
    privacyHint = true;
    localStorage.setItem(PRIVACY_SEEN_KEY, '1');
    setTimeout(() => (privacyHint = false), 6000);
  }

  /** 分享按钮：仅从设置页「生成」跳转过来时显示（防孩子乱点） */
  let shareFromSession = $state(false);
  let shareOpen = $state(false);

  function enterView() {
    const init = applyUrlThenLocal();
    if (init.source === 'fallback') {
      // 本机也没有配置 → 落回设置页（绝不白屏）
      location.hash = '#/';
      return;
    }
    if (init.urlCorrupt) showDegradedHint();
    trackDisplayOpened();
    maybePrivacyHint();
    requestWakeLock();
    shareFromSession = sessionStorage.getItem('ticktots.share') === '1';
    flashControls();
  }

  function onHashChange() {
    const next = parseRoute();
    route = next;
    hasUrlConfig = !!extractParam(location.hash);
    if (next === 'view') {
      enterView();
    } else {
      // 设置页也要初始化：直开 #/ 时预填 3 岁模板或本机配置，
      // 否则 store 里是 timeline.ts 的 13 节点旧默认值，「生成」会被校验拦下。
      ensureLocalInit();
      releaseWakeLock();
    }
  }

  // ====== 展示页控件（5 秒无操作淡出，触摸 / 移动重现） ======

  let controlsVisible = $state(true);
  let controlsTimer: ReturnType<typeof setTimeout> | null = null;

  function flashControls() {
    controlsVisible = true;
    if (controlsTimer) clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => (controlsVisible = false), 5000);
  }

  function goSetup() {
    location.hash = '#/';
  }

  /** 进全屏后尝试锁横屏（Android Chrome / 桌面可用；iOS 不支持则静默忽略，靠竖屏提示层引导） */
  function lockLandscape(): void {
    try {
      const so = screen.orientation as unknown as
        | { lock?: (o: string) => Promise<void>; unlock?: () => void }
        | undefined;
      so?.lock?.('landscape')?.catch(() => {});
    } catch {
      /* 无 Screen Orientation API：忽略 */
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      try {
        (screen.orientation as unknown as { unlock?: () => void } | undefined)?.unlock?.();
      } catch {
        /* 忽略 */
      }
    } else {
      document.documentElement.requestFullscreen?.().then(lockLandscape).catch(() => {});
    }
  }

  // ====== 家长面板：长按左上角 2 秒（仅家长设备；带 URL 参数时禁用防误触） ======

  let showParentPanel = $state(false);
  let parentTriggerTimeout: ReturnType<typeof setTimeout> | null = null;

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
      document.documentElement.requestFullscreen?.().then(lockLandscape).catch(() => {});
    }
    lastTap = now;
  }

  // ====== 派生 ======

  let config = $derived($timelineConfig);
  let node = $derived($currentNode);

  /** 开发模式（vite dev 为真，生产构建为 false，UI 会被整体剔除） */
  const devMode = import.meta.env.DEV;

  /** 开发预览：右上角时间输入框的双向展示值（手动态显示设定值，实时态跟随真实时间） */
  const toMin = (v: string) => {
    const [h, m] = v.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const minToStr = (min: number) =>
    `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  let devTimeValue = $derived($manualTime !== null ? minToStr($manualTime) : $currentTimeStr);
  let activity = $derived(node ? getActivity(node.activity) : null);
  let nextActivity = $derived($nextNode ? getActivity($nextNode.activity) : null);
  let remain = $derived($remainingSeconds);

  /** 显示名优先用节点自定义名（如「早餐」），缺省回退活动默认名 */
  let displayName = $derived(
    node ? node.name || getActivity(node.activity).name : ''
  );
  let nextDisplayName = $derived(
    $nextNode ? $nextNode.name || getActivity($nextNode.activity).name : ''
  );

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

  // ====== 生命周期 ======

  onMount(() => {
    // 每秒推进一次挂钟
    const interval = setInterval(() => {
      tick();
      checkReminders(
        node,
        remain,
        $settings.beepLeadMinutes ?? 5,
        $settings.beepEnabled ?? false,
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
        if (route === 'view') requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    initEditScheduleType();

    // 初始路由 + 降级初始化（URL → 本地 → 设置页）
    window.addEventListener('hashchange', onHashChange);
    onHashChange();

    return () => {
      clearInterval(interval);
      if (parentTriggerTimeout) clearTimeout(parentTriggerTimeout);
      if (controlsTimer) clearTimeout(controlsTimer);
      if (degradedTimer) clearTimeout(degradedTimer);
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('hashchange', onHashChange);
      releaseWakeLock();
    };
  });
</script>

{#if route === 'setup'}
  <Setup />
{:else}
  <main
    class="app"
    class:night={isSleep}
    style="background: {isSleep
      ? 'linear-gradient(160deg, var(--night-bg-from) 0%, var(--night-bg-to) 100%)'
      : activity?.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}"
    ontouchend={handleDoubleTap}
    ontouchmove={flashControls}
    onmousemove={flashControls}
    role="application"
  >
    <!-- 夜间星空装饰层：仅睡觉时段浮现，铺在内容之下 -->
    <NightSky night={isSleep} />

    <!-- 顶部：当前时间放右上（醒目）+ 今日作息时段（右下次要） -->
    <div class="clock-bar">
      <div class="clock-right">
        <span class="wall-clock">现在 {$currentTimeStr}</span>
        {#if config.nodes.length > 0}
          <span class="day-range">今日作息 {config.wakeTime} – {config.sleepTime}</span>
        {/if}
      </div>
    </div>

    <!-- 开发预览：修改"当前时间"以预览夜间/各时段（仅 DEV 显示，正式版不可用）
         作为 <main> 直接子元素绝对定位，脱离 clock-bar 文档流（高度与正式版一致），
         且 z-index 高于内容层，浮在上方、可点击、不压住"今日作息"文字 -->
    {#if devMode}
      <div class="dev-time">
        <input
          class="dev-time-input"
          type="time"
          value={devTimeValue}
          oninput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v) setManualTime(toMin(v));
          }}
          aria-label="开发预览：修改当前时间"
          title="开发模式：修改当前时间以预览不同时段（正式版不可用）"
        />
        {#if $manualTime !== null}
          <button class="dev-time-reset" type="button" onclick={() => setManualTime(null)}>↺实时</button>
        {/if}
      </div>
    {/if}

    <!-- 当前活动 -->
    <div class="now-section">
      {#if activity && node}
        <div class="activity-icon">
          {#if isSleep}<span class="moon-glow" aria-hidden="true"></span>{/if}
          {activity.icon}
        </div>
        <div class="activity-name">{displayName}</div>
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
              接下来 {$nextNode.startTime} · {nextActivity.icon} {nextDisplayName}
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- 时间轴 -->
    <div class="timeline-section">
      <Timeline {config} currentNode={node} currentTime={$currentTime} scaleBias={$settings.scaleBias ?? 0.85} />
    </div>

    <!-- 家长触发区（左上角长按 2 秒 → 快捷微调面板）
         带 URL 参数（孩子设备）时整个区域禁用，避免误触进设置（文档 14） -->
    {#if !hasUrlConfig}
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
    {/if}

    <!-- 展示页控件：全屏 / 分享 / 回设置（5 秒无操作淡出） -->
    <div class="view-controls" class:hidden={!controlsVisible}>
      {#if shareFromSession}
        <button class="view-btn" onclick={() => (shareOpen = true)} aria-label="分享给家人" title="分享给家人">🔗</button>
      {/if}
      <button class="view-btn" onclick={toggleFullscreen} aria-label="全屏" title="全屏">⛶</button>
      <button class="view-btn gear-btn" onclick={goSetup} aria-label="返回设置" title="返回设置">⚙️</button>
    </div>

    <!-- 首次打开：底部隐私声明淡出提示（只提示一次） -->
    {#if privacyHint}
      <div class="privacy-hint">所有数据只存在你自己的设备上，我们不收集任何信息。</div>
    {/if}

    <!-- URL 损坏降级提示 -->
    {#if degradedHint}
      <div class="degraded-hint">链接配置无效，已显示本机保存的配置</div>
    {/if}

    <!-- 手机竖屏：时间轴按横屏宽度设计，竖着拿会挤成看不清的细条——提示横屏（不挡操作） -->
    <div class="rotate-hint" aria-hidden="true">
      <div class="rotate-icon">📱</div>
      <div class="rotate-text">请把手机横过来</div>
      <div class="rotate-sub">横屏后时间轴更大、看得更清楚</div>
    </div>
  </main>

  <ParentPanel visible={showParentPanel} onClose={() => (showParentPanel = false)} />
  <ShareModal
    visible={shareOpen}
    config={currentConfig()}
    onClose={() => (shareOpen = false)}
  />
{/if}

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

  /* 设置页需要滚动，展示页锁滚动 */
  :global(html:has(.setup), body:has(.setup)) {
    overflow: auto;
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

  /* 开发预览：右上角"修改当前时间"控件（仅 DEV 出现）
     绝对定位、脱离文档流，锚在时钟下方右上角空白处；
     不增加 clock-bar 高度（开发版与正式版中间布局一致）；
     z-index 高于内容层(2)，浮在上方可点击、不压住文字 */
  .dev-time {
    position: absolute;
    top: 96px;
    right: 24px;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: auto;
  }

  .dev-time-input {
    font-family: var(--font-num);
    font-size: 13px;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 2px 6px;
    width: 86px;
    font-variant-numeric: tabular-nums;
  }

  .dev-time-input::-webkit-calendar-picker-indicator {
    filter: invert(1);
    opacity: 0.7;
    cursor: pointer;
  }

  .dev-time-reset {
    font-size: 12px;
    color: #cfe3ff;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 2px 8px;
    cursor: pointer;
  }

  .dev-time-reset:hover {
    background: rgba(255, 255, 255, 0.2);
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
    position: relative; /* 作为月亮光晕的定位上下文 */
    font-size: min(22vw, 130px);
    line-height: 1;
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.22));
    animation: gentle-float 3s ease-in-out infinite;
  }

  /* 月亮柔光晕：居中贴在 🌙 图标本身（跟随 now-section 实际位置，不再写死视口坐标） */
  .moon-glow {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(214, 230, 255, 0.22) 0%,
      rgba(180, 205, 245, 0.09) 38%,
      transparent 72%
    );
    filter: blur(5px);
    pointer-events: none;
    z-index: -1; /* 在 emoji 之下、星空之上 */
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

  /* 展示页控件：右下角小图标，5 秒无操作淡出 */
  .view-controls {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 60;
    display: flex;
    gap: 10px;
    transition: opacity 0.6s ease;
  }

  .view-controls.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .view-btn {
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    color: white;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
  }

  .view-btn:hover {
    background: rgba(255, 255, 255, 0.28);
  }

  /* 齿轮（回设置）做得更淡，避免孩子盯着点 */
  .gear-btn {
    opacity: 0.55;
    font-size: 15px;
  }

  .privacy-hint,
  .degraded-hint {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 70;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    white-space: nowrap;
    animation: fade-in-out 6s ease forwards;
    pointer-events: none;
  }

  .degraded-hint {
    bottom: 60px;
    background: rgba(180, 80, 20, 0.75);
  }

  @keyframes fade-in-out {
    0% {
      opacity: 0;
    }
    8% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* ---- 横屏适配（manifest 也是 landscape；竖屏时间轴会挤成细条） ---- */

  /* 竖屏手机：提示横屏。透明度只做提醒、不挡点击（pointer-events: none） */
  .rotate-hint {
    display: none;
  }

  @media (orientation: portrait) and (max-width: 640px) {
    .rotate-hint {
      position: absolute;
      inset: 0;
      z-index: 80;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 10px;
      background: rgba(11, 16, 32, 0.72);
      pointer-events: none;
    }

    .rotate-icon {
      font-size: 64px;
      line-height: 1;
      animation: rotate-phone 2.4s ease-in-out infinite;
    }

    .rotate-text {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
    }

    .rotate-sub {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
    }
  }

  @keyframes rotate-phone {
    0%,
    18% {
      transform: rotate(0deg);
    }
    50%,
    68% {
      transform: rotate(-90deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  /* 横屏手机 / 矮窗口：高度紧张——压缩顶部与大字区，把空间留给底部时间轴 */
  @media (max-height: 520px) {
    .clock-bar {
      padding: 6px 16px 0;
      padding-left: 96px;
    }

    .wall-clock {
      font-size: 20px;
    }

    .day-range {
      font-size: 11px;
    }

    .now-section {
      padding: 2px 16px 4px;
    }

    .activity-icon {
      font-size: min(12vw, 17vh, 68px);
    }

    .activity-name {
      font-size: min(6vw, 8vh, 34px);
      margin-top: 2px;
    }

    .time-info {
      margin-top: 6px;
      gap: 1px;
    }

    .remaining.normal {
      font-size: min(4vw, 5vh, 24px);
    }

    .remaining.sleep-mode {
      font-size: min(4.5vw, 5.5vh, 26px);
    }

    .remaining.soon {
      font-size: min(6vw, 7.5vh, 36px);
    }

    .remaining.urgent {
      font-size: min(8.5vw, 10.5vh, 50px);
    }

    .end-at,
    .next-hint {
      font-size: min(3vw, 3.4vh, 13px);
    }

    .timeline-section {
      margin-top: 6px;
      padding: 0 4px 4px;
    }

    .view-btn {
      width: 36px;
      height: 36px;
      font-size: 15px;
    }
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
