<!--
  线性时间轴视图（按《需求规格-v4.md》+《01-主界面设计稿.html》实现）

  布局（上 → 下）：
    1. 小时刻度标尺（08:00 / 09:00 ...）—— 参考用
    2. 黄色直条 = 白天，上面排布【矩形格子】，每个格子宽度 = 该活动真实时长（D1 等比渲染）
    3. 蓝色睡觉弧 = 跨夜，胶囊形填充区，从直条右端向下绕回左端

  三态：已过去=灰覆盖+淡出，当前=放大+橙红呼吸边框，未来=饱满原色
  必须做=实线粗框，自由=虚线框
-->
<script lang="ts">
  import { getActivity } from '../activities';
  import { timeToMinutes, minutesToTime, nodeDuration } from '../timeline';
  import type { TimelineConfig, TimelineNode } from '../timeline';

  interface Props {
    config: TimelineConfig;
    currentNode: TimelineNode | null;
    currentTime: Date;
    /** 时间轴比例尺（0~1）：0=纯等比，1=短活动最大可读放大 */
    scaleBias?: number;
  }

  let { config, currentNode, currentTime, scaleBias = 0.85 }: Props = $props();

  // ====== SVG 坐标系统 ======
  const VB_W = 1000;
  const VB_H = 300;
  const TRACK_Y = 115; // 黄色直条中心线
  const TRACK_H = 50; // 直条高度
  const TRACK_LEFT = 6;
  const TRACK_RIGHT = 994;
  const TRACK_W = TRACK_RIGHT - TRACK_LEFT;
  const TRACK_TOP = TRACK_Y - TRACK_H / 2;
  const RULER_Y = 58; // 小时刻度标注基线
  const NAME_Y = 34; // 活动名称基线（位于标尺上方，避免与刻度/格子重叠）
  const SLEEP_DEPTH = 125; // 睡觉弧深度
  const SLEEP_BOTTOM = TRACK_Y + SLEEP_DEPTH; // 睡觉弧底边

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  let nowMins = $derived(currentTime.getHours() * 60 + currentTime.getMinutes());
  let wakeMins = $derived(timeToMinutes(config.wakeTime));
  let sleepMins = $derived(timeToMinutes(config.sleepTime));
  let nightSpan = $derived(Math.max(1, 1440 - sleepMins + wakeMins));

  /** 当前时间落在白天段（直条）还是睡觉段（弧线） */
  let inNight = $derived(
    sleepMins > wakeMins
      ? nowMins >= sleepMins || nowMins < wakeMins
      : nowMins >= sleepMins && nowMins < wakeMins
  );

  let nightProgress = $derived.by(() => {
    if (nowMins >= sleepMins) return clamp((nowMins - sleepMins) / nightSpan, 0, 1);
    return clamp((1440 - sleepMins + nowMins) / nightSpan, 0, 1);
  });

  // ====== 睡觉弧：胶囊形填充区（设计稿风格） ======
  const SLEEP_CTRL = 26; // 两侧转向的控制点外凸距离
  const sleepArea = `
    M ${TRACK_RIGHT} ${TRACK_Y}
    Q ${TRACK_RIGHT + SLEEP_CTRL} ${TRACK_Y + SLEEP_DEPTH / 2}, ${TRACK_RIGHT} ${SLEEP_BOTTOM}
    L ${TRACK_LEFT} ${SLEEP_BOTTOM}
    Q ${TRACK_LEFT - SLEEP_CTRL} ${TRACK_Y + SLEEP_DEPTH / 2}, ${TRACK_LEFT} ${TRACK_Y}
    Z
  `;
  const sleepTurnRight = `M ${TRACK_RIGHT} ${TRACK_Y} Q ${TRACK_RIGHT + SLEEP_CTRL} ${TRACK_Y + SLEEP_DEPTH / 2}, ${TRACK_RIGHT} ${SLEEP_BOTTOM}`;
  const sleepTurnLeft = `M ${TRACK_LEFT} ${SLEEP_BOTTOM} Q ${TRACK_LEFT - SLEEP_CTRL} ${TRACK_Y + SLEEP_DEPTH / 2}, ${TRACK_LEFT} ${TRACK_Y}`;

  /** 睡觉弧底部"已睡了多久"的进度条 */
  let sleepProgressW = $derived(nightProgress * TRACK_W);

  // ====== 统一映射：标尺 / 游标 / 卡片共用同一 timeToX(min) ======
  // 非等比扭曲参数（受 scaleBias 控制）：短活动地板、长活动封顶（单位：分钟）
  const MIN_SEG_MIN = 50;
  const MAX_SEG_MIN = 110;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  /** 睡觉节点（跨夜）的开始时间 = 白天直条的右端 */
  let sleepStartMins = $derived.by(() => {
    const sn = config.nodes.find((n) => {
      const s = timeToMinutes(n.startTime);
      const e = timeToMinutes(n.endTime);
      return e < s;
    });
    return sn ? timeToMinutes(sn.startTime) : sleepMins;
  });

  /**
   * 把 wake→sleepStart 切成连续段（活动段 + 空白段）。每段按真实时长给"显示权重"：
   * 短活动地板 MIN_SEG_MIN、长活动封顶 MAX_SEG_MIN，由 scaleBias 在「纯等比」(0) 与「最大可读」(1) 间插值。
   * 归一化后每段占满轨道；timeToX 再据此插值，保证标尺/游标/卡片三者严格对齐。
   */
  let segLayout = $derived.by(() => {
    const dayNodes = config.nodes
      .filter((n) => {
        const s = timeToMinutes(n.startTime);
        const e = timeToMinutes(n.endTime);
        return e >= s;
      })
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const raw: { start: number; end: number; node?: TimelineNode }[] = [];
    let cursor = wakeMins;
    for (const n of dayNodes) {
      const s = timeToMinutes(n.startTime);
      const e = timeToMinutes(n.endTime);
      if (s > cursor + 0.001) raw.push({ start: cursor, end: s });
      raw.push({ start: s, end: e, node: n });
      cursor = Math.max(cursor, e);
    }
    if (sleepStartMins > cursor + 0.001) raw.push({ start: cursor, end: sleepStartMins });

    // 滑块经三次方缓动：越靠上越敏感，85%→100% 变化明显，且 0% 才是纯等比
    const sb = scaleBias * scaleBias * scaleBias;
    const weights = raw.map((sg) => {
      const d = Math.max(1, sg.end - sg.start);
      const clamped = clamp(d, MIN_SEG_MIN, MAX_SEG_MIN);
      return lerp(d, clamped, sb);
    });
    const total = weights.reduce((a, b) => a + b, 0) || 1;

    let x = TRACK_LEFT;
    return raw.map((sg, i) => {
      const w = (weights[i] / total) * TRACK_W;
      const r = { ...sg, x, w };
      x += w;
      return r;
    });
  });

  /** 任意真实分钟 → 轨道 x（标尺、游标、卡片全部走它，对齐由构造保证） */
  function timeToX(min: number): number {
    const list = segLayout;
    if (!list.length) return TRACK_LEFT;
    const m = clamp(min, list[0].start, list[list.length - 1].end);
    for (const sg of list) {
      if (m >= sg.start && m <= sg.end) {
        const frac = sg.end > sg.start ? (m - sg.start) / (sg.end - sg.start) : 0;
        return sg.x + frac * sg.w;
      }
    }
    return TRACK_LEFT;
  }

  /** 已过去部分的灰色覆盖宽度（与游标、卡片同步） */
  let pastW = $derived(timeToX(nowMins) - TRACK_LEFT);

  // ====== 小时刻度标尺（刻度精确落在段边界 = 卡片边缘，相邻过近则省略标签） ======
  let ticks = $derived.by(() => {
    const list: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
    const firstHour = Math.ceil(wakeMins / 60) * 60;
    let prevX = -999;
    let idx = 0;
    for (let t = firstHour; t <= sleepStartMins + 0.001; t += 60) {
      const x = timeToX(t);
      if (x - prevX >= 40) {
        const anchor = idx === 0 ? 'start' : 'middle';
        list.push({ x, label: minutesToTime(t), anchor });
        prevX = x;
      } else {
        list.push({ x, label: '', anchor: 'middle' });
      }
      idx++;
    }
    if (list.length && list[list.length - 1].label) list[list.length - 1].anchor = 'end';
    return list;
  });

  /**
   * 节点格子布局（方案 D：统一映射对齐 + 非等比可读）
   * 直接复用 segLayout 中每个活动段的 x / w，因此与标尺、游标三者严格对齐；
   * 短活动因 scaleBias 已被放大到可读宽度，且段与段首尾相接 → 不重叠、不遮挡。
   */
  let nodesView = $derived.by(() => {
    const arr = config.nodes.map((node, i) => {
      const s = timeToMinutes(node.startTime);
      const e = timeToMinutes(node.endTime);
      return {
        node,
        index: i,
        onArc: e < s,
        activity: getActivity(node.activity),
        state: 'future' as 'past' | 'current' | 'future',
        rect: undefined as { x: number; w: number; cx: number } | undefined
      };
    });

    // 当前节点状态（用于高亮 + 放大）
    const curIdx = currentNode
      ? config.nodes.findIndex((n) => n.id === currentNode!.id)
      : -1;
    arr.forEach((a) => {
      if (curIdx >= 0 && a.index === curIdx) a.state = 'current';
      else if (curIdx >= 0 && a.index < curIdx) a.state = 'past';
      else a.state = 'future';
    });

    // 用统一映射给每个活动段定位（与标尺、游标同一 timeToX）
    const byId = new Map(
      segLayout.filter((s) => s.node).map((s) => [s.node!.id, s])
    );
    arr.forEach((a) => {
      if (a.onArc) return;
      const sg = byId.get(a.node.id);
      if (sg) a.rect = { x: sg.x, w: sg.w, cx: sg.x + sg.w / 2 };
    });

    return arr;
  });

  /** 跨夜（睡觉）节点挂在弧底正中 */
  let sleepNodePos = $derived({ x: TRACK_LEFT + TRACK_W / 2, y: SLEEP_BOTTOM });

  /** 游标位置：白天沿直条（统一映射），夜间沿睡觉弧底边（从右往左推进） */
  let cursorPos = $derived.by(() => {
    if (inNight) {
      return { x: TRACK_RIGHT - nightProgress * TRACK_W, y: SLEEP_BOTTOM };
    }
    return { x: timeToX(nowMins), y: TRACK_Y };
  });

  // ====== 悬浮 / 点按查看卡片详情 ======
  // 默认不显示中文名（避免拥挤）；鼠标悬浮或点按卡片时才弹出「名称 + 起止时间」
  let hoverIdx = $state<number | null>(null);
  let tapIdx = $state<number | null>(null);
  let tooltipIdx = $derived(hoverIdx ?? tapIdx);
