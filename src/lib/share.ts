/**
 * 链接携带配置的编解码（《嘀嗒童行_MVP开发规格_v1.md》第 7.2 节）
 *
 * 格式：`v1.<昵称base64url>.<节点串>.<蜂鸣><周末标记>[.<a2节点串>]`
 * 节点串：每条 `i_s_e_m[_<显示名base64url>]`，条与条之间用 `-` 连接
 * （第 5 段可选，向后兼容文档 7.2 的 4 段形式）。
 *
 * ⚠️ 解析失败必须优雅降级：任何异常都返回 null，由调用方回退到
 * localStorage → 再没有 → 跳回设置页。**绝不允许白屏或报错页。**
 */

import type { Config, NodeType, RoutineNode } from './types';
import { isValidConfig } from './validate';

const NODE_RE = /^[a-z]+$/;

/**
 * 昵称 / 显示名 → URL 安全串
 *
 * 先 base64（避免中文在 URL 里出问题，不要省这一步），再把字母表里
 * 会撞上分隔符的 `+` `/` 映射成 `~` `*`（节点串用 `_`/`-` 分段，
 * base64url 常见的 `-`/`_` 替换会把节点切开）。
 */
function encodeName(n: string): string {
  try {
    return btoa(unescape(encodeURIComponent(n || '')))
      .replace(/=+$/, '')
      .replace(/\+/g, '~')
      .replace(/\//g, '*');
  } catch {
    return '';
  }
}

function decodeName(s: string): string {
  if (!s) return '';
  try {
    // 同时兼容本实现的 ~/* 与文档原示例的 base64url（-/_）两种字母表
    const b64 = s
      .replace(/~/g, '+')
      .replace(/\*/g, '/')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return '';
  }
}

/**
 * 节点数组 → 节点串
 *
 * 格式扩展（对文档 7.2 向后兼容）：`i_s_e_m` 或 `i_s_e_m_<昵称base64url>`。
 * 文档原文不带显示名，但模板里 `meal` 重复三次靠 `n`（早餐/午餐/晚餐）区分，
 * 丢名字会让分享出去的链接显示成三个「吃饭」，违反验收「配置完全一致」。
 * 仅在 `n` 非空时追加第 5 段，4 段旧串照常可解。
 */
function encodeNodes(nodes: RoutineNode[]): string {
  return nodes
    .map((x) => {
      const base = `${x.i}_${x.s}_${x.e}_${x.m}`;
      return x.n ? `${base}_${encodeName(x.n)}` : base;
    })
    .join('-');
}

/** 节点串 → 节点数组；任何不合规都返回 null */
function decodeNodes(s: string): RoutineNode[] | null {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length < 1) return null;
  const out: RoutineNode[] = [];
  for (const p of parts) {
    const f = p.split('_');
    if (f.length !== 4 && f.length !== 5) return null;
    const [i, sStr, eStr, mStr, nB64] = f;
    if (!NODE_RE.test(i)) return null;
    const sMin = Number(sStr);
    const eMin = Number(eStr);
    const m = Number(mStr);
    if (!Number.isInteger(sMin) || sMin < 0 || sMin > 1439) return null;
    if (!Number.isInteger(eMin) || eMin < 0 || eMin > 1439) return null;
    if (m !== 0 && m !== 1) return null;
    const name = f.length === 5 ? decodeName(nB64) : '';
    out.push({ i, n: name, s: sMin, e: eMin, m: m as NodeType });
  }
  return out;
}

/** Config → 编码串 */
export function encodeConfig(c: Config): string {
  const n = encodeName(c.n || '');
  const a = encodeNodes(c.a);
  const base = `v1.${n}.${a}.${c.b}${c.w}`;
  if (c.w === 1 && c.a2 && c.a2.length > 0) {
    return `${base}.${encodeNodes(c.a2)}`;
  }
  return base;
}

/**
 * 编码串 → Config；**全程 try/catch，任何解析失败返回 null**。
 * 显示名走节点串第 5 段（可选）；4 段旧串解出空名，展示层用 activity 默认名兜底。
 * 7 节点约 160–260 字符，微信转发不会被截断。
 */
export function decodeConfig(s: string): Config | null {
  try {
    if (!s || typeof s !== 'string') return null;
    const parts = s.split('.');
    // 段数：v1 + 昵称 + 节点串 + bw [+ a2] = 4 或 5
    if (parts.length !== 4 && parts.length !== 5) return null;
    const [ver, nameB64, nodesStr, bw, a2Str] = parts;
    if (ver !== 'v1') return null;
    if (!bw || bw.length !== 2) return null;
    const bChar = bw[0];
    const wChar = bw[1];
    if (bChar !== '0' && bChar !== '1') return null;
    if (wChar !== '0' && wChar !== '1') return null;
    const b = Number(bChar) as 0 | 1;
    const w = Number(wChar) as 0 | 1;

    const a = decodeNodes(nodesStr);
    if (!a || a.length < 1) return null;

    let a2: RoutineNode[] | undefined;
    if (w === 1) {
      if (parts.length === 5) {
        a2 = decodeNodes(a2Str);
        if (!a2 || a2.length < 1) return null;
      }
      // w=1 但无 a2 段：合法（调用方可回落到 a）
    } else if (parts.length === 5) {
      // w=0 却带了第 5 段：视为损坏，走降级
      return null;
    }

    const cfg: Config = {
      v: 1,
      n: decodeName(nameB64),
      a,
      b,
      w,
      ...(a2 ? { a2 } : {})
    };
    return isValidConfig(cfg) ? cfg : null;
  } catch {
    return null;
  }
}

/** 生成完整分享 URL（含 `#/view?c=...`） */
export function buildShareUrl(c: Config): string {
  const origin = typeof location !== 'undefined' ? location.origin + location.pathname : '';
  return `${origin}#/view?c=${encodeConfig(c)}`;
}

/** 从任意 hash / search 中提取 c 参数（hash 优先） */
export function extractParam(hash: string): string | null {
  try {
    const h = hash.replace(/^#/, '');
    const qi = h.indexOf('?');
    if (qi < 0) return null;
    const search = new URLSearchParams(h.slice(qi + 1));
    return search.get('c');
  } catch {
    return null;
  }
}
