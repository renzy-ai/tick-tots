/**
 * 挂钟模型 - KidTimeline 核心
 *
 * 与 Tot Clock 的倒计时模型不同：每个节点有固定的开始/结束时间（如 07:30-08:00），
 * 根据当前时间判断当前活动、进度、剩余时间。
 */

// ====== 数据结构 ======

export interface TimelineNode {
  id: string;
  activity: string; // Activity ID，对应 activities.ts
  startTime: string; // "HH:MM" 格式
  endTime: string;   // "HH:MM" 格式
  required: boolean;  // true=必须做（实线框）, false=自由（虚线框）
}

export interface TimelineConfig {
  wakeTime: string;  // "HH:MM" 起床时间
  sleepTime: string; // "HH:MM" 睡觉时间
  nodes: TimelineNode[];
  updatedAt: number;  // 时间戳
}

// ====== 工具函数 ======

/** 将 "HH:MM" 转换为从 0:00 起的分钟数 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 将分钟数转为 "HH:MM" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(((minutes % 1440) + 1440) % 1440 / 60);
  const m = ((minutes % 1440) + 1440) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 获取当前时间的分钟数 */
export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * 判断是否跨夜
 *
 * 睡觉开始时间晚于起床时间，说明要跨过午夜才能到起床时间 → 跨夜。
 * 例：sleepTime="20:30", wakeTime="07:30" → 20:30 睡、次日 7:30 起 → 跨夜 = true
 * 例：sleepTime="13:00", wakeTime="15:00"（午睡）→ 同一天内 → 跨夜 = false
 *
 * 注意参数顺序：(sleepTime, wakeTime)
 */
export function isCrossNight(sleepTime: string, wakeTime: string): boolean {
  return timeToMinutes(sleepTime) > timeToMinutes(wakeTime);
}

// ====== 核心函数 ======

/**
 * 获取当前应该显示的活动节点
 *
 * 逻辑：遍历 nodes，找到 currentTime 落在 [startTime, endTime) 内的节点。
 * 跨夜处理：如果 sleepTime > wakeTime（跨夜），sleep 节点 endTime 可能是 "07:00"
 * 而实际跨过了午夜。
 *
 * @returns 当前节点，如果不在任何节点时间段内返回 null
 */
export function getCurrentNode(nodes: TimelineNode[], currentTime?: string): TimelineNode | null {
  const now = currentTime ? timeToMinutes(currentTime) : nowMinutes();

  for (const node of nodes) {
    const start = timeToMinutes(node.startTime);
    const end = timeToMinutes(node.endTime);

    if (start <= end) {
      // 正常情况：不跨午夜
      if (now >= start && now < end) return node;
    } else {
      // 跨午夜：如 20:30 -> 07:00
      if (now >= start || now < end) return node;
    }
  }

  return null;
}

/**
 * 获取当前节点的进度 (0~1)
 *
 * @returns 0~1 的进度值，如果无当前节点返回 0
 */
export function getProgress(node: TimelineNode | null, currentTime?: string): number {
  if (!node) return 0;

  const now = currentTime ? timeToMinutes(currentTime) : nowMinutes();
  const start = timeToMinutes(node.startTime);
  const end = timeToMinutes(node.endTime);

  let totalDuration: number;
  let elapsed: number;

  if (start <= end) {
    totalDuration = end - start;
    elapsed = now - start;
  } else {
    // 跨午夜
    totalDuration = (1440 - start) + end;
    elapsed = now >= start ? now - start : (1440 - start) + now;
  }

  if (totalDuration <= 0) return 0;
  return Math.max(0, Math.min(1, elapsed / totalDuration));
}

/**
 * 获取当前节点的剩余秒数
 *
 * @returns 剩余秒数，如果无当前节点返回 0
 */
export function getRemainingTime(node: TimelineNode | null, currentTime?: string): number {
  if (!node) return 0;

  // 传入 currentTime 时按整分钟计（秒数为 0），保证结果可预测、可测试；
  // 不传时读取真实系统时间（含秒），用于 UI 实时倒计时。
  const now = currentTime ? timeToMinutes(currentTime) : nowMinutes();
  const nowSeconds = currentTime ? now * 60 : now * 60 + new Date().getSeconds();

  const start = timeToMinutes(node.startTime);
  const end = timeToMinutes(node.endTime);

  let endSeconds: number;
  if (start <= end) {
    // 不跨午夜：结束时间就是当天
    endSeconds = end * 60;
  } else {
    // 跨午夜（如 20:30 -> 07:00）：
    // 当前时间还在起点之后（当晚），结束时间要加一天；已过午夜则结束时间就是当天
    endSeconds = now >= start ? (1440 + end) * 60 : end * 60;
  }

  return Math.max(0, endSeconds - nowSeconds);
}

/**
 * 获取剩余时间的格式化字符串（"X分" 或 "X分Y秒"）
 */
