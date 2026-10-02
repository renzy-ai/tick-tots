import os from 'node:os';
import { chromium } from 'playwright-core';
import { resolveChromePath } from './browser.mjs';

const CHROME = resolveChromePath();
const OUT = process.env.SHOT_DIR || os.tmpdir();
const results = [];
const ok = (name, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', name, cond ? '' : detail]);

async function pickBase(browser) {
  for (const port of [4173, 4176, 4174, 4175]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(`http://localhost:${port}/#/`, { waitUntil: 'domcontentloaded', timeout: 2500 });
      const hit = await page.getByRole('button', { name: '生成我家的时间轴' }).count();
      await ctx.close();
      if (hit) return `http://localhost:${port}`;
    } catch {
      await ctx.close();
    }
  }
  throw new Error('no preview server on 4173-4176');
}

const browser = await chromium.launch({ executablePath: CHROME || undefined, headless: true });
const BASE = await pickBase(browser);
console.log('BASE =', BASE);

// ================= Fix A：桌面时间轴两端不出屏 =================
for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const svg = document.querySelector('svg.timeline');
    const over = [];
    for (const el of svg.querySelectorAll('path, rect, circle, line, polygon, text, g')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < -0.5 || r.right > window.innerWidth + 0.5) {
        const cls = el.getAttribute('class') || el.tagName.toLowerCase();
        over.push(`${cls} L=${r.left.toFixed(1)} R=${r.right.toFixed(1)}`);
      }
    }
    const b = svg.getBoundingClientRect();
    return {
      over,
      inner: window.innerWidth,
      bbox: { l: b.left, r: b.right, w: b.width },
      scrollW: document.documentElement.scrollWidth
    };
  });
  ok(`A1 ${w}x${h} 时间轴元素全部收在屏内`, info.over.length === 0, info.over.join(' | ').slice(0, 300));
  ok(`A2 ${w}x${h} 无横向滚动条`, info.scrollW <= info.inner + 1, `scrollW=${info.scrollW} inner=${info.inner}`);
  ok(`A3 ${w}x${h} 时间轴仍铺满可用宽度`, info.bbox.w > info.inner * 0.9,
    `L=${info.bbox.l.toFixed(1)} R=${info.bbox.r.toFixed(1)} W=${info.bbox.w.toFixed(1)}`);
  if (w === 1920) await page.screenshot({ path: `${OUT}/fix2-desktop-view.png` });
  await ctx.close();
}

// ================= Fix B：设置页取消 / 保存 =================
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.accept(); });

  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const saveBtn = page.getByRole('button', { name: '保存', exact: true });
  const cancelBtn = page.getByRole('button', { name: '取消', exact: true });

  ok('B1 首次进入设置页有「保存」', (await saveBtn.count()) === 1);
  const sb = await saveBtn.boundingBox();
  ok('B2 「保存」停在视口内（不用翻到页底）', !!sb && sb.y >= 0 && sb.y + sb.height <= 900 && (await page.evaluate(() => window.scrollY)) === 0,
    sb ? `y=${sb.y.toFixed(0)} bottom=${(sb.y + sb.height).toFixed(0)}` : 'no box');
  ok('B3 首次进入没有「取消」（没有可回去的展示页）', (await cancelBtn.count()) === 0);
  ok('B4 「生成我家的时间轴」仍唯一', (await page.getByRole('button', { name: '生成我家的时间轴' }).count()) === 1);
  await page.screenshot({ path: `${OUT}/fix2-setup-first.png` });

  // 生成 → 展示页 → 齿轮回设置：取消出现
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(500);
  await page.locator('button.gear-btn').click();
  await page.waitForTimeout(400);
  ok('B5 从展示页进设置有「取消」', (await cancelBtn.count()) === 1);
  const cb = await cancelBtn.boundingBox();
  ok('B6 「取消」也停在视口内', !!cb && cb.y >= 0 && cb.y + cb.height <= 900,
    cb ? `y=${cb.y.toFixed(0)} bottom=${(cb.y + cb.height).toFixed(0)}` : 'no box');
  await page.screenshot({ path: `${OUT}/fix2-setup-return.png` });

  // 改动（昵称 + 首节点时间）后点取消 → 确认 → 回展示页，改动被回滚
  const before = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('ticktots.config'));
    return { n: c?.n, s: c?.a?.[0]?.s };
  });
  await page.locator('input[placeholder="可以只写小名，也可以不填"]').fill('ZZ-TEST');
  await page.locator('.node-row').first().locator('input[type=time]').first().fill('06:45');
  dialogs = 0;
  await cancelBtn.click();
  await page.waitForTimeout(600);
  const hash3 = await page.evaluate(() => location.hash);
  const after = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('ticktots.config'));
    return { n: c?.n, s: c?.a?.[0]?.s };
  });
  ok('B7 取消后回到展示页', hash3.startsWith('#/view'), 'hash=' + hash3);
  ok('B8 有改动时取消先弹确认', dialogs === 1, 'dialogs=' + dialogs);
  ok('B9 取消把昵称/时间改动都回滚掉', after.n === before.n && after.s === before.s,
    `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  const bodyText = await page.locator('body').innerText();
  ok('B10 展示页没显示被放弃的昵称', !bodyText.includes('ZZ-TEST'));

  // 无改动点取消 → 不弹框直接回
  await page.locator('button.gear-btn').click();
  await page.waitForTimeout(400);
  dialogs = 0;
  await cancelBtn.click();
  await page.waitForTimeout(500);
  ok('B11 无改动取消直接回展示页、不弹框',
    (await page.evaluate(() => location.hash)).startsWith('#/view') && dialogs === 0, 'dialogs=' + dialogs);

  // 保存：改动保留并回展示页
  await page.locator('button.gear-btn').click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder="可以只写小名，也可以不填"]').fill('豆豆-保存');
  dialogs = 0;
  await saveBtn.click();
  await page.waitForTimeout(500);
  const hash5 = await page.evaluate(() => location.hash);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config')));
  ok('B12 保存后回展示页', hash5.startsWith('#/view'), 'hash=' + hash5);
  ok('B13 保存把改动落盘', saved?.n === '豆豆-保存', 'n=' + saved?.n);
  ok('B14 保存不弹框、不丢改动', dialogs === 0, 'dialogs=' + dialogs);
  ok('B15 展示页正常出时间轴（没白屏）', (await page.locator('svg.timeline').count()) === 1);
  await page.locator('button.gear-btn').click();
  await page.waitForTimeout(400);
  const nickVal = await page.locator('input[placeholder="可以只写小名，也可以不填"]').inputValue();
  ok('B16 再进设置昵称仍是保存后的值', nickVal === '豆豆-保存', 'val=' + nickVal);

  await ctx.close();
}

await browser.close();
let fail = 0;
for (const [s, n, d] of results) {
  if (s === 'FAIL') fail++;
  console.log(`${s}  ${n}${d ? '  <- ' + d : ''}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
