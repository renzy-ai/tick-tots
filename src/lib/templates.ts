/**
 * 三套预置模板（《嘀嗒童行_MVP开发规格_v1.md》第 6 节）
 *
 * 解决配置摩擦的关键：家长点一下就能生成 7 个节点，不能是空白表单。
 * 以下为示意默认值，家长可在设置页修改。睡眠节点允许跨夜（e < s）。
 */

import type { Config, RoutineNode } from './types';

export type TemplateKey = 't3' | 't4' | 't5';

export interface Template {
  key: TemplateKey;
  label: string;
  hint: string;
  nodes: RoutineNode[];
}

/** 三岁左右：午睡长，睡得早 */
const t3: RoutineNode[] = [
  { i: 'wake', n: '起床', s: 450, e: 480, m: 1 },
  { i: 'meal', n: '早餐', s: 480, e: 510, m: 1 },
  { i: 'play', n: '玩耍', s: 570, e: 690, m: 0 },
  { i: 'meal', n: '午餐', s: 720, e: 750, m: 1 },
  { i: 'nap', n: '午睡', s: 780, e: 900, m: 1 },
  { i: 'meal', n: '晚餐', s: 1110, e: 1140, m: 1 },
  { i: 'sleep', n: '睡觉', s: 1230, e: 450, m: 1 }
];

/** 四岁左右：午睡短，睡得稍晚 */
const t4: RoutineNode[] = [
  { i: 'wake', n: '起床', s: 450, e: 480, m: 1 },
  { i: 'meal', n: '早餐', s: 480, e: 510, m: 1 },
  { i: 'study', n: '幼儿园', s: 540, e: 690, m: 0 },
  { i: 'meal', n: '午餐', s: 720, e: 750, m: 1 },
  { i: 'nap', n: '午睡', s: 780, e: 870, m: 1 },
  { i: 'meal', n: '晚餐', s: 1110, e: 1140, m: 1 },
  { i: 'sleep', n: '睡觉', s: 1260, e: 450, m: 1 }
];

/** 五岁左右：不午睡 */
const t5: RoutineNode[] = [
  { i: 'wake', n: '起床', s: 420, e: 450, m: 1 },
  { i: 'meal', n: '早餐', s: 450, e: 480, m: 1 },
  { i: 'study', n: '幼儿园', s: 510, e: 690, m: 0 },
  { i: 'meal', n: '午餐', s: 720, e: 750, m: 1 },
  { i: 'outdoor', n: '户外', s: 900, e: 1020, m: 0 },
  { i: 'meal', n: '晚餐', s: 1110, e: 1140, m: 1 },
  { i: 'sleep', n: '睡觉', s: 1260, e: 420, m: 1 }
];

export const TEMPLATES: Template[] = [
  { key: 't3', label: '3 岁左右', hint: '午睡长，睡得早', nodes: t3 },
  { key: 't4', label: '4 岁左右', hint: '午睡短，睡得稍晚', nodes: t4 },
  { key: 't5', label: '5 岁左右', hint: '不午睡', nodes: t5 }
];

export const DEFAULT_TEMPLATE_KEY: TemplateKey = 't3';

/** 深拷贝模板节点（防止编辑污染模板常量） */
export function cloneNodes(nodes: RoutineNode[]): RoutineNode[] {
  return nodes.map((x) => ({ ...x }));
}

/** 用模板生成完整 Config（蜂鸣默认关、周末作息默认关） */
export function templateConfig(key: TemplateKey = DEFAULT_TEMPLATE_KEY, nickname = ''): Config {
  const tpl = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
  return {
    v: 1,
    n: nickname,
    a: cloneNodes(tpl.nodes),
    b: 0,
    w: 0
  };
}
