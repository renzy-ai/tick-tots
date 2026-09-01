import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  isCrossNight,
  getCurrentNode,
  getProgress,
  getRemainingTime,
  getNextNode,
  snapTime,
  nodeDuration,
  defaultTimelineConfig,
  type TimelineNode
} from './timeline';

// 测试数据：一天的简单作息
const sampleNodes: TimelineNode[] = [
  { id: '1', activity: 'wake', startTime: '07:30', endTime: '08:00', required: true },
  { id: '2', activity: 'breakfast', startTime: '08:00', endTime: '08:30', required: true },
  { id: '3', activity: 'play', startTime: '08:30', endTime: '11:30', required: false },
  { id: '4', activity: 'lunch', startTime: '11:30', endTime: '12:00', required: true },
];

// 测试数据：含跨夜睡觉节点
const crossNightNodes: TimelineNode[] = [
  { id: '1', activity: 'play', startTime: '18:00', endTime: '19:00', required: false },
  { id: '2', activity: 'bath', startTime: '19:00', endTime: '19:30', required: true },
  { id: '3', activity: 'sleep', startTime: '20:30', endTime: '07:30', required: true },
];

describe('时间转换', () => {
  it('timeToMinutes 正确转换', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('07:30')).toBe(450);
    expect(timeToMinutes('20:30')).toBe(1230);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('minutesToTime 正确转换', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(450)).toBe('07:30');
    expect(minutesToTime(1230)).toBe('20:30');
  });

  it('转换可逆', () => {
    expect(minutesToTime(timeToMinutes('13:45'))).toBe('13:45');
  });
});

describe('isCrossNight 跨夜判定', () => {
  it('晚上睡、早上起 = 跨夜', () => {
    expect(isCrossNight('20:30', '07:30')).toBe(true);
  });

  it('午睡（同一天内）= 不跨夜', () => {
    expect(isCrossNight('13:00', '15:00')).toBe(false);
  });

  it('午夜整点睡觉 = 跨夜', () => {
    expect(isCrossNight('00:00', '07:00')).toBe(false); // 00:00 不晚于 07:00
    expect(isCrossNight('23:00', '06:00')).toBe(true);
  });
});

describe('getCurrentNode 当前节点判定', () => {
  it('命中第一个节点', () => {
    const node = getCurrentNode(sampleNodes, '07:45');
    expect(node?.activity).toBe('wake');
  });

  it('节点切换瞬间命中新节点（左闭右开）', () => {
    // 08:00 是 wake 的结束、breakfast 的开始，应命中 breakfast
    const node = getCurrentNode(sampleNodes, '08:00');
    expect(node?.activity).toBe('breakfast');
  });

  it('命中中间节点', () => {
    const node = getCurrentNode(sampleNodes, '10:00');
    expect(node?.activity).toBe('play');
  });

  it('所有节点之前 = null', () => {
    expect(getCurrentNode(sampleNodes, '06:00')).toBeNull();
  });

  it('所有节点之后 = null', () => {
    expect(getCurrentNode(sampleNodes, '23:00')).toBeNull();
  });
});

describe('getCurrentNode 跨夜场景', () => {
  it('睡觉节点当晚命中', () => {
    const node = getCurrentNode(crossNightNodes, '23:00');
    expect(node?.activity).toBe('sleep');
  });

  it('睡觉节点次日凌晨命中', () => {
    const node = getCurrentNode(crossNightNodes, '03:00');
    expect(node?.activity).toBe('sleep');
  });

  it('睡觉节点次日早上仍命中（直到 07:30）', () => {
    const node = getCurrentNode(crossNightNodes, '07:00');
    expect(node?.activity).toBe('sleep');
  });

  it('睡觉开始前不命中睡觉', () => {
    // 19:30 - 20:30 是间隙，不在任何节点内
    expect(getCurrentNode(crossNightNodes, '20:00')).toBeNull();
  });

  it('起床后进入新一天', () => {
    // 07:30 之后 sleep 结束，且没有其他节点
    expect(getCurrentNode(crossNightNodes, '08:00')).toBeNull();
  });
});

