import { chromium } from 'playwright-core';
import { resolveChromePath } from './browser.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const CHROME = resolveChromePath();
const results = [];
function ok(name, cond, detail = '') {
  results.push([cond ? 'PASS' : 'FAIL', name, cond ? '' : detail]);
}

const browser = await chromium.launch({ executablePath: CHROME || undefined, headless: true });

async function newCtx() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}

const snap = (page) => page.locator('.node-row').evaluateAll((rows) =>
  rows.map((r) => ({
    n: r.querySelector('.name-input')?.value || r.querySelector('.name-input')?.placeholder,
    s: r.querySelector('input[type=time]')?.value,
    e: r.querySelectorAll('input[type=time]')[1]?.value
  })));

// ===== 1. 直开 #/ 首屏：7 节点模板，且能生成 =====
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const rows = await snap(page);
  ok('1a 直开 #/ 首屏是 7 节点（不再是 13）', rows.length === 7, 'rows=' + rows.length);
  ok('1b 首屏预填 3 岁模板（07:30 起床）', rows[0]?.n === '起床' && rows[0]?.s === '07:30', JSON.stringify(rows[0]));

  // 改时间 → 生成应成功并带上新时间
  const startInput = page.locator('.node-row').first().locator('input[type=time]').first();
  await startInput.fill('06:45');
  await startInput.blur();
  await page.waitForTimeout(300);
  const after = await snap(page);
  // 起床 07:30-08:00 是 30 分钟 → 06:45 开始应保留时长到 07:15
  ok('1c 改开始时间立即生效（06:45，时长 30 分不变）', after[0].s === '06:45' && after[0].e === '07:15', JSON.stringify(after[0]));

  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(600);
  const hash = await page.evaluate(() => decodeURIComponent(location.hash));
  ok('1d 生成成功跳 #/view?c=', hash.startsWith('#/view?c=v1.'), 'hash=' + hash.slice(0, 50));
  ok('1e URL 里带着改过的时间（s=405 即 06:45）', hash.includes('_405_'), hash.slice(0, 120));
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('1f localStorage 落盘含 06:45', cfg?.a?.[0]?.s === 405, JSON.stringify(cfg?.a?.[0]));
  await ctx.close();
}

// ===== 2. 拖拽：图标+名称换位，时间留在原行 =====
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const before = await snap(page);
  console.log('拖前:', JSON.stringify(before.map(x => `${x.n} ${x.s}-${x.e}`)));

  // 拖第 1 行（起床 07:30-08:00）向下 1 格
  const handle = page.locator('.node-row').first().locator('.drag-handle');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 45, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await snap(page);
  console.log('拖后:', JSON.stringify(after.map(x => `${x.n} ${x.s}-${x.e}`)));

  ok('2a 图标/名称换了位置', after[0].n === before[1].n && after[1].n === before[0].n,
    `before=${before[0].n},${before[1].n} after=${after[0].n},${after[1].n}`);
  ok('2b 时间留在原行（两行起止都没动）',
    after[0].s === before[0].s && after[0].e === before[0].e && after[1].s === before[1].s && after[1].e === before[1].e,
    `before=${before[0].s}-${before[0].e},${before[1].s}-${before[1].e} after=${after[0].s}-${after[0].e},${after[1].s}-${after[1].e}`);
  ok('2c 其余行未受影响', JSON.stringify(after.slice(2)) === JSON.stringify(before.slice(2)));

  // 拖完仍可生成（换位后的活动挂到对应时段）
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(500);
  const hash = await page.evaluate(() => location.hash);
  ok('2d 拖拽后生成成功', hash.startsWith('#/view?c=v1.'), hash.slice(0, 40));
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('2e 落盘顺序：第 1 条是原第 2 个活动且时间 450（07:30）',
    cfg?.a?.[0]?.s === 450 && cfg?.a?.[0]?.i === 'meal', JSON.stringify(cfg?.a?.slice(0, 2)));
  await ctx.close();
}

// ===== 3. 没点生成就改时间 → 刷新/后退不丢 =====
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const startInput = page.locator('.node-row').nth(1).locator('input[type=time]').first();
  await startInput.fill('07:15');
  await startInput.blur();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const after = await snap(page);
  // 早餐改成 07:15 后比起床(07:30)更早，hydrate 会按开始时间重排 → 按名字找
  const bfast = after.find((x) => x.n === '早餐');
  ok('3a 改了时间没生成，刷新后仍在（07:15）', bfast?.s === '07:15', JSON.stringify(after.slice(0, 2)));
  const stored3 = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('3b 未点生成但已落盘（persist-on-edit）', !!stored3, 'stored=' + stored3);
  await ctx.close();
}

// ===== 4. 清存储直开 #/view → 落设置页，兜底模板不落盘 =====
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/view', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const hash = await page.evaluate(() => location.hash);
  ok('4a 清存储直开 #/view → 落 #/', hash === '#/', hash);
  const rows = await snap(page);
  ok('4b 落回设置页也是 7 节点模板', rows.length === 7, 'rows=' + rows.length);
  const stored = await page.evaluate(() => localStorage.getItem('ticktots.config'));
  ok('4c 兜底模板未写 localStorage', stored === null, 'stored=' + stored);
  await ctx.close();
}

// ===== 5. 生成 → 齿轮回设置改时间 → 生成，第二轮时间生效 =====
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(500);
  await page.locator('button').filter({ hasText: '⚙' }).first().click();
  await page.waitForTimeout(400);
  const inp = page.locator('.node-row').first().locator('input[type=time]').first();
  await inp.fill('07:15');
  await inp.blur();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(500);
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('5a 第二轮改时间后生成仍生效（07:15）', cfg?.a?.[0]?.s === 435, JSON.stringify(cfg?.a?.[0]));
  const hash = await page.evaluate(() => decodeURIComponent(location.hash));
  ok('5b URL 同步为 07:15', hash.includes('_435_'), hash.slice(0, 100));
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
