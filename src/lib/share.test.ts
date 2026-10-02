import { describe, it, expect } from 'vitest';
import { encodeConfig, decodeConfig, extractParam } from './share';
import { templateConfig, TEMPLATES, cloneNodes } from './templates';
import {
  routineToNode,
  nodeToRoutine,
  deriveTimelineConfig,
  configToTimelineConfigs,
  timelineConfigsToConfig
} from './adapter';
import { isValidConfig } from './validate';
import type { Config } from './types';

// 文档 7.2 的示例串（3 岁模板 + 昵称「小宝」+ 蜂鸣开 + 无周末）
const DOC_SAMPLE =
  'v1.5bCP5a6d.wake_450_480_1-meal_480_510_1-play_570_690_0-meal_720_750_1-nap_780_900_1-meal_1110_1140_1-sleep_1230_450_1.10';

describe('share：文档 7.2 示例串逐字段断言', () => {
  it('decode 出的结构与文档一致', () => {
    const c = decodeConfig(DOC_SAMPLE);
    expect(c).not.toBeNull();
    expect(c!.v).toBe(1);
    expect(c!.n).toBe('小宝');
    expect(c!.b).toBe(1);
    expect(c!.w).toBe(0);
    expect(c!.a2).toBeUndefined();
    expect(c!.a).toHaveLength(7);
    expect(c!.a[0]).toEqual({ i: 'wake', n: '', s: 450, e: 480, m: 1 });
    expect(c!.a[2]).toEqual({ i: 'play', n: '', s: 570, e: 690, m: 0 });
    expect(c!.a[6]).toEqual({ i: 'sleep', n: '', s: 1230, e: 450, m: 1 });
  });

  it('encode(decode(doc)) === doc（4 段旧串往返恒等）', () => {
    const c = decodeConfig(DOC_SAMPLE)!;
    expect(encodeConfig(c)).toBe(DOC_SAMPLE);
  });
});

describe('share：编解码往返', () => {
  it('中文昵称 base64url 往返不丢', () => {
    const c = templateConfig('t3', '小宝');
    const back = decodeConfig(encodeConfig(c))!;
    expect(back.n).toBe('小宝');
  });

  it('空昵称往返不丢', () => {
    const c = templateConfig('t4', '');
    const back = decodeConfig(encodeConfig(c))!;
    expect(back.n).toBe('');
  });

  it('显示名保留：meal ×3 区分为早餐/午餐/晚餐', () => {
    const c = templateConfig('t3', '小宝');
    const back = decodeConfig(encodeConfig(c))!;
    const names = back.a.filter((x) => x.i === 'meal').map((x) => x.n);
    expect(names).toEqual(['早餐', '午餐', '晚餐']);
    // 逐节点全字段一致（配置完全一致的验收口径）
    expect(back.a).toEqual(c.a);
  });

  it('跨夜睡眠节点 e < s 原样保留', () => {
    const c = templateConfig('t3');
    const back = decodeConfig(encodeConfig(c))!;
    const sleep = back.a[back.a.length - 1];
    expect(sleep.s).toBe(1230);
    expect(sleep.e).toBe(450);
    expect(sleep.e).toBeLessThan(sleep.s);
  });

  it('w=1 时第 5 段携带 a2 并往返一致', () => {
    const c: Config = {
      v: 1,
      n: '多多',
      a: cloneNodes(TEMPLATES[0].nodes),
      b: 0,
      w: 1,
      a2: cloneNodes(TEMPLATES[2].nodes)
    };
    const s = encodeConfig(c);
    expect(s.split('.')).toHaveLength(5);
    const back = decodeConfig(s)!;
    expect(back.w).toBe(1);
    expect(back.a2).toEqual(c.a2);
    expect(back.a).toEqual(c.a);
    expect(back.n).toBe('多多');
  });

  it('w=1 但无 a2：仍可解析（回落由调用方处理）', () => {
    const s = 'v1..wake_450_480_1-sleep_1230_450_1.01';
    const c = decodeConfig(s);
    expect(c).not.toBeNull();
    expect(c!.w).toBe(1);
    expect(c!.a2).toBeUndefined();
  });
});

describe('share：损坏输入一律 null（绝不白屏）', () => {
  const bad = [
    '',
    'garbage',
    'v2..wake_450_480_1.00',
    'v1..wake_450_480_1.0', // bw 段长度不足
    'v1..wake_450_480_1.20', // b 非 0/1
    'v1..wake_450_480_1.02', // w 非 0/1
    'v1..wake_450_480_1', // 段数不足
    'v1..wake_450_480_1.00.extra', // 段数过多
    'v1..WAKE_450_480_1.00', // id 含大写
    'v1..wake_1500_480_1.00', // s 越界
    'v1..wake_450_9999_1.00', // e 越界
    'v1..wake_450_480_2.00', // m 非 0/1
    'v1..wake_450_480.00', // 节点字段不足
    'v1..wake_450_480_1-.00', // 空节点
    'v1...00' // 无节点串
  ];
  for (const s of bad) {
    it(`decodeConfig(${JSON.stringify(s)}) === null`, () => {
      expect(decodeConfig(s)).toBeNull();
    });
  }

  it('decodeConfig(null as any) 不抛异常', () => {
    expect(decodeConfig(null as unknown as string)).toBeNull();
    expect(decodeConfig(undefined as unknown as string)).toBeNull();
    expect(decodeConfig(123 as unknown as string)).toBeNull();
  });
});

