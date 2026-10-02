/**
 * 挂钟模型 Store（双套作息：工作日 / 周末，按星期自动切换）
 *
 * 与 Tot Clock 的顺序倒计时模型不同：这里不保存"还剩多少秒"，
 * 而是保存作息配置（两套：工作日 + 周末），当前活动由「当前时间」实时推算。
 * 平时按星期几自动切换显示哪一套；家长面板可单独编辑其中一套。
 *
 * 网页版 MVP（《嘀嗒童行_MVP开发规格_v1.md》第 7 节）：
 * **零后端**。配置持久化为 localStorage + 链接携带，不再有服务端 / SSE。
 * 新旧模型转换走 adapter.ts，timeline.ts 纯函数不动。
 */

import { writable, derived, get } from 'svelte/store';
import type { TimelineConfig, TimelineNode } from '../timeline';
import {
  getCurrentNode,
  getNextNode,
  getProgress,
  getRemainingTime,
  snapTime,
  nodeDuration,
  timeToMinutes,
  minutesToTime
} from '../timeline';
import type { Config } from '../types';
import { isValidConfig } from '../validate';
import {
  configToTimelineConfigs,
  timelineConfigsToConfig
} from '../adapter';
import { decodeConfig, extractParam } from '../share';
import { templateConfig } from '../templates';

export type ScheduleType = 'weekday' | 'weekend';

/** L1 本地存储（文档 7.1）：Config 全量 + UI 偏好 */
const CONFIG_KEY = 'ticktots.config';
const SETTINGS_KEY = 'ticktots.settings';

export interface Settings {
  /** 蜂鸣提醒开关（与 Config.b 同步；文档 4.2 默认关） */
  beepEnabled?: boolean;
  /** 提前提醒分钟数 */
  beepLeadMinutes?: number;
  /** 蜂鸣音量（0~1） */
  beepVolume?: number;
  /** 单声时长（秒） */
  beepDuration?: number;
  /** 重复遍数：整段提醒模式循环播几遍（1~5） */
  beepRepeat?: number;
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
  beepEnabled: false,
  beepLeadMinutes: 5,
  beepVolume: 0.5,
  beepDuration: 0.35,
  beepRepeat: 2,
  soonSeconds: 600,
  urgentSeconds: 300,
  scaleBias: 0.85
};

// ====== 持久化：localStorage（Config 格式，一次读写全量） ======

/** 读取本地 Config；损坏 / 不存在都返回 null（绝不抛异常） */
export function loadConfigFromStorage(): Config | null {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return isValidConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadSettingsFromStorage(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[TickTots] 本地设置读取失败:', e);
  }
  return defaultSettings;
}

// ====== Stores ======

/**
 * 预填用的初始作息 = 3 岁模板（文档 4.2：首屏必须预填 3 岁模板）。
 * 不能用 timeline.ts 的 defaultWeekdayConfig——那是旧挂钟模型的 13 节点默认值，
 * 超过 10 个节点上限，「生成」会被校验拦下（表现为「改了时间没生效」）。
 */
const initialPair = configToTimelineConfigs(templateConfig('t3'));

/** 工作日作息 */
export const weekdayConfig = writable<TimelineConfig>(initialPair.weekday);

/** 周末作息 */
export const weekendConfig = writable<TimelineConfig>(initialPair.weekend);

/** 孩子昵称（只存本地和 URL，不上传） */
export const nickname = writable<string>('');

/** 是否启用周末作息（对应 Config.w） */
export const weekendEnabled = writable<boolean>(false);

/** 当前时间，每秒 tick 一次，驱动所有派生状态（不持久化） */
export const currentTime = writable<Date>(new Date());

/**
 * 开发预览用：手动设定的"当前分钟"，null = 跟随真实时间。
 * 仅 DEV 环境生效（setManualTime 内部有守卫）；正式构建里 UI 被剔除、且不会被调用。
 */
export const manualTime = writable<number | null>(null);

/** 设置项（蜂鸣开关等） */
export const settings = writable<Settings>(loadSettingsFromStorage());

/** 按当前日期判断工作日 / 周末（0=周日, 6=周六 视为周末） */
export const dayType = derived(currentTime, ($now) => {
  const d = $now.getDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
});

