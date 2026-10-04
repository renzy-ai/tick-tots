/**
 * 本地埋点（《嘀嗒童行_MVP开发规格_v1.md》第 9 节）
 *
 * 只有三个事件：config_saved / display_opened / return_visit。
 * **全部只存本地 localStorage，不上传任何第三方**（隐私承诺：
 * 「所有数据只存在你自己的设备上，我们不收集任何信息。」）。
 * 这三个数用于页面上的自检（开发者模式可见）。
 */

const META_KEY = 'ticktots.meta';

export interface Meta {
  /** 首次访问日期 YYYY-MM-DD */
  first: string;
  /** 最近一次访问日期 */
  last: string;
  /** 是否已生成过时间轴（config_saved） */
  saved: boolean;
  /** 展示页打开次数（display_opened） */
  opens: number;
  /** 是否已触发过 return_visit（只记一次） */
  returned: boolean;
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function read(): Meta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return null;
    return {
      first: String(p.first ?? ''),
      last: String(p.last ?? ''),
      saved: Boolean(p.saved),
      opens: Number(p.opens) || 0,
      returned: Boolean(p.returned)
    };
  } catch {
    return null;
  }
}

function write(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* 存储不可用时静默跳过 */
  }
}

/** 读取当前埋点快照（DEV 自检块用） */
export function getMeta(): Meta {
  return (
    read() ?? {
      first: today(),
      last: today(),
      saved: false,
      opens: 0,
      returned: false
    }
  );
}

/** 事件一：config_saved —— 家长点「生成我家的时间轴」 */
export function trackConfigSaved(): void {
  const m = getMeta();
  m.saved = true;
  m.last = today();
  write(m);
}

/** 事件二：display_opened —— 展示页加载成功；同时判断是否构成 return_visit */
export function trackDisplayOpened(): void {
  const now = today();
  const m = read();
  if (!m || !m.first) {
    write({ first: now, last: now, saved: false, opens: 1, returned: false });
    return;
  }
  m.opens += 1;
  // 事件三：return_visit —— 本次打开距首次访问 ≥ 1 天，且只记一次
  if (!m.returned && now > m.first) {
    m.returned = true;
  }
  m.last = now;
  write(m);
}

/**
 * 生成「告诉作者我在用」的回传文本。
 * 复用已有的 ticktots.meta，不新增字段、不发任何网络请求。
 * 家长复制后自行粘贴到公众号会话发给作者。
 */
export function buildReportText(): string {
  const m = getMeta();
  const lines = [
    '嘀嗒童行 · 我家在用',
    `首次 ${m.first}`,
    `已保存配置 ${m.saved ? '✓' : '✗'}`,
    `打开 ${m.opens} 次`,
    `第二天回来过 ${m.returned ? '✓' : '✗'}`
  ];
  return lines.join(' ｜ ');
}
