// 解析本机可用的 Chrome / Chromium 可执行文件，供 playwright-core 启动。
// 背景：脚本原本硬编码 Windows 默认路径，mac / Linux 用户第一步就会卡住。
// 找得到就返回路径；找不到返回 null（调用方传 undefined，交给 playwright 用默认浏览器）。
// 环境变量 CHROME_PATH 优先级最高，用于强制指定（多版本共存或装在奇怪位置时）。

import fs from 'node:fs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  // Windows
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function resolveChromePath() {
  for (const p of CANDIDATES.filter(Boolean)) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      // 这个路径不存在，继续试下一个
    }
  }
  return null;
}
