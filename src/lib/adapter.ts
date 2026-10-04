/**
 * 新旧数据模型适配层（网页版 MVP ↔ 挂钟模型）
 *
 * 网页版 `RoutineNode` 用「0 点起算的分钟数」（s/e），挂钟模型 `TimelineNode`
 * 用 "HH:MM" 字符串。本文件做双向转换，`timeline.ts` 的纯函数保持不动
 * （合回 main 时冲突最小）。
 */

import type { Config, RoutineNode } from './types';
import type { TimelineConfig, TimelineNode } from './timeline';
import { minutesToTime, timeToMinutes } from './timeline';

/** RoutineNode → TimelineNode */
export function routineToNode(r: RoutineNode, index: number): TimelineNode {
  return {
    id: `${r.i}-${index}`,
    activity: r.i,
    startTime: minutesToTime(r.s),
    endTime: minutesToTime(r.e),
    required: r.m === 1,
    // 空显示名归一成 undefined，让展示层的 `node.name ?? a.name` 兜底生效
    ...(r.n ? { name: r.n } : {})
  };
}

/** TimelineNode → RoutineNode */
export function nodeToRoutine(n: TimelineNode): RoutineNode {
  return {
    i: n.activity,
    n: n.name ?? '',
    s: timeToMinutes(n.startTime),
    e: timeToMinutes(n.endTime),
    m: n.required ? 1 : 0
  };
}

/**
 * 由节点数组推导 TimelineConfig 的 wakeTime / sleepTime。
 * - wakeTime = 首节点开始
 * - sleepTime = 跨夜节点（e < s）的开始；无跨夜则取末节点结束
 * - 节点为空时回落到 3 岁模板的边界（07:30 / 20:30）
 */
export function deriveTimelineConfig(nodes: RoutineNode[]): TimelineConfig {
  const sorted = [...nodes].sort((x, y) => x.s - y.s);
  const wake = sorted.length ? minutesToTime(sorted[0].s) : '07:30';
  const crossNight = sorted.find((x) => x.e < x.s);
  const sleep = crossNight
    ? minutesToTime(crossNight.s)
    : sorted.length
      ? minutesToTime(sorted[sorted.length - 1].e)
      : '20:30';
  return {
    wakeTime: wake,
    sleepTime: sleep,
    nodes: sorted.map((r, i) => routineToNode(r, i)),
    updatedAt: Date.now()
  };
}

export interface TimelinePair {
  weekday: TimelineConfig;
  weekend: TimelineConfig;
}

/** Config → 工作日/周末两套 TimelineConfig（w=0 时两套相同） */
export function configToTimelineConfigs(c: Config): TimelinePair {
  const weekday = deriveTimelineConfig(c.a);
  const weekend = deriveTimelineConfig(c.w === 1 && c.a2?.length ? c.a2 : c.a);
  return { weekday, weekend };
}

/** 两套 TimelineConfig + 偏好 → Config */
export function timelineConfigsToConfig(
  pair: TimelinePair,
  nickname: string,
  beep: 0 | 1,
  weekendEnabled: 0 | 1
): Config {
  const a = pair.weekday.nodes.map(nodeToRoutine);
  const a2 = pair.weekend.nodes.map(nodeToRoutine);
  return {
    v: 1,
    n: nickname,
    a,
    b: beep,
    w: weekendEnabled,
    ...(weekendEnabled === 1 ? { a2 } : {})
  };
}
