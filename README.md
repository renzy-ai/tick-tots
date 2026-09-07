# 🕐 嘀嗒童行 (TickTots) · 儿童时间陪伴时钟

> 为 2–5 岁孩子设计的「时间可视化挂钟」——让孩子不靠识字，也能看懂「现在该干嘛、还要等多久」。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Svelte](https://img.shields.io/badge/Built%20with-Svelte-ff3e00?logo=svelte&logoColor=white)](https://svelte.dev)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5a0fc8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Node](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

底座基于 [Tot Clock](https://github.com/basnijholt/tot-clock)（MIT）改造为挂钟模型。

---

## ✨ 功能亮点

- **线性时间轴**：黄色直条 = 白天，蓝色弧线 = 睡觉（跨夜闭环）
- **图标节点**：每个活动一个节点（emoji + 颜色），不依赖识字
- **三态渲染**：已过去（灰）/ 当前（高亮放大）/ 未来（原色）
- **自适应精度**：最后 10 分钟大字红橙脉冲提示
- **家长面板**：长按左上角 2 秒进入，可改作息、拖拽排序
- **蜂鸣提醒**：「嘀-嘀-嘀」三短音，可关
- **多设备同步**：局域网内手机改配置，平板实时同步

## 📸 截图

### 🌙 夜间模式（21:30–07:30 自动切换）

![夜间星空：月亮柔光晕 + 两侧繁星 + 划过夜空的流星](docs/screenshots/night-sky.png)

> 睡觉时段主屏自动切到深色夜空：🌙 居中带柔和光晕，左右两侧空白区铺满轻闪烁的星星，不时划过流星。
> `prefers-reduced-motion` 下流星和闪烁会自动关闭。

### ☀️ 白天主界面

![白天主界面：当前活动大图标 + 剩余时间 + 线性时间轴](docs/screenshots/main-day.png)

> 当前活动用大 emoji + 中文名展示，节点按"已过去 / 进行中 / 未来"三态渲染，时间轴显示全天安排。

### ⚙️ 家长面板

长按主屏左上角 2 秒进入，所有可调项都在这里：

| ![](docs/screenshots/parent-schedule.png) | ![](docs/screenshots/parent-beep.png) |
|:---:|:---:|
| **作息编辑**：工作日 / 周末两套，拖拽排序节点 | **蜂鸣提醒 + 显示精度**：开关 / 提前时长 / 音量 / 重复 / 阈值 |

![时间轴比例调节 + 一天边界](docs/screenshots/parent-scale.png)

> **时间轴比例**：在「纯等比」与「最大化可读」间连续调节，下方实时预览当天时间轴的样子。

---

设计稿预览：`docs/design/01-主界面设计稿.html`、`docs/design/02-家长面板设计稿.html`

## 🚀 快速开始

### 开发模式

```bash
cd tick-tots
npm install
npm run server      # 终端 1：启动后端（端口 3010）
npm run dev         # 终端 2：启动前端（端口 5173，/api 自动代理到 3010）
```

访问 http://localhost:5173/

### 生产模式

```bash
npm run build       # 先构建
node server/index.js
```

访问 http://localhost:3010/

> ⚠️ 构建前请先停止正在运行的服务，否则 `dist/` 被占用会导致构建失败。

### 单元测试

```bash
npm test
```

## 📱 多设备使用

1. 电脑/平板启动服务（挂墙设备直接打开 http://localhost:3010/）
2. 手机连接同一局域网，访问 `http://<电脑IP>:3010/`
3. 手机长按左上角 2 秒进入家长面板，改作息 → 平板实时同步
4. 平板「添加到主屏幕」（PWA），即可挂墙常亮显示

查询电脑 IP：Windows 命令行执行 `ipconfig`，取「IPv4 地址」。

## 🛠 家长面板操作

| 操作 | 说明 |
|------|------|
| 打开 | 长按屏幕左上角 2 秒 |
| 拖拽排序 | 按住 ⠿ 上下拖动（交换两节点时间段） |
| 改时间 | 点时间框修改，自动吸附到整点/半点（±5 分钟） |
| 微调 | − / + 按钮，每次 1 分钟 |
| 必须/自由 | 点「必须/自由」切换（实线框 = 必须做，虚线框 = 自由） |
| 添加节点 | 底部选活动 → 点「+ 添加节点」 |
| 蜂鸣开关 | 「蜂鸣提醒」分组里开关 + 试听 |

## 📂 目录结构

```
src/
├── App.svelte                    # 主应用
├── main.ts                       # 入口
├── lib/
│   ├── activities.ts             # 活动定义（22 个 emoji + 配色）
│   ├── timeline.ts               # 挂钟模型（核心逻辑）
│   ├── timeline.test.ts          # 单元测试
│   ├── beeper.ts                 # 蜂鸣提醒
│   ├── stores/timer.ts           # 配置 store + 多设备同步
│   └── components/
│       ├── Timeline.svelte       # 线性时间轴视图
│       ├── Onboarding.svelte     # 首次引导
│       └── ParentPanel.svelte    # 家长面板
server/
└── index.js                      # Node 零依赖服务（API + SSE + 静态服务）
public/
├── manifest.json                 # PWA 配置
├── sw.js                         # Service Worker（离线缓存）
└── icon.svg                      # 图标
```

## 🤝 贡献指南

欢迎提 Issue 和 Pull Request！

1. Fork 本仓库并 `git clone` 到本地
2. 从 `main` 切出功能分支：`git checkout -b feature/你的功能`
3. 提交改动：`git commit -m "feat: 简述改动"`
4. 推送分支：`git push origin feature/你的功能`
5. 在 GitHub 发起 Pull Request 到 `main`，描述改动与测试情况
6. 评审通过后由维护者合并

> 提交信息建议遵循 [Conventional Commits](https://www.conventionalcommits.org/)（如 `feat:` / `fix:` / `docs:` / `chore:`）。

## 📋 已知限制

- Android Chrome 后台会节流定时器，但挂墙场景页面始终前台，影响不大
- iOS 需手动「添加到主屏幕」，Android 自动提示
- 时间轴基于设备本地时间，时区变化后自动重新计算
- 数据不出局域网，存于 `server/data/state.json`

## 📄 许可证

[MIT](LICENSE) © Renzy

---

## 👤 关于作者

我是 **Renzy**（AI 产品经理）· 公众号 **「PM 的 AI 进阶之路」**（微信搜 `renzy-ai`）。更多项目与 AI / 职场思考，见我的 [GitHub 主页](https://github.com/renzy-ai)。