describe('templates：文档第 6 节结构', () => {
  it('三套模板各 7 个节点，末节点为跨夜 sleep', () => {
    expect(TEMPLATES).toHaveLength(3);
    for (const t of TEMPLATES) {
      expect(t.nodes).toHaveLength(7);
      const last = t.nodes[t.nodes.length - 1];
      expect(last.i).toBe('sleep');
      expect(last.e).toBeLessThan(last.s); // 跨夜
      expect(last.m).toBe(1);
    }
  });

  it('3 岁模板与文档 6.1 逐条一致', () => {
    const n = TEMPLATES[0].nodes;
    expect(n.map((x) => [x.s, x.e])).toEqual([
      [450, 480],
      [480, 510],
      [570, 690],
      [720, 750],
      [780, 900],
      [1110, 1140],
      [1230, 450]
    ]);
    expect(n.map((x) => x.i)).toEqual(['wake', 'meal', 'play', 'meal', 'nap', 'meal', 'sleep']);
  });

  it('5 岁模板无午睡，含 outdoor', () => {
    const n = TEMPLATES[2].nodes;
    expect(n.some((x) => x.i === 'nap')).toBe(false);
    expect(n.some((x) => x.i === 'outdoor')).toBe(true);
    expect(n[n.length - 1]).toEqual({ i: 'sleep', n: '睡觉', s: 1260, e: 420, m: 1 });
  });

  it('templateConfig 默认 b=0、w=0，且 clone 隔离', () => {
    const c = templateConfig('t3');
    expect(c.b).toBe(0);
    expect(c.w).toBe(0);
    expect(isValidConfig(c)).toBe(true);
    c.a[0].n = '改过';
    expect(TEMPLATES[0].nodes[0].n).toBe('起床');
  });
});

describe('adapter：RoutineNode ↔ TimelineNode', () => {
  it('往返字段一致（含空名归一）', () => {
    const node = routineToNode({ i: 'meal', n: '早餐', s: 480, e: 510, m: 1 }, 3);
    expect(node).toEqual({
      id: 'meal-3',
      activity: 'meal',
      startTime: '08:00',
      endTime: '08:30',
      required: true,
      name: '早餐'
    });
    expect(nodeToRoutine(node)).toEqual({ i: 'meal', n: '早餐', s: 480, e: 510, m: 1 });
  });

  it('空显示名 → name undefined（展示层可 ?? 兜底）', () => {
    const node = routineToNode({ i: 'play', n: '', s: 570, e: 690, m: 0 }, 0);
    expect(node.name).toBeUndefined();
  });

  it('deriveTimelineConfig：wake=首节点 s，sleep=跨夜节点 s', () => {
    const cfg = deriveTimelineConfig(TEMPLATES[0].nodes);
    expect(cfg.wakeTime).toBe('07:30');
    expect(cfg.sleepTime).toBe('20:30');
    expect(cfg.nodes).toHaveLength(7);
    expect(cfg.nodes[6].endTime).toBe('07:30');
  });

  it('无跨夜节点时 sleep=末节点 e', () => {
    const cfg = deriveTimelineConfig([
      { i: 'wake', n: '起床', s: 480, e: 540, m: 1 },
      { i: 'play', n: '玩', s: 540, e: 660, m: 0 }
    ]);
    expect(cfg.wakeTime).toBe('08:00');
    expect(cfg.sleepTime).toBe('11:00');
  });

  it('configToTimelineConfigs / timelineConfigsToConfig 往返一致', () => {
    const c: Config = {
      v: 1,
      n: '果果',
      a: cloneNodes(TEMPLATES[1].nodes),
      b: 1,
      w: 1,
      a2: cloneNodes(TEMPLATES[2].nodes)
    };
    const pair = configToTimelineConfigs(c);
    expect(pair.weekday.nodes).toHaveLength(7);
    expect(pair.weekend.nodes).toHaveLength(7);
    const back = timelineConfigsToConfig(pair, c.n, c.b, c.w);
    expect(back.a).toEqual(c.a);
    expect(back.a2).toEqual(c.a2);
    expect(back.n).toBe(c.n);
    expect(back.b).toBe(1);
    expect(back.w).toBe(1);
    expect(isValidConfig(back)).toBe(true);
  });
});

describe('extractParam', () => {
  it('从 hash query 里取 c', () => {
    expect(extractParam(`#/view?c=${DOC_SAMPLE}`)).toBe(DOC_SAMPLE);
    expect(extractParam('#/view')).toBeNull();
    expect(extractParam('#/')).toBeNull();
    expect(extractParam('')).toBeNull();
  });
});
