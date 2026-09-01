/**
 * 挂钟模型 Store（双套作息：工作日 / 周末，按星期自动切换）
 *
 * 与 Tot Clock 的顺序倒计时模型不同：这里不保存"还剩多少秒"，
 * 而是保存作息配置（两套：工作日 + 周末），当前活动由「当前时间」实时推算。
 * 平时按星期几自动切换显示哪一套；家长面板可单独编辑其中一套。
 */

import { writable, derived, get } from 'svelte/store';
import type { TimelineConfig, TimelineNode } from '../timeline';
import {
  defaultWeekdayConfig,
  defaultWeekendConfig,
  getCurrentNode,
  getNextNode,
  getProgress,
  getRemainingTime,
  snapTime,
  nodeDuration,
  timeToMinutes,
  minutesToTime
} from '../timeline';

export type ScheduleType = 'weekday' | 'weekend';

const WEEKDAY_KEY = 'kid-timeline-weekday-v1';
const WEEKEND_KEY = 'kid-timeline-weekend-v1';
const SETTINGS_KEY = 'kid-timeline-settings-v1';

export interface Settings {
  /** 蜂鸣提醒开关 */
  beepEnabled?: boolean;
  /** 提前提醒分钟数 */
  beepLeadMinutes?: number;
  /** 蜂鸣音量（0~1） */
  beepVolume?: number;
  /** 单声时长（秒） */
  beepDuration?: number;
  /** 重复遍数：整段提醒模式循环播几遍（1~5） */
  beepRepeat?: number;
  /** 访问口令（可选，留空表示不启用） */
  accessCode?: string;
  /** 放大提醒阈值（秒）：剩余 ≤ 此值时进入"soon"放大态，默认 600s（10 分钟） */
  soonSeconds?: number;
  /** 紧急提醒阈值（秒）：剩余 ≤ 此值时进入"urgent"紧急态，默认 300s（5 分钟） */
  urgentSeconds?: number;
  /**
   * 时间轴比例尺（0~1）：控制「非等比扭曲」强度。
   * 0 = 纯等比（短活动会挤成细条）；1 = 最大化可读（短活动放大、长活动封顶）。
   * 家长面板「时间轴比例」滑块可调。
   */
  scaleBias?: number;
}

const defaultSettings: Settings = {
  beepEnabled: true,
  beepLeadMinutes: 5,
  beepVolume: 0.5,
  beepDuration: 0.35,
  beepRepeat: 2,
  accessCode: '',
  soonSeconds: 600,
  urgentSeconds: 300,
  scaleBias: 0.85
};

// ====== 持久化：服务端（存两套：weekday + weekend） ======

async function loadSchedulesFromServer(): Promise<{
  weekday: TimelineConfig;
  weekend: TimelineConfig;
} | null> {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const data = await res.json();
      const cfg = data?.config;
      if (cfg?.weekday?.nodes?.length || cfg?.weekend?.nodes?.length) {
        return {
          weekday: { ...defaultWeekdayConfig, ...(cfg.weekday ?? {}) },
          weekend: { ...defaultWeekendConfig, ...(cfg.weekend ?? {}) }
        };
      }
    }
  } catch (e) {
    console.warn('[KidTimeline] 服务端作息读取失败，使用本地配置:', e);
  }
  return null;
}

async function loadSettingsFromServer(): Promise<Settings | null> {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        return { ...defaultSettings, ...data };
      }
    }
  } catch (e) {
    console.warn('[KidTimeline] 服务端设置读取失败:', e);
  }
  return null;
}

async function saveSchedulesToServer(): Promise<void> {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: { weekday: get(weekdayConfig), weekend: get(weekendConfig) }
      })
    });
  } catch (e) {
    console.warn('[KidTimeline] 服务端作息保存失败:', e);
  }
}

async function saveSettingsToServer(settings: Settings): Promise<void> {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  } catch (e) {
    console.warn('[KidTimeline] 服务端设置保存失败:', e);
  }
}

// ====== 持久化：localStorage ======

function loadScheduleFromStorage(key: string, fallback: TimelineConfig): TimelineConfig {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.nodes?.length) {
        return { ...fallback, ...parsed };
      }
    }
  } catch (e) {
    console.warn('[KidTimeline] 本地作息读取失败:', e);
  }
  return fallback;
}

