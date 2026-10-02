# 交接说明 · 嘀嗒童行（tick-tots）

> 读者：接手本仓库的 agent。动手前先读完本文 + 第 2 节必读文档。
> 状态：网页版 MVP（方案 A · 零后端）已完成并通过全量回归，等真机验证 / 部署 / 后续反馈修复。
> 有与本文冲突的新指示时，**以需求方（仓库主人）的最新说法为准**。

## 1. 项目是什么

「嘀嗒童行」——学龄前儿童时间陪伴时钟：把孩子的一天画成一条时间轴，不识字的孩子也能看图标知道「现在该干嘛、接下来干嘛」。原型是自部署版（Node 服务端做配置持久化 + 多设备 SSE 同步，见 `server/`）。

本分支做的是**网页版 MVP（方案 A · 零后端）**：纯静态托管、扫码即用、不注册、不装 App。配置存 `localStorage` + 链接携带，**零网络请求**，30 天回答一个问题：「有没有家长真的会用」。不是做产品，是做验证——**超出这个目标的功能一律不加**。

## 2. 必读依据

| 文档 | 位置 | 说明 |
|------|------|------|
| 嘀嗒童行_MVP开发规格_v1.md | 仓库外，本机 `D:\renzhongyi\` 下 | **唯一执行依据**，第 3 节边界不可突破 |
| 需求规格 | `docs/需求规格-v4.md` | 产品需求来源（D1–D16；其中 D14 口令、D16 去重等**不在 MVP 范围**） |
| 交互与 UI 设计规范 | `docs/交互与UI设计规范.md`、`docs/交互设计-UI设计规范-v1.md` | 视觉 / 交互口径 |
| 开发启动说明 | `docs/开发启动说明.md` | 起步、目录约定 |

## 3. 怎么跑 / 怎么测

```bash
npm install
npm run dev        # 开发（Vite）
npm run build      # 构建 → dist/（纯静态产物，无后端）
npm run preview    # 本地预览（默认 4173，被占则顺延 4174+）
npm test           # vitest 单测（84 用例）
npx svelte-check --threshold error   # 类型检查（应 0 error）
```

回归脚本（`scripts/verify/`，playwright-core + 本机 Chrome，headless）：

```bash
npm i -D playwright-core    # 一次性；未进 package.json（刻意不动该文件）

node scripts/verify/smoke.mjs          # 24 项：首屏/模板/生成/分享链/坏链降级/隐私
node scripts/verify/verify-edit.mjs    # 18 项：改时间/拖拽排序/改完没生成也落盘
node scripts/verify/verify-layout.mjs  # 25 项：桌面时间轴不出屏 + 设置页取消/保存
node scripts/verify/verify-mobile.mjs  # 12 项：手机横竖屏字级/内容横屏兜底/平板
```

- `smoke.mjs` / `verify-edit.mjs` 默认连 `http://localhost:4173`（可用 `BASE_URL` 覆盖）；
  另两个脚本会自动探测 4173/4176/4174/4175。
- 可选环境变量：`CHROME_PATH`（Chrome 可执行文件）、`SHOT_DIR`（截图输出目录，默认系统临时目录）。
- 预览服务背景任务超时后进程可能仍在监听——脚本探测端口就是为了这个。

**改动后的最低验收口径**：四套脚本全绿 + `npm test` 全绿 + `svelte-check` 0 error。

## 4. 已完成（P0–P9）

- **纯静态改造**：`ticktots.config` / `ticktots.settings` / `ticktots.meta` 三个 localStorage key；URL 参数 `#/view?c=v1.…` 优先于本地；删掉全部服务端 / SSE 耦合
- **两页路由**：`#/` 设置页、`#/view[?c=…]` 展示页；坏链降级不白屏（本地有配置则降级提示，没有则回落设置页）
- **设置页**：昵称、三套模板（3/4/5 岁，首屏预填不空白）、节点编辑（增删改 / 拖拽排序 / ±5 分吸附）、周末双套折叠、蜂鸣开关（默认关）、导出导入 JSON、分享链接 + 二维码、**底部固定「取消 / 保存」操作条**
- **展示页**：时间轴三态（过去/当前/未来）、睡觉弧跨夜、夜间变色、全屏、Wake Lock、手机横竖屏字号分档、内容横屏兜底（微信 / iOS 旋转锁）、齿轮回设置
- **PWA**：manifest + Service Worker 离线可开（缓存策略：hash 资源 Cache First，index.html stale-while-revalidate）
- **隐私**：两页页底原文「所有数据只存在你自己的设备上，我们不收集任何信息。」无账号、无上报、无第三方统计