/** 当前显示用的作息（周末开关关闭时统一用工作日） */
export const timelineConfig = derived(
  [weekdayConfig, weekendConfig, dayType, weekendEnabled],
  ([$w, $e, $t, $we]) => ($we && $t === 'weekend' ? $e : $w)
);

/** 家长面板正在编辑的作息类型；面板打开时默认跟随当天 */
export const editScheduleType = writable<ScheduleType>('weekday');

/** 打开面板时，把编辑目标设为"今天"对应的那一套（未开两套时固定工作日） */
export function initEditScheduleType(): void {
  editScheduleType.set(get(weekendEnabled) ? get(dayType) : 'weekday');
}

/** 当前正在编辑的作息（读/写都走它）。未开两套时永远是工作日，避免改了不生效 */
export const activeConfig = derived(
  [weekdayConfig, weekendConfig, editScheduleType, weekendEnabled],
  ([$w, $e, $t, $we]) => ($we && $t === 'weekend' ? $e : $w)
);

// ====== 初始化：URL 优先 → localStorage → 设置页（绝不白屏） ======

export type InitSource = 'url' | 'local' | 'fallback';

export interface InitResult {
  source: InitSource;
  /** URL 里带了 c 但解码失败（已降级到本机配置）—— 展示页顶部淡出提示用 */
  urlCorrupt: boolean;
}

/**
 * 持久化开关：fallback 路径下不落盘，直到家长点「生成我家的时间轴」
 * （config_saved 才算「用了」的第一个信号，文档 9.1）。
 */
let persistEnabled = false;

/** 当前 store 状态 → Config */
export function currentConfig(): Config {
  return timelineConfigsToConfig(
    { weekday: get(weekdayConfig), weekend: get(weekendConfig) },
    get(nickname),
    get(settings).beepEnabled ? 1 : 0,
    get(weekendEnabled) ? 1 : 0
  );
}

function persistConfig(): void {
  if (!persistEnabled) return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(currentConfig()));
  } catch (e) {
    console.warn('[TickTots] 本地作息保存失败:', e);
  }
}

/** 用 Config 整体覆盖 store（URL 命中 / 导入 / 生成后回填都走这里） */
export function hydrateFromConfig(c: Config | null): boolean {
  if (!c || !isValidConfig(c)) return false;
  const pair = configToTimelineConfigs(c);
  nickname.set(c.n);
  weekendEnabled.set(c.w === 1);
  weekdayConfig.set(pair.weekday);
  weekendConfig.set(pair.weekend);
  settings.update((s) => ({ ...s, beepEnabled: c.b === 1 }));
  return true;
}

/**
 * 启动初始化。返回配置来源，供 App 决定是否提示 / 跳设置页：
 * - `url`：URL 参数解码成功（URL 优先，同时写入本地）
 * - `local`：URL 无参或损坏，回落到本机保存的配置
 * - `fallback`：两处都没有 —— 预填 3 岁模板，**不落盘**，等家长点生成
 *
 * `urlCorrupt`：URL 带了 c 但解码失败（文档 7.2 关键约束 1 的降级提示）。
 */
export function applyUrlThenLocal(hash?: string): InitResult {
  bootstrapped = true;
  const raw = extractParam(hash ?? (typeof location !== 'undefined' ? location.hash : ''));
  let urlCorrupt = false;
  if (raw) {
    const fromUrl = decodeConfig(raw);
    if (fromUrl && hydrateFromConfig(fromUrl)) {
      persistEnabled = true;
      persistConfig();
      return { source: 'url', urlCorrupt: false };
    }
    // URL 损坏：忽略，继续走本地
    urlCorrupt = true;
  }
  const local = loadConfigFromStorage();
  if (local && hydrateFromConfig(local)) {
    persistEnabled = true;
    return { source: 'local', urlCorrupt };
  }
  // 先关落盘再回填模板，避免 subscribe 误把兜底模板写进 localStorage
  persistEnabled = false;
  hydrateFromConfig(templateConfig('t3'));
  return { source: 'fallback', urlCorrupt };
}

/**
 * 设置页（`#/`）启动初始化：只跑一次。
 * - localStorage 有配置 → 读它（上次生成/编辑的结果）
 * - 没有 → 预填 3 岁模板（文档 4.2「首屏必须预填 3 岁模板」），不落盘
 *
 * 展示页走 `applyUrlThenLocal()`（URL 优先），两者互不抢跑：
 * 任一路径初始化过后，另一条就不再覆盖 store。
 */
