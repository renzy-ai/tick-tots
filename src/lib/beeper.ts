/**
 * 蜂鸣提醒（Web Audio API）
 *
 * 用振荡器合成"嘀-嘀-嘀"三短音，不依赖音频文件、不需要 TTS。
 * 注意：浏览器策略要求先有用户交互才能出声，所以首次交互时必须调用 unlockAudio()。
 */

import { timeToMinutes, type TimelineNode } from './timeline';

let audioContext: AudioContext | null = null;
let unlocked = false;

/** 获取（或惰性创建）AudioContext */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

/**
 * 解锁音频：必须在真实用户交互（点击/触摸）中调用一次，
 * 否则浏览器会阻止后续播放。
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // 播放一个 0 音量的短音，完成 AudioContext 的"激活"
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    unlocked = true;
  } catch {
    /* 解锁失败不影响主流程 */
  }
}

/** 播放单次蜂鸣 */
export function beep(frequency = 880, duration = 0.12, volume = 0.28): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = frequency;

  // 淡入淡出，避免爆音
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration + 0.02);
}

/** "嘀-嘀-嘀" 三短音，可整体重复 repeat 遍（遍间留白） */
export function beepTriple(gap = 170, duration = 0.35, volume = 0.5, repeat = 1): void {
  const durMs = Math.round(duration * 1000);
  const cycle = gap * 2 + durMs + 200; // 末声终点 + 遍间留白，避免相邻两遍重叠
  for (let i = 0; i < repeat; i++) {
    const base = cycle * i;
    setTimeout(() => beep(880, duration, volume), base);
    setTimeout(() => beep(880, duration, volume), base + gap);
    setTimeout(() => beep(880, duration, volume), base + gap * 2);
  }
}

/** 结束提醒：音调先高后低，区别于开始提醒；可整体重复 repeat 遍 */
export function beepWrapUp(duration1 = 0.35, duration2 = 0.45, volume = 0.5, repeat = 1): void {
  const d2Ms = Math.round(duration2 * 1000);
  const cycle = 150 + d2Ms + 200;
  for (let i = 0; i < repeat; i++) {
    const base = cycle * i;
    setTimeout(() => beep(988, duration1, volume), base);
    setTimeout(() => beep(784, duration2, volume), base + 150);
  }
}

// ====== 提醒调度 ======

/** 已触发过的提醒，key 形如 "2026-8-28|<nodeId>|start" */
const firedKeys = new Set<string>();

/** 当天日期前缀，用于跨天自动失效 */
function todayPrefix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 集合过大时清理，避免长期运行内存增长 */
function pruneFiredKeys(): void {
  if (firedKeys.size > 500) firedKeys.clear();
}

function fire(key: string, action: () => void): boolean {
  const full = `${todayPrefix()}|${key}`;
  if (firedKeys.has(full)) return false;
  firedKeys.add(full);
  action();
  return true;
}

/**
 * 检查并触发提醒。每秒调用一次，内部做去重。
 *
 * 触发时机：
 * 1. 新节点开始 → 三短音
 * 2. 当前节点剩余时间首次进入提前提醒窗口 → 收尾音
 *
 * @param node 当前节点
 * @param remainingSeconds 当前节点剩余秒数
 * @param leadMinutes 提前提醒分钟数
 * @param enabled 蜂鸣总开关
 * @param beepRepeat 整段提醒循环遍数（1~5）
 */
export function checkReminders(
  node: TimelineNode | null,
  remainingSeconds: number,
  leadMinutes: number,
  enabled: boolean,
  beepVolume = 0.5,
  beepDuration = 0.35,
  beepRepeat = 2
): void {
  if (!enabled || !node) return;

  pruneFiredKeys();

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const startMins = timeToMinutes(node.startTime);

  // 1) 节点开始
  if (nowMins === startMins) {
    fire(`${node.id}|start`, () => beepTriple(170, beepDuration, beepVolume, beepRepeat));
    return;
  }

  // 2) 结束前提醒（剩余时间进入窗口且还没到 0）
  const threshold = leadMinutes * 60;
  if (remainingSeconds > 0 && remainingSeconds <= threshold) {
    fire(`${node.id}|lead`, () =>
      beepWrapUp(beepDuration, beepDuration + 0.1, beepVolume, beepRepeat)
    );
  }
}

/** 供家长面板试听 */
export function testBeep(volume = 0.5, duration = 0.35, repeat = 2): void {
  unlockAudio();
  beepTriple(170, duration, volume, repeat);
}