</script>

<svg
  class="timeline"
  class:night={inNight}
  viewBox="0 0 {VB_W} {VB_H}"
  preserveAspectRatio="xMidYMid meet"
>
  <defs>
    <linearGradient id="sleepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color: var(--sleep-arc-from)" />
      <stop offset="100%" style="stop-color: var(--sleep-arc-to)" />
    </linearGradient>
  </defs>

  <!-- 睡觉弧：胶囊形填充区 -->
  <path d={sleepArea} class="sleep-area" />
  <path d={sleepTurnRight} class="sleep-turn" />
  <path d={sleepTurnLeft} class="sleep-turn" />

  <!-- 睡觉弧进度：已经睡了多久 -->
  {#if inNight && nightProgress > 0}
    <rect
      x={TRACK_RIGHT - sleepProgressW}
      y={SLEEP_BOTTOM - 15}
      width={sleepProgressW}
      height="30"
      rx="15"
      class="sleep-done"
    />
  {/if}

  <!-- 黄色直条（白天）。用中性奶油色 + 白描边：主背景跟随当前活动变色，
       纯黄在早饭/点心（黄橙系）背景下会与背景融掉，奶油色 + 描边保证任何底色上都读得出来 -->
  <rect
    x={TRACK_LEFT}
    y={TRACK_TOP}
    width={TRACK_W}
    height={TRACK_H}
    rx="8"
    class="day-track"
  />

  <!-- 已过去：灰色覆盖（与游标、卡片同一映射） -->
  <rect
    x={TRACK_LEFT}
    y={TRACK_TOP}
    width={pastW}
    height={TRACK_H}
    rx="8"
    class="day-past"
  />

  <!-- 小时刻度标尺（刻度精确落在卡片边缘） -->
  <g class="ruler">
    {#each ticks as tick (tick.x)}
      <line x1={tick.x} y1={RULER_Y + 8} x2={tick.x} y2={TRACK_TOP - 4} class="ruler-line" />
      {#if tick.label}
        <text x={tick.x} y={RULER_Y} class="ruler-label" text-anchor={tick.anchor}>{tick.label}</text>
      {/if}
    {/each}
  </g>

  <!-- 活动格子：默认只显示图标（中文名在悬浮/点按时才显示，避免拥挤） -->
  {#each nodesView as item, i (item.node.id)}
    {#if !item.onArc && item.rect}
      {@const a = item.activity}
      {@const r = item.rect}
      {@const isCur = item.state === 'current'}
      {@const h = isCur ? TRACK_H + 12 : TRACK_H}
      {@const y = isCur ? TRACK_Y - h / 2 : TRACK_Y - TRACK_H / 2}
      {@const isTip = tooltipIdx === i}
      <g
        class="node {item.state}"
        class:hovered={isTip}
        role="button"
        tabindex="0"
        aria-label={`${a.name} ${item.node.startTime} 到 ${item.node.endTime}`}
        onmouseenter={() => (hoverIdx = i)}
        onmouseleave={() => (hoverIdx = null)}
        onclick={() => (tapIdx = tapIdx === i ? null : i)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            tapIdx = tapIdx === i ? null : i;
          }
        }}
      >
        <rect
          x={r.x + 1}
          y={y}
          width={Math.max(r.w - 2, 6)}
          height={h}
          rx="6"
          class="node-box"
          style="fill: {a.color};
                 stroke-width: {item.node.required ? 3 : 2};
                 stroke-dasharray: {item.node.required ? 'none' : '5 4'}"
        />
        <!-- 图标永远居中显示（短活动也看得见） -->
        <text
          x={r.cx}
          y={TRACK_Y}
          class="node-icon"
          style="font-size: {isCur ? 26 : 18}px"
        >{a.icon}</text>
        <!-- 较宽格子内显示开始时间（数字，非中文名） -->
        {#if r.w >= 50}
          <text x={r.cx} y={TRACK_Y + 16} class="node-time">{item.node.startTime}</text>
        {/if}
      </g>
    {/if}
  {/each}

  <!-- 悬浮 / 点按卡片提示：中文名 + 起止时间（默认不显示，悬浮才出） -->
  {#if tooltipIdx !== null}
    {@const tip = nodesView[tooltipIdx]}
    {#if tip && !tip.onArc && tip.rect}
      {@const a = tip.activity}
      {@const r = tip.rect}
      {@const tw = 156}
      {@const tx = Math.min(Math.max(r.cx, tw / 2 + 4), VB_W - tw / 2 - 4)}
      <g class="tooltip">
        <rect x={tx - tw / 2} y={2} width={tw} height={38} rx="10" class="tooltip-bg" />
        <text x={tx} y={19} class="tooltip-name" text-anchor="middle">{a.name}</text>
        <text x={tx} y={34} class="tooltip-time" text-anchor="middle">{tip.node.startTime}–{tip.node.endTime}</text>
      </g>
    {/if}
  {/if}

  <!-- 睡觉节点（跨夜，挂在弧底） -->
  {#each nodesView as item (item.node.id)}
    {#if item.onArc}
      {@const a = item.activity}
      <g class="sleep-node" class:active={inNight}>
        <circle cx={sleepNodePos.x} cy={sleepNodePos.y} r="28" class="sleep-node-bg" />
        <text x={sleepNodePos.x} y={sleepNodePos.y + 3} class="sleep-node-icon">{a.icon}</text>
        <text x={sleepNodePos.x + 40} y={sleepNodePos.y + 7} class="sleep-node-label">
          {a.name} {item.node.startTime}→{item.node.endTime}
        </text>
      </g>
    {/if}
  {/each}

  <!-- 游标：外层 g 定位，内层 g 动画（避免 CSS transform 覆盖定位） -->
  <g class="cursor" transform="translate({cursorPos.x} {cursorPos.y})">
    <g class="cursor-bob">
      {#if inNight}
        <!-- 夜间：箭头在弧底下方，朝上指向睡觉弧 -->
        <polygon points="0,26 -11,44 11,44" class="cursor-arrow" />
      {:else}
        <line x1="0" y1={-44} x2="0" y2={-30} class="cursor-line" />
        <polygon points="0,-22 -11,-40 11,-40" class="cursor-arrow" />
      {/if}
    </g>
  </g>
</svg>

<style>
  .timeline {
    width: 100%;
    height: auto;
    max-height: 50vh;
    display: block;
    overflow: visible;
  }

  /* ---- 睡觉弧 ---- */
  .sleep-area {
    fill: url(#sleepGrad);
    opacity: var(--sleep-arc-opacity);
  }

  .sleep-turn {
    fill: none;
    stroke: var(--sleep-arc-to);
    stroke-width: 3;
    stroke-dasharray: 5 5;
    opacity: 0.85;
  }

  .sleep-done {
    fill: var(--sleep-arc-to);
    opacity: 0.5;
  }

  /* 白天直条：中性奶油色 + 白描边，避免与黄/橙系活动背景撞色 */
  .day-track {
    fill: var(--track-day);
    stroke: var(--track-day-stroke);
    stroke-width: 3;
  }

  .day-past {
    fill: var(--track-past);
    transition: width 0.6s linear;
  }

  /* ---- 小时刻度标尺 ---- */
  .ruler-line {
    stroke: var(--track-ruler);
    stroke-width: 2;
  }

  .ruler-label {
    font-family: var(--font-num);
    font-size: 15px;
    font-weight: 600;
    fill: var(--track-ruler-label);
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }

  /* ---- 活动格子 ---- */
  .node-box {
    stroke: #ffffff;
  }

  .node.past {
    opacity: 0.42;
  }

  .node.current .node-box {
    stroke: var(--c-current);
    animation: breathe 2s ease-in-out infinite;
  }

  @keyframes breathe {
    0%,
    100% {
      stroke-width: 4;
    }
    50% {
      stroke-width: 7;
    }
  }

  .node-icon {
    text-anchor: middle;
    dominant-baseline: middle;
  }

  /* 悬浮 / 点按高亮 */
  .node.hovered .node-box {
    stroke: #ffffff;
    stroke-width: 4;
    filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.45));
  }

  /* 悬浮提示气泡 */
  .tooltip-bg {
    fill: rgba(15, 23, 42, 0.92);
    stroke: rgba(255, 255, 255, 0.28);
    stroke-width: 1;
  }

  .tooltip-name {
    font-size: 14px;
    font-weight: 800;
    fill: #ffffff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.35);
    stroke-width: 2px;
    stroke-linejoin: round;
  }

  .tooltip-time {
    font-family: var(--font-num);
    font-size: 12px;
    font-weight: 600;
    fill: rgba(255, 255, 255, 0.72);
    font-variant-numeric: tabular-nums;
  }

  .node-time {
    font-family: var(--font-num);
    font-size: 12px;
    font-weight: 700;
    fill: rgba(255, 255, 255, 0.95);
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }

  /* ---- 睡觉节点 ---- */
  .sleep-node-bg {
    fill: var(--sleep-arc-to);
    stroke: #ffffff;
    stroke-width: 3;
  }

  .sleep-node.active .sleep-node-bg {
    fill: #2f6fb5;
  }

  .sleep-node-icon {
    font-size: 28px;
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .sleep-node-label {
    font-size: 18px;
    font-weight: 700;
    fill: #2f6fb5;
  }

  /* ---- 游标 ---- */
  .cursor-line {
    stroke: var(--c-cursor);
    stroke-width: 5;
    stroke-linecap: round;
  }

  .cursor-arrow {
    fill: var(--c-cursor);
  }

  .cursor-bob {
    animation: cursor-bob 1.4s ease-in-out infinite;
  }

  @keyframes cursor-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }

  /* ================= 夜间态（睡觉时段，主屏切深色夜空）=================
     刻度、睡觉弧标签原是深蓝/棕色，压在深色背景上会看不见，这里整体反相为浅色 */
  .timeline.night .ruler-line {
    stroke: var(--night-track-ruler);
  }

  .timeline.night .ruler-label {
    fill: var(--night-track-ruler-label);
  }

  .timeline.night .sleep-area {
    opacity: var(--night-sleep-arc-opacity);
  }

  .timeline.night .sleep-node-label {
    fill: var(--night-text);
  }

  /* 夜间 tooltip 反相：浅底深字，否则深色气泡糊在深色背景里 */
  .timeline.night .tooltip-bg {
    fill: rgba(255, 255, 255, 0.95);
    stroke: rgba(15, 23, 42, 0.25);
  }

  .timeline.night .tooltip-name {
    fill: #0f172a;
    stroke: rgba(255, 255, 255, 0.6);
  }

  .timeline.night .tooltip-time {
    fill: rgba(15, 23, 42, 0.7);
  }
</style>
