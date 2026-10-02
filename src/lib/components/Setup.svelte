<!--
  设置页（`#/`，家长使用）

  文档《嘀嗒童行_MVP开发规格_v1.md》4.2：从上到下
  说明 → 昵称 → 三套模板 → 节点列表 → 蜂鸣 → 周末折叠 → 生成主按钮
  → 导出导入 → 隐私声明 / iOS 主屏引导。

  首屏必须预填模板，**不能是空白表单**（空白表单会让家长直接放弃，
  且污染验证数据：分不清「不想用」还是「懒得填」）。
-->
<script lang="ts">
  import { activities, getActivity } from '../activities';
  import { get } from 'svelte/store';
  import {
    activeConfig,
    weekdayConfig,
    weekendConfig,
    editScheduleType,
    nickname,
    weekendEnabled,
    settings,
    addNode,
    removeNode,
    updateNode,
    toggleRequired,
    reorderNodes,
    updateSettings,
    timeToMinutes,
    minutesToTime,
    snapTime,
    durationOf,
    currentConfig,
    enablePersist,
    applyImportedConfig,
    hydrateFromConfig
  } from '../stores/timer';
  import { TEMPLATES, templateConfig, type TemplateKey } from '../templates';
  import { encodeConfig } from '../share';
  import { isValidConfig } from '../validate';
  import { trackConfigSaved, getMeta } from '../meta';
  import ShareModal from './ShareModal.svelte';
  import type { Config } from '../types';

  const MAX_NODES = 10;
  const activityList = Object.values(activities);

  let selectedActivity = $state('play');
  let shareOpen = $state(false);
  let shareConfig = $state<Config | null>(null);
  let nodeLimitMsg = $state('');

  // ====== 模板 ======

  function applyTemplate(key: TemplateKey) {
    if (!confirm('套用模板会覆盖当前所有节点，确定吗？')) return;
    const nick = get(nickname);
    hydrateFromConfig(templateConfig(key, nick));
    // 套用模板后回到工作日编辑，周末仍按开关状态保留
    editScheduleType.set('weekday');
    nodeLimitMsg = '';
  }

  // ====== 拖拽排序（与 ParentPanel 同构的手势） ======
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

  // ====== 节点编辑 ======

  /** 开始时间：自动吸附到整点 / 半点（±5 分钟），结束时间保持时长 */
  function handleStartChange(id: string, value: string) {
    if (!value) return;
    const snapped = snapTime(timeToMinutes(value), 5);
    const node = $activeConfig.nodes.find((n) => n.id === id);
    if (!node) return;
    updateNode(id, {
      startTime: minutesToTime(snapped),
      endTime: minutesToTime(snapped + durationOf(node))
    });
  }

  /** 结束时间：同样吸附 */
  function handleEndChange(id: string, value: string) {
    if (!value) return;
    const snapped = snapTime(timeToMinutes(value), 5);
    updateNode(id, { endTime: minutesToTime(snapped) });
  }

  function handleNameChange(id: string, value: string) {
    updateNode(id, { name: value });
  }

  function handleIconChange(id: string, value: string) {
    updateNode(id, { activity: value });
  }

  function handleAdd() {
    if ($activeConfig.nodes.length >= MAX_NODES) {
      nodeLimitMsg = '节点太多孩子看不清，最多 10 个';
      return;
    }
    nodeLimitMsg = '';
    addNode(selectedActivity);
  }

  // ====== 生成 ======

  function validateNodes(nodes: { startTime: string; endTime: string }[]): string | null {
    if (nodes.length < 1) return '至少要有一个时间段';
    if (nodes.length > MAX_NODES) return '节点太多孩子看不清，最多 10 个';
    for (let i = 0; i < nodes.length; i++) {
      const s = timeToMinutes(nodes[i].startTime);
      const e = timeToMinutes(nodes[i].endTime);
      const crossNight = e < s;
      if (crossNight && i !== nodes.length - 1) {
        return '只有最后一个节点（睡觉）可以跨过午夜';
      }
      if (!crossNight && e === s) {
        return `第 ${i + 1} 个节点的开始和结束时间相同`;
      }
    }
    return null;
  }

  function handleGenerate() {
    const err =
      validateNodes($weekdayConfig.nodes) ??
      ($weekendEnabled ? validateNodes($weekendConfig.nodes) : null);
    if (err) {
      alert(err);
      return;
    }
    trackConfigSaved();
    enablePersist();
    // 展示页据此显示「分享给家人」按钮（扫码进来的不显示，避免孩子乱点）
    sessionStorage.setItem('ticktots.share', '1');
    const c = currentConfig();
    location.hash = `#/view?c=${encodeConfig(c)}`;
  }

  // ====== 导出 / 导入 ======

  function handleExportFile() {
    const c = currentConfig();
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ticktots-${c.n || '作息'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleExportCopy() {
    const text = JSON.stringify(currentConfig(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert('已复制配置文本，可粘贴保存到备忘录');
    } catch {
      alert('复制失败，请用「导出文件」备份');
    }
  }

  function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isValidConfig(parsed)) throw new Error('bad');
        applyImportedConfig(parsed);
        alert('已导入，配置生效');
      } catch {
        alert('文件格式不正确，请选择本页导出的 JSON 文件');
      }
      input.value = '';
    };
    reader.onerror = () => {
      alert('文件读取失败');
      input.value = '';
    };
    reader.readAsText(file);
  }

  function openShare() {
    shareConfig = currentConfig();
    shareOpen = true;
  }

  let meta = $derived(getMeta());
  let beepOn = $derived($settings.beepEnabled ?? false);