function loadSettingsFromStorage(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[KidTimeline] 本地设置读取失败:', e);
  }
  return defaultSettings;
}

// ====== Stores ======

/** 工作日作息（持久化到本地 + 服务端） */
export const weekdayConfig = writable<TimelineConfig>(
  loadScheduleFromStorage(WEEKDAY_KEY, defaultWeekdayConfig)
);

/** 周末作息（持久化到本地 + 服务端） */
export const weekendConfig = writable<TimelineConfig>(
  loadScheduleFromStorage(WEEKEND_KEY, defaultWeekendConfig)
);

/** 当前时间，每秒 tick 一次，驱动所有派生状态（不持久化） */
export const currentTime = writable<Date>(new Date());

/** 设置项（蜂鸣开关等） */
export const settings = writable<Settings>(loadSettingsFromStorage());

/** 按当前日期判断工作日 / 周末（0=周日, 6=周六 视为周末） */
export const dayType = derived(currentTime, ($now) => {
  const d = $now.getDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
});

/** 当前显示用的作息（按星期自动切换，只读） */
export const timelineConfig = derived(
  [weekdayConfig, weekendConfig, dayType],
  ([$w, $e, $t]) => ($t === 'weekend' ? $e : $w)
);

/** 家长面板正在编辑的作息类型；面板打开时默认跟随当天 */
export const editScheduleType = writable<ScheduleType>('weekday');

/** 打开面板时，把编辑目标设为"今天"对应的那一套 */
export function initEditScheduleType(): void {
  editScheduleType.set(get(dayType));
}

/** 当前正在编辑的作息（读/写都走它） */
export const activeConfig = derived(
  [weekdayConfig, weekendConfig, editScheduleType],
  ([$w, $e, $t]) => ($t === 'weekend' ? $e : $w)
);

/** 服务端初始化（异步覆盖本地） */
export async function initializeFromServer(): Promise<void> {
  const [serverSchedules, serverSettings] = await Promise.all([
    loadSchedulesFromServer(),
    loadSettingsFromServer()
  ]);
  if (serverSchedules) {
    if (serverSchedules.weekday?.nodes?.length) weekdayConfig.set(serverSchedules.weekday);
    if (serverSchedules.weekend?.nodes?.length) weekendConfig.set(serverSchedules.weekend);
  }
  if (serverSettings) settings.set(serverSettings);
}

// ====== 多设备实时同步（SSE） ======

/**
 * 订阅服务端推送，实现局域网内多设备实时同步。
 * @returns 取消订阅函数
 */
export function subscribeToServerUpdates(): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const es = new EventSource('/api/events');

  es.addEventListener('config', (event) => {
    try {
      const remote = JSON.parse((event as MessageEvent).data);
      if (!remote) return;

      // 静默期内忽略（可能是自己刚保存触发的广播）
      if (Date.now() - lastLocalEdit < LOCAL_EDIT_GRACE) return;

      if (remote?.weekday?.nodes?.length) {
        const local = get(weekdayConfig);
        if (!local?.updatedAt || remote.weekday.updatedAt > local.updatedAt) {
          weekdayConfig.set(remote.weekday);
        }
      }
      if (remote?.weekend?.nodes?.length) {
        const local = get(weekendConfig);
        if (!local?.updatedAt || remote.weekend.updatedAt > local.updatedAt) {
          weekendConfig.set(remote.weekend);
        }
      }
    } catch {
      /* 解析失败忽略 */
    }
  });

  es.addEventListener('settings', (event) => {
    try {
      if (Date.now() - lastLocalEdit < LOCAL_EDIT_GRACE) return;
      const remote = JSON.parse((event as MessageEvent).data);
      // 用「远端覆盖当前」而非「远端覆盖默认值」：远端缺失的字段（如旧版未存的 scaleBias）不会被回退成默认值
      if (remote) settings.update((cur) => ({ ...cur, ...remote }));
    } catch {
      /* 解析失败忽略 */
    }
  });

  return () => es.close();
}

// 防抖保存
let scheduleSaveTimer: ReturnType<typeof setTimeout> | null = null;
let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 最近一次本地编辑的时间戳，用于避免"自己保存→服务端广播→覆盖自己"的回弹 */
let lastLocalEdit = 0;

/** 本地编辑静默期（毫秒）：这段时间内忽略远端推送 */
const LOCAL_EDIT_GRACE = 2000;