describe('getProgress 进度计算', () => {
  it('节点刚开始 = 0', () => {
    expect(getProgress(sampleNodes[0], '07:30')).toBe(0);
  });

  it('节点进行到一半 = 0.5', () => {
    // 07:30-08:00，30分钟，08:00 为结束 → 用 07:45 测中点
    expect(getProgress(sampleNodes[0], '07:45')).toBeCloseTo(0.5, 5);
  });

  it('两小时节点的中点', () => {
    // play 08:30-11:30（180分钟），10:00 是中点
    expect(getProgress(sampleNodes[2], '10:00')).toBeCloseTo(0.5, 5);
  });

  it('无节点 = 0', () => {
    expect(getProgress(null, '10:00')).toBe(0);
  });

  it('进度不超过 1', () => {
    expect(getProgress(sampleNodes[0], '07:59')).toBeLessThanOrEqual(1);
  });
});

describe('getProgress 跨夜节点', () => {
  const sleepNode = crossNightNodes[2]; // 20:30 -> 07:30，共 660 分钟

  it('刚睡下进度接近 0', () => {
    expect(getProgress(sleepNode, '20:30')).toBeCloseTo(0, 5);
  });

  it('当晚 23:00 的进度 = 150/660', () => {
    // 20:30 到 23:00 = 150 分钟
    expect(getProgress(sleepNode, '23:00')).toBeCloseTo(150 / 660, 5);
  });

  it('次日凌晨 03:00 的进度 = 390/660', () => {
    // 20:30 到次日 03:00 = 210 + 180 = 390 分钟
    expect(getProgress(sleepNode, '03:00')).toBeCloseTo(390 / 660, 5);
  });

  it('跨夜后进度单调递增（不回退）', () => {
    const p1 = getProgress(sleepNode, '23:59');
    const p2 = getProgress(sleepNode, '00:01');
    const p3 = getProgress(sleepNode, '05:00');
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });
});

describe('getRemainingTime 剩余时间', () => {
  it('剩余 10 分钟 = 600 秒', () => {
    // wake 07:30-08:00，07:50 剩 10 分钟
    expect(getRemainingTime(sampleNodes[0], '07:50')).toBe(600);
  });

  it('节点结束时 = 0', () => {
    expect(getRemainingTime(sampleNodes[0], '08:00')).toBe(0);
  });

  it('无节点 = 0', () => {
    expect(getRemainingTime(null, '10:00')).toBe(0);
  });
});

describe('getRemainingTime 跨夜节点', () => {
  const sleepNode = crossNightNodes[2]; // 20:30 -> 07:30

  it('当晚 23:00 剩余到次日 07:30 = 510 分钟', () => {
    // 23:00 -> 次日 07:30：60(到24点) + 450 = 510 分钟
    expect(getRemainingTime(sleepNode, '23:00')).toBe(510 * 60);
  });

  it('次日 03:00 剩余 270 分钟', () => {
    // 03:00 -> 07:30 = 270 分钟
    expect(getRemainingTime(sleepNode, '03:00')).toBe(270 * 60);
  });

  it('跨夜后剩余时间递减', () => {
    const r1 = getRemainingTime(sleepNode, '23:00');
    const r2 = getRemainingTime(sleepNode, '02:00');
    expect(r2).toBeLessThan(r1);
  });
});