## 5. 你的任务（按优先级）

1. **接真机验证反馈并修复**：需求方会拿真机（iOS Safari / Android Chrome / 微信内置浏览器 / 平板横屏）过一遍，问题以中文反馈回来。流程：先复现 → 修 → 跑第 3 节全部回归 → 提交。真机验证清单见 MVP 规格第 11 节（本地可测项）与第 14 节（风险）。
2. **部署**：与需求方确认平台再动（方案里提过 WorkBuddy 发布或 EdgeOne）。产物就是 `dist/`，纯静态。**部署动作与凭证归需求方**；你能做的是把产物整理好、把步骤写清楚。
3. **README 体验链接回填**：部署后把体验链接写进 README 顶部「网页版」段。
4. **后续反馈逐条修**（本仓库近期就是在做这个：手机适配、时间轴出屏、设置页取消/保存……），每条都走复现 → 修 → 全量回归 → 提交。

## 6. 红线（逐条自查，违反任何一条都会出事）

- ❌ 删 `server/` 目录或其中任何文件——`main` 分支自部署版还在用，**合回 main 会炸**
- ❌ 在 `main` 上直接开发
- ❌ `git push --force`（禁止强推；冲突就合并或 rebase）
- ❌ 擅自 push / 部署——push 与部署由需求方决定，被明确授权时才做
- ❌ 新建仓库
- ❌ 修改 / 删除 LICENSE 原作者声明
- ❌ 把腾讯云 SecretId / SecretKey 交给执行 agent、写进仓库或日志
- ❌ 账号 / 登录 / 注册墙、后端 / 数据库 / 云服务、睡眠记录、AI 功能、多孩、统计看板、支付裂变
- ❌ 带录屏或行为追踪的统计工具（Clarity / 百度统计等）——隐私承诺在页面上写着「我们不收集任何信息」

## 7. 分支与提交约定

| 分支 | 含义 |
|------|------|
| `main` | 自部署版（含 `server/`），**不要在上面开发** |
| `web-mvp` | 网页版 MVP 的本地开发分支（P0–P9 都在这上面做的） |
| `dev` | 本交接分支：内容 = web-mvp + 本文 + 回归脚本，在这上面继续 |

提交信息可以用中文，**结尾必须带**：

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

## 8. 代码地图

| 位置 | 内容 |
|------|------|
| `src/lib/stores/timer.ts` | 全部状态与 localStorage 持久化。注意：`updateConfig` 在家长一动手改（改时间/拖拽/增删）就打开落盘——「取消」因此必须按快照回滚，不能只靠路由返回 |
| `src/lib/adapter.ts` | `RoutineNode`（0 点起算分钟）↔ `TimelineNode`（"HH:MM"）适配 |
| `src/lib/share.ts` / `src/lib/validate.ts` | URL 配置编解码 `v1.<昵称>.<节点串>.…`、配置校验 |
| `src/lib/templates.ts` | 3/4/5 岁三套模板 |
| `src/lib/components/Timeline.svelte` | 时间轴 SVG。viewBox 左右各留 12 单位（`VB_PAD`）——睡觉弧圆角会画出 0..1000，去掉留白会顶出屏幕 |
| `src/lib/components/Setup.svelte` | 设置页。进门快照（`ensureLocalInit` 之后拍）+ 底部固定取消/保存条；`生成我家的时间轴` 是冒烟脚本定位用的主按钮名，别改文案 |
| `src/App.svelte` | hash 路由 + 展示页（齿轮/全屏/分享/横竖屏兜底） |
| `server/` | **只保留、不合删**（main 分支的 Node 同步服务） |
| `scripts/verify/` | 四套回归脚本（见第 3 节） |
