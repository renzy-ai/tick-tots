/** 活动定义：图标 + 配色，用于时间轴节点渲染 */
export interface Activity {
  id: string;
  name: string;
  icon: string;
  color: string;
  colorLight: string;
  gradient: string;
}

// ====== 网页版 MVP 持久化 schema（《嘀嗒童行_MVP开发规格_v1.md》第 5 节） ======

export type ActivityKind =
  | 'wake'
  | 'meal'
  | 'play'
  | 'outdoor'
  | 'study'
  | 'nap'
  | 'bath'
  | 'story'
  | 'sleep'
  | 'snack'
  | 'screen'
  | 'other';

/** 0 = 自由（虚线）, 1 = 必须（实线） */
export type NodeType = 0 | 1;

export interface RoutineNode {
  /** activity id，对应 activities.ts 的 key */
  i: string;
  /** 显示名，如「起床」 */
  n: string;
  /** start，当天 0 点起算的分钟数（0-1439） */
  s: number;
  /** end，同上；睡眠节点允许跨夜（e < s 表示跨过 24:00） */
  e: number;
  m: NodeType;
}

export interface Config {
  /** schema 版本 */
  v: 1;
  /** 孩子昵称，可为空字符串（只存本地和 URL，不上传） */
  n: string;
  /** 节点数组，按时间顺序 */
  a: RoutineNode[];
  /** 蜂鸣开关 */
  b: 0 | 1;
  /** 是否启用周末作息（0 = 只有一套） */
  w: 0 | 1;
  /** 周末作息，w=1 时存在 */
  a2?: RoutineNode[];
}
