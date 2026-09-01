<!--
  家长面板（长按左上角 2 秒进入）

  功能：作息节点增删改排序、时间吸附、必须/自由切换、蜂鸣设置
-->
<script lang="ts">
  import { activities, getActivity } from '../activities';
  import { get } from 'svelte/store';
  import {
    activeConfig,
    editScheduleType,
    dayType,
    settings,
    currentTime,
    currentNode,
    addNode,
    removeNode,
    updateNode,
    toggleRequired,
    reorderNodes,
    nudgeNode,
    resetToDefault,
    updateSettings,
    updateConfig,
    setNodeDuration,
    durationOf,
    timeToMinutes,
    minutesToTime,
    snapTime
  } from '../stores/timer';
  import { testBeep } from '../beeper';
  import Timeline from './Timeline.svelte';

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();

  // 打开面板时，默认编辑"今天"对应的那套作息
  $effect(() => {
    if (visible) editScheduleType.set(get(dayType));
  });

  let selectedActivity = $state('play');
  const activityList = Object.values(activities);

  // ====== 拖拽排序 ======
  let draggingIndex = $state<number | null>(null);
  let dragStartY = 0;
  let dragItemHeight = 0;

  function handlePointerDown(index: number, e: PointerEvent) {
    draggingIndex = index;
    dragStartY = e.clientY;
    const item = (e.target as HTMLElement).closest('.node-row');
    if (item) dragItemHeight = item.getBoundingClientRect().height + 8;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (draggingIndex === null) return;
    e.preventDefault();
    const deltaY = e.clientY - dragStartY;

    if (Math.abs(deltaY) > dragItemHeight / 2) {
      const direction: -1 | 1 = deltaY > 0 ? 1 : -1;
      const newIndex = draggingIndex + direction;
      if (newIndex >= 0 && newIndex < $activeConfig.nodes.length) {
        reorderNodes(draggingIndex, newIndex);
        draggingIndex = newIndex;
        dragStartY += direction * dragItemHeight;
      }
    }
  }

  function handlePointerUp() {
    draggingIndex = null;
  }

  // ====== 时间编辑 ======

  /** 修改开始时间：落点自动吸附到整点/半点（±5 分钟内） */
  function handleTimeChange(id: string, value: string) {
    if (!value) return;
    const raw = timeToMinutes(value);
    const snapped = snapTime(raw, 5);
    const node = $activeConfig.nodes.find((n) => n.id === id);
    if (!node) return;
    const duration = durationOf(node);
    updateNode(id, {
      startTime: minutesToTime(snapped),
      endTime: minutesToTime(snapped + duration)
    });
  }

  /** 微调：±1 分钟，不吸附 */
  function nudge(id: string, delta: number) {
    nudgeNode(id, delta);
  }

  function handleDurationChange(id: string, value: string) {
    const mins = parseInt(value, 10);
    if (Number.isFinite(mins) && mins > 0) setNodeDuration(id, mins);
  }

  function handleAdd() {
    addNode(selectedActivity);
  }

  function handleReset() {
    if (confirm('确定恢复默认作息吗？当前改动会丢失。')) {
      resetToDefault();
    }
  }

  let beepOn = $derived($settings.beepEnabled ?? true);
  let leadMinutes = $derived($settings.beepLeadMinutes ?? 5);

  let beepVol = $derived($settings.beepVolume ?? 0.5);
  let beepDur = $derived($settings.beepDuration ?? 0.35);
  let beepRepeat = $derived($settings.beepRepeat ?? 2);

  function handleBeepVol(value: string) {
    let v = parseFloat(value);
    if (!isFinite(v)) v = 0.5;
    v = Math.max(0, Math.min(1, v));
    updateSettings({ beepVolume: v });
  }

  function handleBeepDur(value: string) {
    const v = Math.max(0.1, Math.min(0.5, parseFloat(value) || 0.35));
    updateSettings({ beepDuration: v });
  }

  function handleBeepRepeat(value: string) {
    const v = Math.max(1, Math.min(5, parseInt(value, 10) || 2));
    updateSettings({ beepRepeat: v });
  }

  /** 显示精度阈值（家长面板可调，单位分钟） */
  let soonMin = $derived(Math.round(($settings.soonSeconds ?? 600) / 60));
  let urgentMin = $derived(Math.round(($settings.urgentSeconds ?? 300) / 60));

  function handleSoonMin(value: string) {
    const m = Math.max(1, Math.min(60, parseInt(value, 10) || 10));
    updateSettings({ soonSeconds: m * 60 });
  }

  function handleUrgentMin(value: string) {
    const m = Math.max(1, Math.min(60, parseInt(value, 10) || 5));
    updateSettings({ urgentSeconds: m * 60 });
  }

  /** 时间轴比例尺（0=纯等比，1=短活动最大放大） */
  let scaleBiasVal = $derived($settings.scaleBias ?? 0.85);
  function handleScaleBias(value: string) {
    const v = Math.max(0, Math.min(1, parseFloat(value) || 0));
    updateSettings({ scaleBias: v });
  }