function scheduleChanged(): void {
  if (scheduleSaveTimer) clearTimeout(scheduleSaveTimer);
  scheduleSaveTimer = setTimeout(() => saveSchedulesToServer(), 1000);
}

// ====== 持久化订阅（本地 + 服务端） ======

weekdayConfig.subscribe((config) => {
  try {
    localStorage.setItem(WEEKDAY_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[KidTimeline] 本地工作日作息保存失败:', e);
  }
  scheduleChanged();
});

weekendConfig.subscribe((config) => {
  try {
    localStorage.setItem(WEEKEND_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[KidTimeline] 本地周末作息保存失败:', e);
  }
  scheduleChanged();
});

settings.subscribe((s) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('[KidTimeline] 本地设置保存失败:', e);
  }
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => saveSettingsToServer(s), 1000);
});

// ====== 派生状态 ======

/** 当前活动节点 */
export const currentNode = derived(
  [timelineConfig, currentTime],
  ([$config, $now]) => {
    const nowStr = `${String($now.getHours()).padStart(2, '0')}:${String($now.getMinutes()).padStart(2, '0')}`;
    return getCurrentNode($config.nodes, nowStr);
  }
);

/** 下一个活动节点 */
export const nextNode = derived(
  [timelineConfig, currentTime],
  ([$config, $now]) => {
    const nowStr = `${String($now.getHours()).padStart(2, '0')}:${String($now.getMinutes()).padStart(2, '0')}`;
    return getNextNode($config.nodes, nowStr);
  }
);

/** 当前节点进度 0~1 */
export const currentProgress = derived(
  [currentNode, currentTime],
  ([$node, $now]) => {
    const nowStr = `${String($now.getHours()).padStart(2, '0')}:${String($now.getMinutes()).padStart(2, '0')}`;
    return getProgress($node, nowStr);
  }
);

/** 当前节点剩余秒数 */
export const remainingSeconds = derived(
  [currentNode, currentTime],
  ([$node, $now]) => {
    if (!$node) return 0;
    const nowMins = $now.getHours() * 60 + $now.getMinutes();
    const nowSeconds = nowMins * 60 + $now.getSeconds();
    const start = timeToMinutes($node.startTime);
    const end = timeToMinutes($node.endTime);
    const endSeconds = start <= end
      ? end * 60
      : (nowMins >= start ? (1440 + end) * 60 : end * 60);
    return Math.max(0, endSeconds - nowSeconds);
  }
);

/** 当前时间字符串 "HH:MM" */
export const currentTimeStr = derived(currentTime, ($now) =>
  `${String($now.getHours()).padStart(2, '0')}:${String($now.getMinutes()).padStart(2, '0')}`
);

// ====== Actions ======

/** 每秒调用，更新当前时间（挂钟模型下时间只会前进，无需补偿漂移） */
export function tick(): void {
  currentTime.set(new Date());
}

/** 更新"当前正在编辑"的那套作息 */
export function updateConfig(updater: (config: TimelineConfig) => TimelineConfig): void {
  // 标记本地编辑时间，SSE 静默期内忽略回弹
  lastLocalEdit = Date.now();
  const store = get(editScheduleType) === 'weekend' ? weekendConfig : weekdayConfig;
  store.update((config) => ({
    ...updater(config),
    updatedAt: Date.now()
  }));
}

/** 新增节点（默认追加到末尾，时间取最后一个节点的结束时间） */
export function addNode(activity: string): void {
  updateConfig((config) => {
    const last = config.nodes[config.nodes.length - 1];
    const start = last ? timeToMinutes(last.endTime) : timeToMinutes(config.wakeTime);
    const end = start + 30;
    const newNode: TimelineNode = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      activity,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      required: false
    };
    return { ...config, nodes: [...config.nodes, newNode] };
  });
}

/** 删除节点 */
export function removeNode(id: string): void {
  updateConfig((config) => ({
    ...config,
    nodes: config.nodes.filter((n) => n.id !== id)
  }));
}

/** 更新单个节点 */
export function updateNode(id: string, patch: Partial<TimelineNode>): void {
  updateConfig((config) => ({
    ...config,
    nodes: config.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
  }));
}

/** 切换必须/自由 */
export function toggleRequired(id: string): void {
  updateConfig((config) => ({
    ...config,
    nodes: config.nodes.map((n) =>
      n.id === id ? { ...n, required: !n.required } : n
    )
  }));
}