let bootstrapped = false;

export function ensureLocalInit(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  const local = loadConfigFromStorage();
  if (local && hydrateFromConfig(local)) {
    persistEnabled = true;
    return;
  }
  persistEnabled = false;
  hydrateFromConfig(templateConfig('t3'));
}

/** 家长点「生成我家的时间轴」后调用：此后每次变更都落盘 */
export function enablePersist(): void {
  persistEnabled = true;
  persistConfig();
}

/** 导入 JSON 后立即落盘 */
export function applyImportedConfig(c: Config): boolean {
  if (!hydrateFromConfig(c)) return false;
  persistEnabled = true;
  persistConfig();
  return true;
}

// ====== 持久化订阅（只写本地，零网络） ======

weekdayConfig.subscribe(() => persistConfig());
weekendConfig.subscribe(() => persistConfig());
nickname.subscribe(() => persistConfig());
weekendEnabled.subscribe(() => persistConfig());
settings.subscribe((s) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('[TickTots] 本地设置保存失败:', e);
  }
  persistConfig();
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

/** 把"当天分钟数"转为今天该时刻的 Date（用于开发预览冻结时间） */
function minutesToDate(min: number): Date {
  const d = new Date();
  d.setHours(Math.floor(min / 60) % 24, min % 60, 0, 0);
  return d;
}

/** 每秒调用，更新当前时间（挂钟模型下时间只会前进，无需补偿漂移） */
export function tick(): void {
  const mt = get(manualTime);
  // 开发预览：手动设定了时间则冻结在该时刻，方便看夜间/各时段效果
  if (import.meta.env.DEV && mt !== null) {
    currentTime.set(minutesToDate(mt));
  } else {
    currentTime.set(new Date());
  }
}

/**
 * 开发预览：覆盖"当前时间"。
 * 正式版（import.meta.env.DEV === false）直接忽略，从根上保证生产环境无法被篡改。
 */
export function setManualTime(min: number | null): void {
  if (!import.meta.env.DEV) return;
  manualTime.set(min);
}

/** 更新"当前正在编辑"的那套作息 */
export function updateConfig(updater: (config: TimelineConfig) => TimelineConfig): void {
  // 家长真的动手改了（改时间/拖拽/增删）就算「用过」——立即落盘，
  // 避免改完没点生成就刷新/后退，改动全部蒸发。
  // 兜底模板仍然不落盘（只有 hydrate 走它，不经这里）。
  persistEnabled = true;
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
 * 拖拽排序：把「哪个活动占用哪个时段」换位——
 * 图标 / 名称 / 必须一起换到目标行，**时间留在原来的行上**。
 *
 * 不能只对调时间（旧行为）：那会让图标和名称钉在原位、时间却跳到别的行，
 * 视觉上就是「名称没动、时间被拖走了」。id 也不动（行 DOM 不重排，
 * 拖拽的 pointer capture 才不会中途丢失）。
 */
export function reorderNodes(from: number, to: number): void {
  updateConfig((config) => {
    if (from === to) return config;
    const nodes = [...config.nodes];
    if (from < 0 || to < 0 || from >= nodes.length || to >= nodes.length) return config;

    const a = nodes[from];
    const b = nodes[to];

    // 换活动内容，时段（id + 起止）留在原地
    nodes[from] = { ...a, activity: b.activity, name: b.name, required: b.required };
    nodes[to] = { ...b, activity: a.activity, name: a.name, required: a.required };

    return { ...config, nodes };
  });
}

/** 更新设置 */
export function updateSettings(newSettings: Partial<Settings>): void {
  settings.update((s) => ({ ...s, ...newSettings }));
}

/** 恢复默认作息（两套都恢复为 3 岁模板；旧 13 节点默认值会撞 10 个上限） */
export function resetToDefault(): void {
  const pair = configToTimelineConfigs(templateConfig('t3', get(nickname)));
  weekdayConfig.set({ ...pair.weekday, updatedAt: Date.now() });
  weekendConfig.set({ ...pair.weekend, updatedAt: Date.now() });
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

/** get 供外部一次性读取（导出 JSON 等） */
export { get };