</script>

<div class="setup">
  <header class="hero">
    <h1>嘀嗒童行</h1>
    <p class="tagline">配一次，生成一张你家的时间轴</p>
  </header>

  <!-- 昵称 -->
  <section class="group">
    <h3>孩子昵称</h3>
    <input
      class="text-input"
      type="text"
      maxlength="12"
      placeholder="可以只写小名，也可以不填"
      value={$nickname}
      oninput={(e) => nickname.set((e.target as HTMLInputElement).value)}
      aria-label="孩子昵称"
    />
    <p class="hint">只存本地和链接里，不上传、不收集（见页底隐私声明）</p>
  </section>

  <!-- 三套模板 -->
  <section class="group">
    <h3>选一套作息模板</h3>
    <p class="hint">点一下直接套用 7 个时间段，再按你家习惯微调</p>
    <div class="tpl-row">
      {#each TEMPLATES as tpl (tpl.key)}
        <button class="tpl-btn" onclick={() => applyTemplate(tpl.key)}>
          <span class="tpl-label">{tpl.label}</span>
          <span class="tpl-hint">{tpl.hint}</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- 周末作息（折叠，默认关） -->
  <details class="group details">
    <summary>周末作息（可选）</summary>
    <label class="switch-row">
      <span class="switch-label">启用两套</span>
      <input
        type="checkbox"
        checked={$weekendEnabled}
        onchange={(e) => weekendEnabled.set((e.target as HTMLInputElement).checked)}
      />
      <span class="switch-text">{$weekendEnabled ? '开' : '关'}</span>
    </label>
    <p class="hint">不开启就只有一套作息，每天一样。开启后周六日自动用另一套。</p>
    {#if $weekendEnabled}
      <div class="seg">
        <button class="seg-btn" class:active={$editScheduleType === 'weekday'} onclick={() => editScheduleType.set('weekday')}>工作日</button>
        <button class="seg-btn" class:active={$editScheduleType === 'weekend'} onclick={() => editScheduleType.set('weekend')}>周末</button>
      </div>
    {/if}
  </details>

  <!-- 节点列表 -->
  <section class="group">
    <h3>时间段（{$activeConfig.nodes.length} 个）</h3>
    <p class="hint">拖动 ⠿ 调整顺序；时间自动吸附到整点 / 半点；只有最后一个「睡觉」可以跨过午夜</p>

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

          <select
            class="icon-select"
            value={node.activity}
            onchange={(e) => handleIconChange(node.id, (e.target as HTMLSelectElement).value)}
            aria-label="图标"
          >
            {#each activityList as act (act.id)}
              <option value={act.id}>{act.icon}</option>
            {/each}
          </select>

          <input
            class="name-input"
            type="text"
            maxlength="8"
            placeholder={a.name}
            value={node.name ?? ''}
            oninput={(e) => handleNameChange(node.id, (e.target as HTMLInputElement).value)}
            aria-label="名称"
          />

          <input
            type="time"
            class="time-input"
            value={node.startTime}
            onchange={(e) => handleStartChange(node.id, (e.target as HTMLInputElement).value)}
            aria-label="开始时间"
          />
          <span class="arrow">→</span>
          <input
            type="time"
            class="time-input"
            value={node.endTime}
            onchange={(e) => handleEndChange(node.id, (e.target as HTMLInputElement).value)}
            aria-label="结束时间"
          />

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

    {#if nodeLimitMsg}
      <p class="warn">{nodeLimitMsg}</p>
    {/if}

    <div class="add-row">
      <select class="select" bind:value={selectedActivity} aria-label="选择活动">
        {#each activityList as activity (activity.id)}
          <option value={activity.id}>{activity.icon} {activity.name}</option>
        {/each}
      </select>
      <button class="btn primary small" onclick={handleAdd}>+ 添加时间段</button>
    </div>
  </section>

  <!-- 蜂鸣 -->
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
    <p class="hint">默认关。开启后，快到下一个活动时会响三短音。</p>
  </section>

  <!-- 主按钮 -->
  <section class="group main-action">
    <button class="btn primary big" onclick={handleGenerate}>生成我家的时间轴</button>
    <div class="sub-actions">
      <button class="btn ghost" onclick={openShare}>🔗 分享链接 / 二维码</button>
    </div>
  </section>

  <!-- 导出 / 导入 -->
  <section class="group">
    <h3>备份</h3>
    <p class="hint">换手机或清了浏览器数据时，用 JSON 文件或复制的文本恢复</p>
    <div class="sub-actions">
      <button class="btn secondary" onclick={handleExportFile}>导出文件</button>
      <button class="btn secondary" onclick={handleExportCopy}>复制文本</button>
      <label class="btn secondary import-label">
        导入 JSON
        <input type="file" accept=".json,application/json" onchange={handleImportFile} hidden />
      </label>
    </div>
  </section>

  <!-- iOS 主屏引导 -->
  <section class="group">
    <h3>放到主屏幕（推荐）</h3>
    <p class="hint">iPhone 用 Safari 打开 → 分享 → 添加到主屏幕；安卓 / 微信里打开后也可添加。加了以后全屏打开、断网也能用。</p>
  </section>

  <!-- 隐私声明（文档 9.4 原文照抄） -->
  <footer class="privacy">
    <p>所有数据只存在你自己的设备上，我们不收集任何信息。</p>
    {#if import.meta.env.DEV}
      <pre class="dev-meta">DEV 埋点自检：{JSON.stringify(meta)}</pre>
    {/if}
  </footer>
</div>

{#if shareConfig}
  <ShareModal visible={shareOpen} config={shareConfig} onClose={() => (shareOpen = false)} />
{/if}

<style>
  .setup {
    min-height: 100vh;
    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
    padding: 28px 16px 80px;
  }

  .hero {
    text-align: center;
    margin-bottom: 24px;
  }

  .hero h1 {
    font-size: 30px;
    font-weight: 800;
    color: white;
    letter-spacing: 2px;
  }

  .tagline {
    font-size: 15px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 8px;
  }

  .group {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    padding: 18px;
    margin-bottom: 16px;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
  }

  .group h3 {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 10px;
    letter-spacing: 1px;
  }

  .hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1.7;
    margin-top: 8px;
  }

  .warn {
    font-size: 13px;
    color: #fbbf24;
    margin-bottom: 10px;
  }

  .text-input {
    width: 100%;
    padding: 12px 14px;
    font-size: 16px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    box-sizing: border-box;
  }

  .tpl-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .tpl-btn {
    flex: 1;
    min-width: 100px;
    padding: 14px 10px;
    border: 2px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
    color: white;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    transition: all 0.15s;
  }

  .tpl-btn:hover {
    border-color: #4ade80;
    background: rgba(74, 222, 128, 0.12);
  }

  .tpl-label {
    font-size: 16px;
    font-weight: 700;
  }

  .tpl-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  .details summary {
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    list-style: none;
  }

  .details summary::marker,
  .details summary::-webkit-details-marker {
    display: none;
  }

  .details summary::before {
    content: '▸ ';
    color: rgba(255, 255, 255, 0.45);
  }

  .details[open] summary::before {
    content: '▾ ';
  }

  .details[open] summary {
    margin-bottom: 10px;
  }

  .seg {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .seg-btn {
    flex: 1;
    padding: 10px;
    font-size: 14px;
    font-weight: 700;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
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
    margin-bottom: 12px;
  }

  .node-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    margin-bottom: 8px;
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

  .icon-select {
    padding: 8px;
    font-size: 18px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .icon-select option {
    background: #1e293b;
    color: white;
  }

  .name-input {
    width: 88px;
    padding: 8px 10px;
    font-size: 14px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .time-input {
    width: 100px;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .arrow {
    color: rgba(255, 255, 255, 0.35);
    font-size: 13px;
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

  .switch-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
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

  .switch-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
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

  .btn.big {
    width: 100%;
    padding: 18px;
    font-size: 18px;
  }

  .btn.primary {
    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  }

  .btn.secondary {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  }

  .btn.ghost {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .sub-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
  }

  .import-label {
    display: inline-block;
  }

  .privacy {
    max-width: 720px;
    margin: 24px auto 0;
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.8;
  }

  .dev-meta {
    margin-top: 12px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    white-space: pre-wrap;
    word-break: break-all;
    font-family: ui-monospace, Consolas, monospace;
  }

  /* 窄屏：一行放不下 8 个控件，收成两行 */
  @media (max-width: 560px) {
    .node-row {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      grid-template-areas:
        'drag icon name del'
        'start start end end'
        'req req req req';
      row-gap: 10px;
    }

    .drag-handle {
      grid-area: drag;
    }
    .icon-select {
      grid-area: icon;
    }
    .name-input {
      grid-area: name;
      width: 100%;
    }
    .del-btn {
      grid-area: del;
    }
    .time-input {
      grid-area: start;
      width: 100%;
    }
    .time-input + .arrow {
      display: none;
    }
    .time-input + .arrow + .time-input {
      grid-area: end;
      width: 100%;
    }
    .req-btn {
      grid-area: req;
    }
  }
</style>