</script>

{#if visible}
  <div class="panel">
    <header class="panel-header">
      <h2>⚙️ 家长设置</h2>
      <button class="close-btn" onclick={onClose} aria-label="关闭">✕</button>
    </header>

    <div class="panel-content">
      <!-- 双套作息：编辑哪一套 -->
      <section class="group">
        <h3>编辑哪套作息</h3>
        <div class="seg">
          <button class="seg-btn" class:active={$editScheduleType === 'weekday'} onclick={() => editScheduleType.set('weekday')}>工作日</button>
          <button class="seg-btn" class:active={$editScheduleType === 'weekend'} onclick={() => editScheduleType.set('weekend')}>周末</button>
        </div>
        <p class="hint">平时按星期自动切换显示：周一~周五看工作日，周六日看周末。这里改的是「当前选中」那一套。</p>
      </section>

      <!-- 作息节点编辑 -->
      <section class="group">
        <h3>作息安排（{$activeConfig.nodes.length} 个节点）</h3>
        <p class="hint">拖动 ⠿ 可调整顺序；时间修改后自动吸附到整点/半点</p>

        <div class="node-list">
          {#each $activeConfig.nodes as node, index (node.id)}
            {@const a = getActivity(node.activity)}
            <div class="node-row" class:dragging={draggingIndex === index}>
              <button
                class="drag-handle"
                onpointerdown={(e) => handlePointerDown(index, e)}
                onpointermove={handlePointerMove}
                onpointerup={handlePointerUp}
                onpointercancel={handlePointerUp}
                aria-label="拖动排序"
              >⠿</button>

              <span class="item-icon">{a.icon}</span>

              <input
                type="time"
                class="time-input"
                value={node.startTime}
                onchange={(e) => handleTimeChange(node.id, (e.target as HTMLInputElement).value)}
                aria-label="开始时间"
              />

              <div class="nudge-group">
                <button class="nudge-btn" onclick={() => nudge(node.id, -1)} aria-label="提前1分钟">−</button>
                <span class="nudge-label">1分</span>
                <button class="nudge-btn" onclick={() => nudge(node.id, 1)} aria-label="推迟1分钟">+</button>
              </div>

              <div class="dur-group">
                <input
                  type="number"
                  class="dur-input"
                  value={durationOf(node)}
                  min="1"
                  max="600"
                  onchange={(e) => handleDurationChange(node.id, (e.target as HTMLInputElement).value)}
                  aria-label="时长（分钟）"
                />
                <span class="dur-label">分</span>
              </div>

              <button
                class="req-btn"
                class:is-required={node.required}
                onclick={() => toggleRequired(node.id)}
                title={node.required ? '必须做（点击改为自由）' : '自由（点击改为必须做）'}
              >
                {node.required ? '必须' : '自由'}
              </button>

              <button class="del-btn" onclick={() => removeNode(node.id)} aria-label="删除">✕</button>
            </div>
          {/each}
        </div>

        <!-- 添加节点 -->
        <div class="add-row">
          <select class="select" bind:value={selectedActivity} aria-label="选择活动">
            {#each activityList as activity (activity.id)}
              <option value={activity.id}>{activity.icon} {activity.name}</option>
            {/each}
          </select>
          <button class="btn primary small" onclick={handleAdd}>+ 添加节点</button>
        </div>
      </section>

      <!-- 蜂鸣设置 -->
      <section class="group">
        <h3>蜂鸣提醒</h3>
        <label class="switch-row">
          <span class="switch-label">节点提醒音</span>
          <input
            type="checkbox"
            checked={beepOn}
            onchange={(e) => updateSettings({ beepEnabled: (e.target as HTMLInputElement).checked })}
          />
          <span class="switch-text">{beepOn ? '开' : '关'}</span>
        </label>

        <label class="switch-row">
          <span class="switch-label">提前提醒</span>
          <input
            type="number"
            class="dur-input"
            value={leadMinutes}
            min="1"
            max="30"
            onchange={(e) => updateSettings({ beepLeadMinutes: parseInt((e.target as HTMLInputElement).value, 10) || 5 })}
          />
          <span class="switch-text">分钟</span>
        </label>

        <label class="switch-row">
          <span class="switch-label">提醒音量</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={beepVol}
            oninput={(e) => handleBeepVol((e.target as HTMLInputElement).value)}
          />
          <span class="switch-text">{Math.round(beepVol * 100)}%</span>
        </label>

        <label class="switch-row">
          <span class="switch-label">提醒时长</span>
          <input
            type="range"
            min="0.1"
            max="0.5"
            step="0.05"
            value={beepDur}
            oninput={(e) => handleBeepDur((e.target as HTMLInputElement).value)}
          />
          <span class="switch-text">{beepDur.toFixed(2)}s</span>
        </label>

        <label class="switch-row">
          <span class="switch-label">重复遍数</span>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={beepRepeat}
            oninput={(e) => handleBeepRepeat((e.target as HTMLInputElement).value)}
          />
          <span class="switch-text">{beepRepeat} 遍</span>
        </label>

        <button class="btn secondary" onclick={() => testBeep(beepVol, beepDur, beepRepeat)}>🔔 试听</button>
      </section>

      <!-- 显示精度（§2 自适应精度档位阈值可调） -->
      <section class="group">
        <h3>显示精度</h3>
        <p class="hint">剩余时间进入不同提醒强度的时间点（分钟）。越接近活动结束，字越大越醒目</p>
        <label class="switch-row">
          <span class="switch-label">放大提醒</span>
          <input
            type="number"
            class="dur-input"
            value={soonMin}
            min="1"
            max="60"
            onchange={(e) => handleSoonMin((e.target as HTMLInputElement).value)}
          />
          <span class="switch-text">分钟</span>
        </label>
        <label class="switch-row">
          <span class="switch-label">紧急提醒</span>
          <input
            type="number"
            class="dur-input"
            value={urgentMin}
            min="1"
            max="60"
            onchange={(e) => handleUrgentMin((e.target as HTMLInputElement).value)}
          />
          <span class="switch-text">分钟</span>
        </label>
      </section>

      <!-- 时间轴比例（方案 D：非等比扭曲强度可调） -->
      <section class="group">
        <h3>时间轴比例</h3>
        <p class="hint">向左=更接近真实时长（紧凑），向右=把短活动（洗澡/刷牙等）放得更大更清晰。拖动下方滑块，上方预览与主屏实时同步</p>
        <div class="timeline-preview">
          <Timeline config={$activeConfig} currentNode={$currentNode} currentTime={$currentTime} scaleBias={scaleBiasVal} />
        </div>
        <label class="switch-row">
          <span class="switch-label">放大短活动</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={scaleBiasVal}
            oninput={(e) => handleScaleBias((e.target as HTMLInputElement).value)}
          />
          <span class="switch-text">{Math.round(scaleBiasVal * 100)}%</span>
        </label>
      </section>

      <!-- 作息边界 -->
      <section class="group">
        <h3>一天的边界</h3>
        <div class="boundary-row">
          <label>
            <span>起床</span>
            <input
              type="time"
              class="time-input"
              value={$activeConfig.wakeTime}
              onchange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                updateConfig((c) => ({ ...c, wakeTime: v }));
              }}
            />
          </label>
          <label>
            <span>睡觉</span>
            <input
              type="time"
              class="time-input"
              value={$activeConfig.sleepTime}
              onchange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                updateConfig((c) => ({ ...c, sleepTime: v }));
              }}
            />
          </label>
        </div>
      </section>

      <section class="group">
        <button class="btn warning" onclick={handleReset}>🔄 恢复默认作息</button>
      </section>
    </div>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    inset: 0;
    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
    z-index: 200;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    animation: slide-up 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .panel-header h2 {
    font-size: 22px;
    font-weight: 700;
    color: white;
  }

  .close-btn {
    width: 44px;
    height: 44px;
    font-size: 22px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.08);
  }

  .panel-content {
    padding: 20px 24px 100px;
    max-width: 720px;
    margin: 0 auto;
  }

  .group {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 18px;
  }

  .group h3 {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 6px;
    letter-spacing: 1px;
  }

  .hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 14px;
  }

  .seg {
    display: flex;
    gap: 10px;
  }

  .seg-btn {
    flex: 1;
    padding: 12px;
    font-size: 15px;
    font-weight: 700;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
  }

  .seg-btn.active {
    border-color: #4ade80;
    background: rgba(74, 222, 128, 0.18);
    color: #86efac;
  }

  .node-list {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 8px;
    margin-bottom: 14px;
  }

  .node-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    margin-bottom: 8px;
    transition: background 0.2s;
    flex-wrap: wrap;
  }

  .node-row:last-child {
    margin-bottom: 0;
  }

  .node-row.dragging {
    background: rgba(74, 222, 128, 0.18);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  }

  .drag-handle {
    cursor: grab;
    font-size: 18px;
    color: rgba(255, 255, 255, 0.4);
    background: none;
    border: none;
    padding: 4px 2px;
    touch-action: none;
    user-select: none;
    line-height: 1;
  }

  .drag-handle:active {
    cursor: grabbing;
    color: rgba(255, 255, 255, 0.85);
  }

  .item-icon {
    font-size: 22px;
  }

  .time-input,
  .dur-input {
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .time-input {
    width: 100px;
  }

  .dur-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dur-input {
    width: 62px;
    text-align: center;
  }

  .nudge-group {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .nudge-btn {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nudge-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .nudge-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
  }

  .dur-label,
  .switch-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .req-btn {
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 700;
    border: 2px dashed rgba(255, 255, 255, 0.35);
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    min-width: 48px;
  }

  .req-btn.is-required {
    border: 2px solid #4ade80;
    background: rgba(74, 222, 128, 0.18);
    color: #86efac;
  }

  .del-btn {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    cursor: pointer;
    font-size: 13px;
  }

  .del-btn:hover {
    background: rgba(239, 68, 68, 0.55);
  }

  .add-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .select {
    flex: 1;
    padding: 12px;
    font-size: 15px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: white;
  }

  .select option {
    background: #1e293b;
    color: white;
  }

  .btn {
    padding: 14px 20px;
    font-size: 15px;
    font-weight: 700;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: white;
    transition: transform 0.15s;
  }

  .btn:hover {
    transform: translateY(-1px);
  }

  .btn.small {
    padding: 12px 16px;
    font-size: 14px;
  }

  .btn.primary {
    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  }

  .btn.secondary {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
    margin-top: 10px;
  }

  .btn.warning {
    width: 100%;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  }

  .timeline-preview {
    background: linear-gradient(135deg, #c7d2fe 0%, #f8fafc 100%);
    border-radius: 14px;
    padding: 6px;
    margin-bottom: 14px;
  }

  .switch-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
  }

  .switch-label {
    min-width: 76px;
    font-size: 14px;
    color: white;
  }

  .switch-row input[type='checkbox'] {
    width: 22px;
    height: 22px;
    accent-color: #22c55e;
    cursor: pointer;
  }

  .switch-row input[type='range'] {
    flex: 1;
    accent-color: #22c55e;
    cursor: pointer;
    height: 22px;
  }

  .boundary-row {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .boundary-row label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: white;
  }

  /* 窄屏（手机竖屏约 360px）：一行塞不下「拖拽+图标+时间+微调+时长+必须+删除」，
     原本靠 flex-wrap 自由换行会乱成 2~3 行。这里固定成两行网格：
     第一行主信息（改时间/删除），第二行次要操作（微调/时长/必须） */
  @media (max-width: 480px) {
    .node-row {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      grid-template-areas:
        'drag icon time del'
        'nudge nudge dur req';
      row-gap: 10px;
    }

    .drag-handle {
      grid-area: drag;
    }

    .item-icon {
      grid-area: icon;
    }

    .time-input {
      grid-area: time;
      width: 100%;
    }

    .del-btn {
      grid-area: del;
    }

    .nudge-group {
      grid-area: nudge;
    }

    .dur-group {
      grid-area: dur;
    }

    .dur-input {
      width: 100%;
    }

    .req-btn {
      grid-area: req;
    }
  }
</style>