describe('getNextNode 下一个节点', () => {
  it('当前节点的下一个', () => {
    expect(getNextNode(sampleNodes, '07:45')?.activity).toBe('breakfast');
  });

  it('节点区间内的下一个', () => {
    // 08:35 落在 play(08:30-11:30) 内，下一个是 lunch
    expect(getNextNode(sampleNodes, '08:35')?.activity).toBe('lunch');
  });

  it('间隙中返回下一个即将开始的', () => {
    // 自带一份有间隙的作息，不依赖默认配置（默认作息首尾相接、无间隙）
    const gapped: TimelineNode[] = [
      { id: 'a', activity: 'breakfast', startTime: '08:00', endTime: '09:00', required: true },
      { id: 'b', activity: 'play', startTime: '10:00', endTime: '11:00', required: false }
    ];
    // 09:30 落在两个节点之间的间隙
    expect(getCurrentNode(gapped, '09:30')).toBeNull();
    expect(getNextNode(gapped, '09:30')?.activity).toBe('play');
  });

  it('全部结束后环回第一个', () => {
    expect(getNextNode(sampleNodes, '23:00')?.id).toBe('1');
  });

  it('最后一个节点之后环回第一个', () => {
    expect(getNextNode(sampleNodes, '11:45')?.id).toBe('1');
  });
});

describe('snapTime 时间吸附', () => {
  it('接近整点吸附到整点', () => {
    expect(snapTime(58, 5)).toBe(60);
    expect(snapTime(62, 5)).toBe(60);
  });

  it('接近半点吸附到半点', () => {
    expect(snapTime(449, 5)).toBe(450); // 07:29 -> 07:30
    expect(snapTime(452, 5)).toBe(450);
  });

  it('恰好在吸附边界内会被吸附', () => {
    expect(snapTime(35, 5)).toBe(30); // 距半点 30 正好 5 分钟，落在 ±5 内
  });

  it('超出吸附范围保持原值', () => {
    expect(snapTime(37, 5)).toBe(37); // 距半点 7 分钟、距整点 23 分钟，都超出 ±5
  });

  it('吸附结果不越界（23:58 -> 00:00）', () => {
    expect(snapTime(1438, 5)).toBe(1440 % 1440); // 归一化为 0
  });
});

describe('默认配置自检', () => {
  it('节点时间格式合法', () => {
    for (const node of defaultTimelineConfig.nodes) {
      expect(node.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(node.endTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('节点按开始时间升序排列', () => {
    const times = defaultTimelineConfig.nodes.map((n) => timeToMinutes(n.startTime));
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it('默认配置为跨夜（20:30 睡、07:30 起）', () => {
    expect(
      isCrossNight(defaultTimelineConfig.sleepTime, defaultTimelineConfig.wakeTime)
    ).toBe(true);
  });

  it('默认作息首尾相接，白天段无空隙', () => {
    // 除最后一个跨夜的睡觉节点外，每个节点的结束 = 下一个节点的开始
    const nodes = defaultTimelineConfig.nodes;
    for (let i = 0; i < nodes.length - 2; i++) {
      expect(nodes[i].endTime).toBe(nodes[i + 1].startTime);
    }
  });

  it('睡觉节点跨夜、时长 10 小时（21:30→07:30）', () => {
    const sleepNode = defaultTimelineConfig.nodes[defaultTimelineConfig.nodes.length - 1];
    expect(sleepNode.activity).toBe('sleep');
    expect(nodeDuration(sleepNode)).toBe(10 * 60);
  });
});

describe('nodeDuration 节点时长（D1 格子等比渲染依据）', () => {
  it('普通节点', () => {
    expect(
      nodeDuration({
        id: 'x',
        activity: 'play',
        startTime: '09:00',
        endTime: '12:00',
        required: true
      })
    ).toBe(180);
  });

  it('短节点', () => {
    expect(
      nodeDuration({
        id: 'x',
        activity: 'wake',
        startTime: '07:30',
        endTime: '07:40',
        required: true
      })
    ).toBe(10);
  });

  it('跨夜节点（20:30→07:30 = 11 小时）', () => {
    expect(
      nodeDuration({
        id: 'x',
        activity: 'sleep',
        startTime: '20:30',
        endTime: '07:30',
        required: true
      })
    ).toBe(660);
  });

  it('跨午夜节点（23:00→01:00 = 2 小时）', () => {
    expect(
      nodeDuration({
        id: 'x',
        activity: 'sleep',
        startTime: '23:00',
        endTime: '01:00',
        required: true
      })
    ).toBe(120);
  });
});
