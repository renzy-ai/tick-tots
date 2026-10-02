import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const NAMES = ['起床', '早餐', '幼儿园', '午餐', '午睡', '晚餐', '睡觉'];
const results = [];

function ok(name, cond, detail = '') {
  results.push([cond ? 'PASS' : 'FAIL', name, cond ? '' : detail]);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function newCtx() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  page.on('dialog', (d) => d.accept());
  return { ctx, page, reqs };
}

const cfgNames = (c) => JSON.stringify((c?.a || []).map((x) => x.n));

// ---------- 1. 清存储直开 #/view → 落设置页 ----------
{
  const { ctx, page, reqs } = await newCtx();
  await page.goto(BASE + '/#/view', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const hash = await page.evaluate(() => location.hash);
  ok('1 清存储直开 #/view → 落设置页', hash === '#/', 'hash=' + hash);
  const rows = await page.locator('.node-row').count();
  ok('2 首屏预填 3 岁模板 7 节点（非空白表单）', rows === 7, 'rows=' + rows);
  ok('3 设置页隐私声明可见', await page.getByText('所有数据只存在你自己的设备上').first().isVisible());
  let beepOff = true;
  for (const b of await page.locator('input[type=checkbox]').all()) {
    const label = await b.evaluate((el) => el.closest('label')?.textContent || '');
    if ((label.includes('蜂鸣') || label.includes('提醒')) && (await b.isChecked())) beepOff = false;
  }
  ok('4 蜂鸣默认关', beepOff);
  const stored = await page.evaluate(() => localStorage.getItem('ticktots.config'));
  ok('5 fallback 模板不写 localStorage（生成才算用过）', stored === null, 'stored=' + stored);
  const api = reqs.filter((u) => u.includes('/api/'));
  ok('6 无 /api/ 网络请求', api.length === 0, api.join(','));
  await ctx.close();
}

let shareUrl = '';

// ---------- 2. 模板 → 生成 → 分享 URL ----------
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const tpls = await page.locator('.tpl-btn').count();
  ok('7 三套模板按钮存在', tpls === 3, 'tpls=' + tpls);
  await page.locator('.tpl-btn').nth(1).click();
  await page.waitForTimeout(200);
  const rows4 = await page.locator('.node-row').count();
  ok('8 点 4 岁模板 → 7 节点', rows4 === 7, 'rows=' + rows4);
  await page.locator('input[placeholder="可以只写小名，也可以不填"]').fill('豆豆');
  const nameVals = await page.locator('.node-row .name-input').evaluateAll((els) => els.map((e) => e.value));
  ok('8b 模板节点显示名完整（早餐/午餐/晚餐区分）', JSON.stringify(nameVals) === JSON.stringify(NAMES), JSON.stringify(nameVals));
  await page.getByRole('button', { name: '生成我家的时间轴' }).click();
  await page.waitForTimeout(600);
  const hash = await page.evaluate(() => location.hash);
  ok('9 生成后跳 #/view?c=', hash.startsWith('#/view?c=v1.'), 'hash=' + hash.slice(0, 60));
  shareUrl = BASE + '/' + hash;
  const stored = await page.evaluate(() => localStorage.getItem('ticktots.config'));
  ok('10 生成后 localStorage 已落盘', !!stored && stored.includes('"v":1'));
  const shareFlag = await page.evaluate(() => sessionStorage.getItem('ticktots.share'));
  ok('11 分享按钮可见条件（会话标记）', shareFlag === '1');
  // 展示页大字显示「当前」节点自定义名（活动默认名是「学习」，模板自定义名是「幼儿园」）
  // 注意：断言不能钉死某个节点——当前时段会随真实时钟变化（落在空档时显示「自由时间」）。
  const body = await page.locator('body').innerText();
  ok('12 展示页用自定义名（非活动默认名）', NAMES.some((n) => body.includes(n)) && !body.includes('学习'), body.slice(0, 150).replace(/\n/g, ' | '));
  const cfgNow = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('13 配置含昵称+7 显示名（规格 §4.3 不要求展示页显示昵称）',
    cfgNow?.n === '豆豆' && cfgNames(cfgNow) === JSON.stringify(NAMES), cfgNames(cfgNow));
  await ctx.close();
}

// ---------- 3. URL 往返：新设备打开分享链接 ----------
{
  const { ctx, page, reqs } = await newCtx();
  await page.goto(shareUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const degraded = await page.getByText('链接配置无效').count();
  ok('14 分享链接打开无降级提示', degraded === 0, 'degraded=' + degraded);
  const body = await page.locator('body').innerText();
  const cfgNew = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('15 新设备配置一致（昵称）', cfgNew?.n === '豆豆', 'n=' + cfgNew?.n);
  ok('16 新设备配置一致（7 显示名）', cfgNames(cfgNew) === JSON.stringify(NAMES), cfgNames(cfgNew));
  ok('16b 展示页渲染本机配置的显示名', NAMES.some((n) => body.includes(n)), body.slice(0, 120).replace(/\n/g, ' | '));
  const rowsLocal = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('ticktots.config') || 'null');
    return c ? c.a.length : -1;
  });
  ok('17 URL 配置写入 localStorage', rowsLocal === 7, 'nodes=' + rowsLocal);
  const api = reqs.filter((u) => u.includes('/api/'));
  ok('18 展示页无 /api/ 请求', api.length === 0, api.join(','));
  await ctx.close();
}

// ---------- 4. 坏链 + 本地有配置 → 降级提示 ----------
{
  const { ctx, page } = await newCtx();
  await page.goto(shareUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.goto(BASE + '/#/view?c=v1.@@@broken@@@.xxx.10', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const body = await page.locator('body').innerText();
  ok('19 坏链+本地有配置 → 降级提示', body.includes('链接配置无效'), body.slice(0, 80).replace(/\n/g, ' | '));
  ok('20 降级后仍渲染本机配置', NAMES.some((n) => body.includes(n)), body.slice(0, 150).replace(/\n/g, ' | '));
  await ctx.close();
}

// ---------- 5. 坏链 + 本地无配置 → 落设置页 ----------
{
  const { ctx, page } = await newCtx();
  await page.goto(BASE + '/#/view?c=v1.@@@broken@@@.xxx.10', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const hash = await page.evaluate(() => location.hash);
  ok('21 坏链+本地无配置 → 落设置页', hash === '#/', 'hash=' + hash);
  await ctx.close();
}

// ---------- 6. 刷新持久化 ----------
{
  const { ctx, page } = await newCtx();
  await page.goto(shareUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const body = await page.locator('body').innerText();
  const cfgR = await page.evaluate(() => JSON.parse(localStorage.getItem('ticktots.config') || 'null'));
  ok('22 刷新后配置仍在', cfgR?.n === '豆豆' && NAMES.some((n) => body.includes(n)), 'n=' + cfgR?.n);
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
