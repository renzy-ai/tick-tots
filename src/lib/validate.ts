/**
 * Config 结构校验（导入 JSON / URL 解码共用）
 * 任何不合规都返回 false，绝不抛异常。
 */

import type { Config, RoutineNode } from './types';

const ID_RE = /^[a-z]+$/;

export function isValidNode(x: unknown): x is RoutineNode {
  if (!x || typeof x !== 'object') return false;
  const n = x as Record<string, unknown>;
  if (typeof n.i !== 'string' || !ID_RE.test(n.i)) return false;
  if (typeof n.n !== 'string') return false;
  if (!Number.isInteger(n.s) || (n.s as number) < 0 || (n.s as number) > 1439) return false;
  if (!Number.isInteger(n.e) || (n.e as number) < 0 || (n.e as number) > 1439) return false;
  if (n.m !== 0 && n.m !== 1) return false;
  return true;
}

export function isValidConfig(x: unknown): x is Config {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  if (c.v !== 1) return false;
  if (typeof c.n !== 'string') return false;
  if (!Array.isArray(c.a) || c.a.length < 1 || c.a.length > 10) return false;
  if (!c.a.every(isValidNode)) return false;
  if (c.b !== 0 && c.b !== 1) return false;
  if (c.w !== 0 && c.w !== 1) return false;
  if (c.a2 !== undefined) {
    if (!Array.isArray(c.a2) || c.a2.length < 1 || c.a2.length > 10) return false;
    if (!c.a2.every(isValidNode)) return false;
  }
  return true;
}