/** 修改节点开始时间（分钟数），并按吸附规则对齐 */
export function setNodeStartMinutes(id: string, minutes: number, snap: boolean = true): void {
  updateConfig((config) => {
    const node = config.nodes.find((n) => n.id === id);
    if (!node) return config;

    const newStart = snap ? snapTime(minutes, 5) : minutes;
    const duration = durationOf(node);
    return {
      ...config,
      nodes: config.nodes.map((n) =>
        n.id === id
          ? { ...n, startTime: minutesToTime(newStart), endTime: minutesToTime(newStart + duration) }
          : n
      )
    };
  });
}

/** 调整节点时长（分钟），结束时间随之变化 */
export function setNodeDuration(id: string, minutes: number): void {
  updateConfig((config) => {
    const node = config.nodes.find((n) => n.id === id);
    if (!node) return config;
    const start = timeToMinutes(node.startTime);
    return {
      ...config,
      nodes: config.nodes.map((n) =>
        n.id === id
          ? { ...n, endTime: minutesToTime(start + Math.max(1, minutes)) }
          : n
      )
    };
  });
}

/** 微调整个节点时间（±1 分钟，不吸附） */
export function nudgeNode(id: string, deltaMinutes: number): void {
  updateConfig((config) => {
    return {
      ...config,
      nodes: config.nodes.map((n) => {
        if (n.id !== id) return n;
        const start = (timeToMinutes(n.startTime) + deltaMinutes + 1440) % 1440;
        const duration = durationOf(n);
        return {
          ...n,
          startTime: minutesToTime(start),
          endTime: minutesToTime(start + duration)
        };
      })
    };
  });
}

/**
 * 拖拽排序：交换 from 与 to 两个节点的位置，并对调它们的开始时间。
 * 各自保留时长，不触碰其他节点，因此不会丢失节点之间的空闲间隔。
 */
export function reorderNodes(from: number, to: number): void {
  updateConfig((config) => {
    if (from === to) return config;
    const nodes = [...config.nodes];
    if (from < 0 || to < 0 || from >= nodes.length || to >= nodes.length) return config;

    const a = nodes[from];
    const b = nodes[to];

    // 对调两个节点的开始时间，各自保留时长
    nodes[from] = {
      ...a,
      startTime: b.startTime,
      endTime: minutesToTime(timeToMinutes(b.startTime) + durationOf(a))
    };
    nodes[to] = {
      ...b,
      startTime: a.startTime,
      endTime: minutesToTime(timeToMinutes(a.startTime) + durationOf(b))
    };

    return { ...config, nodes };
  });
}

/** 更新设置 */
export function updateSettings(newSettings: Partial<Settings>): void {
  // 标记本地编辑时间，避免「自己保存 → 服务端广播 → 覆盖自己」的回弹（与 updateConfig 一致）
  lastLocalEdit = Date.now();
  settings.update((s) => ({ ...s, ...newSettings }));
}

/** 恢复默认作息（两套都恢复） */
export function resetToDefault(): void {
  lastLocalEdit = Date.now();
  weekdayConfig.set({ ...defaultWeekdayConfig, updatedAt: Date.now() });
  weekendConfig.set({ ...defaultWeekendConfig, updatedAt: Date.now() });
}

// ====== 辅助 ======

/** 节点时长（分钟）—— 复用 timeline.ts 的 nodeDuration，避免同一套逻辑写两遍 */
const durationOf = nodeDuration;

export { durationOf };

/** 导出给 ParentPanel 用的时间工具 */
export { snapTime, timeToMinutes, minutesToTime };

/** 剩余时间格式化：超过 1 小时统一用「X小时Y分」，避免出现"100多分钟"这种无意义大数字 */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '0分';
  const totalMins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  // 不足 1 小时：精确到分/秒
  if (totalMins < 60) {
    if (totalMins === 0) return `${secs}秒`;
    if (secs === 0) return `${totalMins}分`;
    return `${totalMins}分${secs}秒`;
  }
  // 超过 1 小时：以「小时」为单位，分钟只作余数显示
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分`;
}

/** 兼容旧代码：获取当前编辑中的配置快照 */
export function getConfigSnapshot(): TimelineConfig {
  return get(activeConfig);
}