export function formatRemaining(node: TimelineNode | null, currentTime?: string): string {
  const seconds = getRemainingTime(node, currentTime);
  if (seconds <= 0) return '0分';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}秒`;
  if (secs === 0) return `${mins}分`;
  return `${mins}分${secs}秒`;
}

/**
 * 获取下一个节点
 */
export function getNextNode(nodes: TimelineNode[], currentTime?: string): TimelineNode | null {
  if (nodes.length === 0) return null;

  const now = currentTime ? timeToMinutes(currentTime) : nowMinutes();
  const current = getCurrentNode(nodes, currentTime);

  // 有当前节点 → 直接返回排序上的下一个
  if (current) {
    const idx = nodes.indexOf(current);
    return nodes[idx + 1] ?? nodes[0] ?? null;
  }

  // 无当前节点（处在两个节点的间隙）→ 找第一个还没开始的
  for (const node of nodes) {
    if (timeToMinutes(node.startTime) > now) return node;
  }

  // 已过全部节点（深夜）→ 环回次日第一个节点
  return nodes[0] ?? null;
}

/**
 * 时间吸附算法
 * 将分钟数吸附到最近的整点或半点（±5分钟范围内）
 *
 * @param minutes 原始分钟数
 * @param snapRange 吸附范围（默认 5 分钟）
 * @returns 吸附后的分钟数
 */
export function snapTime(minutes: number, snapRange: number = 5): number {
  const candidates = [
    Math.round(minutes / 60) * 60,     // 最近的整点
    Math.round(minutes / 30) * 30,     // 最近的半点
  ];

  let best = minutes;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = Math.abs(minutes - c);
    if (dist <= snapRange && dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }

  return ((best % 1440) + 1440) % 1440;
}

/**
 * 节点时长（分钟），自动处理跨夜。
 * D1「格子按真实时长等比渲染」依赖这个值换算格子宽度。
 */
export function nodeDuration(node: TimelineNode): number {
  const start = timeToMinutes(node.startTime);
  const end = timeToMinutes(node.endTime);
  return end >= start ? end - start : 1440 - start + end;
}

// ====== 默认配置 ======

/**
 * 工作日默认作息 —— 按用户 2026-08-29 提供的真实安排填写
 *
 * 早晨：07:30 起床（含洗漱、08:00 下床）→ 08:00-09:00 去幼儿园（在家/路上）→ 09:00 起在幼儿园（含早饭）
 * 午间：12:00 午饭+午睡 → 15:00 起床加点心玩
 * 傍晚：17:00 放学接 → 17:30 后小区自由玩
 * 晚间：19:00 洗澡 → 19:10 吃饭 → 饭后自由 → 21:00 刷牙 → 21:10 念书/床上玩 → 21:30 关灯睡
 *
 * 最后一条「睡觉 21:30 → 次日 07:30」是跨夜节点，渲染在蓝色睡觉弧上。
 * ⚠️ 这是默认基线，家长可在面板按实际情况微调。
 */
export const defaultWeekdayConfig: TimelineConfig = {
  wakeTime: '07:30',
  sleepTime: '21:30',
  nodes: [
    { id: '1', activity: 'wake', startTime: '07:30', endTime: '08:00', required: true },
    { id: '2', activity: 'school', startTime: '08:00', endTime: '09:00', required: true },
    { id: '3', activity: 'kindergarten', startTime: '09:00', endTime: '12:00', required: true },
    { id: '4', activity: 'nap', startTime: '12:00', endTime: '15:00', required: true },
    { id: '5', activity: 'snack', startTime: '15:00', endTime: '17:00', required: false },
    { id: '6', activity: 'grandma', startTime: '17:00', endTime: '17:30', required: true },
    { id: '7', activity: 'play', startTime: '17:30', endTime: '19:00', required: false },
    { id: '8', activity: 'bath', startTime: '19:00', endTime: '19:10', required: true },
    { id: '9', activity: 'dinner', startTime: '19:10', endTime: '20:00', required: true },
    { id: '10', activity: 'play', startTime: '20:00', endTime: '21:00', required: false },
    { id: '11', activity: 'teeth', startTime: '21:00', endTime: '21:10', required: true },
    { id: '12', activity: 'reading', startTime: '21:10', endTime: '21:30', required: false },
    { id: '13', activity: 'sleep', startTime: '21:30', endTime: '07:30', required: true }
  ],
  updatedAt: Date.now()
};

/**
 * 周末默认作息 —— 无幼儿园、无强制午睡，晚起、白天自由玩，晚间同工作日
 * （用户未提供周末细节，按合理默认建；家长可在面板调整）
 */
export const defaultWeekendConfig: TimelineConfig = {
  wakeTime: '08:30',
  sleepTime: '21:30',
  nodes: [
    { id: '1', activity: 'wake', startTime: '08:30', endTime: '09:00', required: true },
    { id: '2', activity: 'breakfast', startTime: '09:00', endTime: '09:30', required: true },
    { id: '3', activity: 'play', startTime: '09:30', endTime: '12:00', required: false },
    { id: '4', activity: 'lunch', startTime: '12:00', endTime: '13:00', required: true },
    { id: '5', activity: 'nap', startTime: '13:00', endTime: '15:00', required: true },
    { id: '6', activity: 'play', startTime: '15:00', endTime: '19:00', required: false },
    { id: '7', activity: 'bath', startTime: '19:00', endTime: '19:10', required: true },
    { id: '8', activity: 'dinner', startTime: '19:10', endTime: '20:00', required: true },
    { id: '9', activity: 'play', startTime: '20:00', endTime: '21:00', required: false },
    { id: '10', activity: 'teeth', startTime: '21:00', endTime: '21:10', required: true },
    { id: '11', activity: 'reading', startTime: '21:10', endTime: '21:30', required: false },
    { id: '12', activity: 'sleep', startTime: '21:30', endTime: '08:30', required: true }
  ],
  updatedAt: Date.now()
};

/** 兼容旧引用：默认展示用工作日配置 */
export const defaultTimelineConfig = defaultWeekdayConfig;
