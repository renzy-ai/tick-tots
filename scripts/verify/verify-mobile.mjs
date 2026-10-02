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

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(700);
  return { ctx, page };
}

// ---------- 1. 手机横屏 844×390：比例 + 字号 ----------
{
  const { ctx, page } = await open({ width: 844, height: 390 });
  const rotated = await page.locator('main.app.rotated').count();
  ok('1a 横屏不该有内容横屏', rotated === 0);
  const pill = await page.locator('.rotate-pill').count();
  ok('1b 横屏不该有竖屏提示条', pill === 0);
  const sizeCls = await page.locator('svg.timeline').getAttribute('class');
  ok('1c 时间轴 md 字号档', (sizeCls || '').includes('size-md'), sizeCls || '');
  const box = await page.locator('svg.timeline').boundingBox();
  const appH = (await page.locator('main.app').boundingBox())?.height || 0;
  ok('1d 时间轴占高 ≥45%（比例向时间轴倾斜）', box && appH && box.height / appH >= 0.45,
    box ? `tl=${box.height.toFixed(0)} app=${appH.toFixed(0)} r=${(box.height / appH).toFixed(2)}` : 'no box');
  await page.screenshot({ path: `${OUT}/v2-phone-landscape.png` });
  await ctx.close();
}

// ---------- 2. 手机竖屏 390×844：sm 档 + 提示条 + 🔄 一键横屏 ----------
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  const sizeCls = await page.locator('svg.timeline').getAttribute('class');
  ok('2a 竖屏时间轴 sm 字号档', (sizeCls || '').includes('size-sm'), sizeCls || '');
  const pill = await page.locator('.rotate-pill');
  ok('2b 竖屏出一次性提示条', (await pill.count()) === 1 && (await pill.innerText()).includes('自动旋转'));
  await page.screenshot({ path: `${OUT}/v2-phone-portrait.png` });

  // 点 🔄 → 内容横屏（微信/iOS 也走这条路）
  const rotateBtn = page.locator('button.view-btn', { hasText: '🔄' });
  ok('2c 有「直接横屏」按钮', (await rotateBtn.count()) === 1);
  await rotateBtn.click();
  await page.waitForTimeout(300);
  ok('2d 点击后内容横屏 class', (await page.locator('main.app.rotated').count()) === 1);
  const size2 = await page.locator('svg.timeline').getAttribute('class');
  ok('2e 内容横屏后按 md 档渲染', (size2 || '').includes('size-md'), size2 || '');
  await page.screenshot({ path: `${OUT}/v2-phone-content-rotated.png` });

  // ↩ 还原
  await page.locator('button.view-btn', { hasText: '↩' }).click();
  await page.waitForTimeout(250);
  ok('2f 还原后 class 移除', (await page.locator('main.app.rotated').count()) === 0);
  await ctx.close();
}

// ---------- 3. 平板 1180×820：保持 lg 原观感 ----------
{
  const { ctx, page } = await open({ width: 1180, height: 820 });
  const sizeCls = await page.locator('svg.timeline').getAttribute('class');
  ok('3a 平板是 lg 档（class 无 size-md/sm）', !(sizeCls || '').includes('size-'), sizeCls || '');
  ok('3b 平板无提示条/内容横屏', (await page.locator('.rotate-pill').count()) === 0 && (await page.locator('main.app.rotated').count()) === 0);
  await page.screenshot({ path: `${OUT}/v2-tablet-landscape.png` });
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
