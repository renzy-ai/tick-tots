# 滴答童行实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给学龄前儿童做一个直观的时间流逝可视化时钟，帮助理解"时间有限且在流逝"。

**Architecture:** 基于 Tot Clock 项目改造，保留其地基层（时间漂移补偿、持久化、防误触、Wake Lock、拖拽），核心视图从"顺序倒计时圆钟"重写为"挂钟锚点时间轴"。前端 Svelte 5 + Vite，后端零依赖 Node http + SSE，数据存本地 JSON 文件。

**Tech Stack:** Svelte 5, Vite, Node.js (零依赖), Web Audio API, localStorage, JSON 文件

---

## 前置条件

- [x] 需求规格 v3 已锁定（D1-D14 全部确认）
- [ ] 项目目录 `tick-tots` 已创建
- [ ] Node.js v22 可用
- [ ] Tot Clock 源码在 `D:\Tot Clock` 可供参考

---

## Task 1: 项目初始化与脚手架

**目标：** 搭建 Vite + Svelte 5 + TypeScript 基础项目，能跑起来显示"Hello World"

**Step 1.1: 创建 package.json**

```bash
cd "tick-tots"
```

创建 `package.json`：
```json
{
  "name": "kid-timeline-clock",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "svelte": "^5.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

**Step 1.2: 安装依赖**

```bash
npm install
```

Expected: 成功安装，无报错

**Step 1.3: 创建 Vite 配置**

创建 `vite.config.ts`：
```typescript
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
```

**Step 1.4: 创建 Svelte 配置**

创建 `svelte.config.js`：
```javascript
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess()
}
```

**Step 1.5: 创建 TypeScript 配置**

创建 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["svelte", "vite/client"]
  },
  "include": ["src/**/*", "svelte.config.js"]
}
```

**Step 1.6: 创建入口文件**

创建 `index.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>滴答童行</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

创建 `src/main.ts`：
```typescript
import App from './App.svelte'

const app = new App({
  target: document.getElementById('app')!
})

export default app
```

**Step 1.7: 创建最简单的 App 组件**

创建 `src/App.svelte`：
```svelte
<script lang="ts">
  let count = $state(0)
</script>

<h1>滴答童行</h1>
<button onclick={() => count++}>
  点击次数: {count}
</button>

<style>
  h1 {
    font-size: 3rem;
    text-align: center;
    margin-top: 2rem;
  }
  button {
    font-size: 1.5rem;
    padding: 1rem 2rem;
    margin-top: 2rem;
  }
</style>
```

**Step 1.8: 启动开发服务器**

```bash
npm run dev
```

Expected: 输出 `Local: http://localhost:5173/`

**Step 1.9: 验证**

打开浏览器访问 `http://localhost:5173/`，应看到"滴答童行"标题和按钮。

**Step 1.10: 提交**

```bash
git init
git add .
git commit -m "feat: 初始化 Vite + Svelte 5 + TypeScript 项目"
```

---

## Task 2: 创建零依赖 Node 服务端

**目标：** 实现配置持久化 + SSE 推送，前端能读写配置并实时同步

**Step 2.1: 创建服务端目录结构**

```bash
mkdir -p server
```

**Step 2.2: 实现 JSON 文件读写工具**

创建 `server/storage.ts`：
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = process.env.DATA_DIR || './data'
const CONFIG_FILE = join(DATA_DIR, 'config.json')

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

export function readConfig(): any {
  if (!existsSync(CONFIG_FILE)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  } catch (e) {
    console.error('Failed to read config:', e)
    return null
  }
}

export function writeConfig(data: any): boolean {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2))
    return true
  } catch (e) {
    console.error('Failed to write config:', e)
    return false
  }
}
```

**Step 2.3: 实现 SSE 连接管理**

创建 `server/sse.ts`：
```typescript
const clients: Set<import('http').ServerResponse> = new Set()

export function addSSEClient(res: import('http').ServerResponse) {
  clients.add(res)
  res.on('close', () => {
    clients.delete(res)
  })
}

export function broadcastConfigUpdate(config: any) {
  const data = JSON.stringify({ type: 'config', payload: config })
  clients.forEach(client => {
    client.write(`data: ${data}\n\n`)
  })
}
```

**Step 2.4: 实现口令验证**

创建 `server/auth.ts`：
```typescript
import { randomBytes } from 'crypto'

let currentToken = ''

export function generateToken(): string {
  return randomBytes(16).toString('hex')
}

export function verifyToken(token: string): boolean {
  return !currentToken || token === currentToken
}

export function setToken(token: string) {
  currentToken = token
}

export function getToken(): string {
  return currentToken
}
```

**Step 2.5: 实现 HTTP 服务**

创建 `server/index.ts`：
```typescript
import { createServer } from 'http'
import { readConfig, writeConfig } from './storage.js'
import { addSSEClient, broadcastConfigUpdate } from './sse.js'
import { verifyToken, setToken, getToken } from './auth.js'

const PORT = process.env.PORT || 3000

const server = createServer((req, res) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`)
  
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  // SSE 端点
  if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })
    
    // 发送当前配置
    const config = readConfig()
    if (config) {
      res.write(`data: ${JSON.stringify({ type: 'config', payload: config })}\n\n`)
    }
    
    addSSEClient(res)
    return
  }
  
  // 口令验证端点
  if (url.pathname === '/api/verify-token' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      const { token } = JSON.parse(body)
      const valid = verifyToken(token)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ valid, token: getToken() }))
    })
    return
  }
  
  // 设置口令端点
  if (url.pathname === '/api/set-token' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      const { token } = JSON.parse(body)
      setToken(token)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    })
    return
  }
  
  // 配置端点
  if (url.pathname === '/api/config') {
    if (req.method === 'GET') {
      const config = readConfig()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(config || {}))
      return
    }
    
    if (req.method === 'POST') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => {
        const config = JSON.parse(body)
        const success = writeConfig(config)
        if (success) {
          broadcastConfigUpdate(config)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success }))
      })
      return
    }
  }
  
  res.writeHead(404)
  res.end('Not Found')
})

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
```

**Step 2.6: 编译 TypeScript**

```bash
npx tsc --target ESNext --module NodeNext --moduleResolution NodeNext server/index.ts --outDir server
```

Expected: 生成 `server/index.js`

**Step 2.7: 启动服务端**

```bash
node server/index.js
```

Expected: 输出 `Server running at http://localhost:3000`

**Step 2.8: 测试配置 API**

```bash
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{"wakeTime":"07:30","sleepTime":"20:30","nodes":[]}'
```

Expected: `{"success":true}`

```bash
curl http://localhost:3000/api/config
```

Expected: 返回刚设置的配置

**Step 2.9: 提交**

```bash
git add server/
git commit -m "feat: 零依赖 Node 服务端 + SSE 同步"
```

---

## Task 3: 定义数据模型与类型

**目标：** 定义时间轴时钟的核心数据结构

**Step 3.1: 创建类型定义文件**

创建 `src/lib/types.ts`：
```typescript
export interface TimelineNode {
  id: string
  time: string          // "HH:MM" 格式，24小时制
  label: string         // 活动名称
  icon: string          // emoji
  color: string         // 颜色类别: 'meal' | 'sleep' | 'play' | 'hygiene' | 'study' | 'outside'
  required: boolean     // 是否必须做
  announce: boolean     // 是否播报提醒
}

export interface SleepBlock {
  startTime: string     // "HH:MM"
  endTime: string       // "HH:MM"
}

export interface TimelineConfig {
  wakeTime: string      // "HH:MM"
  sleepTime: string     // "HH:MM"
  nodes: TimelineNode[]
  password?: string     // 访问口令（可选）
}

export interface ReminderState {
  date: string          // YYYY-MM-DD
  triggered: Set<string> // `${nodeId}-${type}` type: 'pre' | 'main'
}

export interface DeviceSettings {
  soundEnabled: boolean
  tokenVerified?: boolean
}
```

**Step 3.2: 提交**

```bash
git add src/lib/types.ts
git commit -m "feat: 定义核心数据模型"
```

---

## Task 4: 实现时间计算核心逻辑

**目标：** 实现挂钟锚点模型，计算当前节点、剩余时间、三态

**Step 4.1: 创建时间工具函数**

创建 `src/lib/time.ts`：
```typescript
import type { TimelineNode, TimelineConfig } from './types'

/**
 * 将 "HH:MM" 转为"从 wakeTime 开始的分钟数"
 * 处理跨夜情况
 */
export function timeToMinutes(time: string, wakeTime: string): number {
  const [h, m] = time.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  
  const totalMin = h * 60 + m
  const wakeMin = wh * 60 + wm
  
  let diff = totalMin - wakeMin
  if (diff < 0) diff += 24 * 60 // 跨夜
  
  return diff
}

/**
 * 获取当前时间从 wakeTime 开始的分钟数
 */
export function getCurrentMinutes(wakeTime: string): number {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  return timeToMinutes(time, wakeTime)
}

/**
 * 计算两个时间点的分钟差（考虑跨夜）
 */
export function minutesBetween(from: string, to: string, wakeTime: string): number {
  const fromMin = timeToMinutes(from, wakeTime)
  const toMin = timeToMinutes(to, wakeTime)
  let diff = toMin - fromMin
  if (diff < 0) diff += 24 * 60
  return diff
}

/**
 * 格式化分钟数为 "X 小时 Y 分钟"
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${Math.floor(minutes)} 分钟`
  
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  
  if (mins === 0) return `${hours} 小时`
  return `${hours} 小时 ${mins} 分钟`
}

/**
 * 格式化分钟数为"还有最后 X 分钟"（用于 ≤10分钟时）
 */
export function formatRemainingMinutes(minutes: number): string {
  if (minutes <= 1) {
    const seconds = Math.floor(minutes * 60)
    return `还有最后 ${seconds} 秒`
  }
  return `还有最后 ${Math.ceil(minutes)} 分钟`
}
```

**Step 4.2: 创建时间轴状态管理**

创建 `src/lib/stores/timeline.ts`：
```typescript
import { writable, derived } from 'svelte/store'
import type { TimelineConfig, TimelineNode } from '../types'
import { getCurrentMinutes, minutesBetween, timeToMinutes } from '../time'

// 配置 store
export const config = writable<TimelineConfig>({
  wakeTime: '07:30',
  sleepTime: '20:30',
  nodes: [
    { id: '1', time: '07:30', label: '起床', icon: '🛏️', color: 'sleep', required: true, announce: true },
    { id: '2', time: '07:40', label: '洗手+早饭', icon: '🥣', color: 'meal', required: true, announce: true },
    { id: '3', time: '08:30', label: '妈妈送幼儿园', icon: '🎒', color: 'outside', required: true, announce: true },
    { id: '4', time: '09:00', label: '幼儿园', icon: '🏫', color: 'study', required: true, announce: false },
    { id: '5', time: '12:00', label: '午饭+午睡', icon: '😴', color: 'sleep', required: true, announce: true },
    { id: '6', time: '15:00', label: '吃点心+玩', icon: '🍎', color: 'meal', required: false, announce: false },
    { id: '7', time: '16:30', label: '放学·姥姥接', icon: '👵', color: 'outside', required: true, announce: true },
    { id: '8', time: '18:00', label: '吃晚饭', icon: '🍽️', color: 'meal', required: true, announce: true },
    { id: '9', time: '19:00', label: '自由时间', icon: '🧸', color: 'play', required: false, announce: false },
    { id: '10', time: '20:00', label: '刷牙→洗澡', icon: '🛁', color: 'hygiene', required: true, announce: true },
    { id: '11', time: '20:30', label: '睡觉', icon: '🌙', color: 'sleep', required: true, announce: true }
  ],
  password: ''
})

// 当前时间（每分钟更新）
export const currentTime = writable<number>(getCurrentMinutes('07:30'))

// 每分钟更新当前时间
export function startClock() {
  setInterval(() => {
    config.subscribe(c => {
      currentTime.set(getCurrentMinutes(c.wakeTime))
    })()
  }, 1000) // 每秒更新，保证秒级精度
}

// 当前节点
export const currentNode = derived([config, currentTime], ([$config, $current]) => {
  const nodes = $config.nodes.sort((a, b) => 
    timeToMinutes(a.time, $config.wakeTime) - timeToMinutes(b.time, $config.wakeTime)
  )
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const nextNode = nodes[i + 1] || { time: $config.sleepTime }
    
    const nodeStart = timeToMinutes(node.time, $config.wakeTime)
    const nodeEnd = timeToMinutes(nextNode.time, $config.wakeTime)
    
    if ($current >= nodeStart && $current < nodeEnd) {
      return { ...node, endTime: nextNode.time }
    }
  }
  
  return null
})

// 剩余时间（分钟）
export const remainingMinutes = derived([config, currentTime], ([$config, $current]) => {
  if (!$config.nodes.length) return 0
  
  const nextNode = $config.nodes
    .sort((a, b) => timeToMinutes(a.time, $config.wakeTime) - timeToMinutes(b.time, $config.wakeTime))
    .find(n => timeToMinutes(n.time, $config.wakeTime) > $current)
  
  if (!nextNode) {
    // 已到最后一个节点，计算到睡觉时间
    return minutesBetween(
      `${Math.floor($current / 60).toString().padStart(2, '0')}:${Math.floor($current % 60).toString().padStart(2, '0')}`,
      $config.sleepTime,
      $config.wakeTime
    )
  }
  
  return minutesBetween(
    `${Math.floor($current / 60).toString().padStart(2, '0')}:${Math.floor($current % 60).toString().padStart(2, '0')}`,
    nextNode.time,
    $config.wakeTime
  )
})

// 节点状态（过去/现在/未来）
export function getNodeState(node: TimelineNode, currentMin: number, wakeTime: string): 'past' | 'current' | 'future' {
  const nodeMin = timeToMinutes(node.time, wakeTime)
  const diff = nodeMin - currentMin
  
  if (diff < -1) return 'past' // 过去超过 1 分钟
  if (diff > 1) return 'future' // 未来超过 1 分钟
  return 'current' // 当前节点（±1 分钟内）
}
```

**Step 4.3: 提交**

```bash
git add src/lib/time.ts src/lib/stores/timeline.ts
git commit -m "feat: 实现时间计算核心逻辑"
```

---

## Task 5: 实现时间轴视图组件

**目标：** 渲染直条 + 睡觉弧 + 游标 + 三态

**Step 5.1: 创建时间轴组件**

创建 `src/lib/components/Timeline.svelte`：
```svelte
<script lang="ts">
  import { config, currentTime, currentNode, remainingMinutes, getNodeState } from '../stores/timeline'
  import { timeToMinutes, formatMinutes, formatRemainingMinutes } from '../time'
  import type { TimelineNode } from '../types'
  
  let nodes = $derived($config.nodes.sort((a, b) => 
    timeToMinutes(a.time, $config.wakeTime) - timeToMinutes(b.time, $config.wakeTime)
  ))
  
  // 计算格子宽度（按真实时长等比）
  let nodeWidths = $derived(nodes.map((node, i) => {
    const nextNode = nodes[i + 1] || { time: $config.sleepTime }
    const duration = timeToMinutes(nextNode.time, $config.wakeTime) - timeToMinutes(node.time, $config.wakeTime)
    return Math.max(duration, 15) // 最小 15 分钟
  }))
  
  let totalMinutes = $derived(nodeWidths.reduce((a, b) => a + b, 0))
  
  // 游标位置（百分比）
  let cursorPosition = $derived(($current / totalMinutes) * 100)
  
  // 格式化剩余时间（自适应精度）
  function formatRemaining(minutes: number): string {
    if (minutes > 120) return `还有 ${formatMinutes(minutes)}`
    if (minutes > 30) return `还有 ${formatMinutes(minutes)}`
    if (minutes > 10) return `还有 ${formatMinutes(minutes)}`
    return formatRemainingMinutes(minutes)
  }
</script>

<div class="timeline-container">
  <!-- 剩余时间显示 -->
  <div class="remaining" class:pulse={$remainingMinutes <= 10} class:urgent={$remainingMinutes <= 5}>
    {formatRemaining($remainingMinutes)}
  </div>
  
  <!-- 直条时间轴 -->
  <div class="bar">
    {#each nodes as node, i (node.id)}
      {@const state = getNodeState(node, $current, $config.wakeTime)}
      {@const width = (nodeWidths[i] / totalMinutes) * 100}
      <div 
        class="node"
        class:required={node.required}
        class:free={!node.required}
        class:past={state === 'past'}
        class:current={state === 'current'}
        class:future={state === 'future'}
        style="flex: {nodeWidths[i]}; background: var(--color-{node.color})"
      >
        <div class="icon">{node.icon}</div>
        <div class="time">{node.time}</div>
      </div>
    {/each}
    
    <!-- 游标 -->
    <div class="cursor" style="left: {cursorPosition}%"></div>
  </div>
  
  <!-- 睡觉弧 -->
  <div class="arc">
    <svg viewBox="0 0 100 20" preserveAspectRatio="none">
      <path d="M 0 0 Q 50 20, 100 0" fill="none" stroke="var(--color-sleep)" stroke-width="2"/>
    </svg>
    <div class="arc-label">
      睡觉时间: {$config.sleepTime} → {$config.wakeTime}
    </div>
  </div>
</div>

<style>
  .timeline-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
  }
  
  .remaining {
    font-size: 2rem;
    text-align: center;
    font-weight: bold;
    transition: all 0.3s;
  }
  
  .remaining.pulse {
    font-size: 2.4rem;
    animation: pulse 1s ease-in-out infinite;
  }
  
  .remaining.urgent {
    font-size: 3rem;
    color: #ef4444;
    animation: pulse 0.5s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  
  .bar {
    display: flex;
    height: 80px;
    position: relative;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .node {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    transition: all 0.3s;
  }
  
  .node.required {
    border: 3px solid rgba(0,0,0,0.3);
  }
  
  .node.free {
    border: 2px dashed rgba(0,0,0,0.3);
  }
  
  .node.past {
    opacity: 0.4;
    filter: grayscale(0.8);
  }
  
  .node.current {
    border: 3px solid #fff;
    box-shadow: 0 0 10px rgba(255,255,255,0.5);
    animation: breathe 2s ease-in-out infinite;
  }
  
  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }
  
  .node.future {
    opacity: 1;
  }
  
  .icon {
    font-size: 2rem;
  }
  
  .time {
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  
  .cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    background: #000;
    transform: translateX(-50%);
    pointer-events: none;
  }
  
  .arc {
    position: relative;
    height: 60px;
  }
  
  .arc svg {
    width: 100%;
    height: 100%;
  }
  
  .arc-label {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1rem;
    color: var(--color-sleep);
  }
  
  :root {
    --color-meal: #F59E0B;
    --color-sleep: #3B82F6;
    --color-play: #22C55E;
    --color-hygiene: #14B8A6;
    --color-study: #A855F7;
    --color-outside: #0EA5E9;
  }
</style>
```

**Step 5.2: 更新 App.svelte**

修改 `src/App.svelte`：
```svelte
<script lang="ts">
  import Timeline from './lib/components/Timeline.svelte'
  import { startClock } from './lib/stores/timeline'
  
  // 启动时钟
  startClock()
</script>

<div class="app">
  <Timeline />
</div>

<style>
  .app {
    min-height: 100vh;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  }
</style>
```

**Step 5.3: 启动开发服务器**

```bash
npm run dev
```

Expected: 输出 `Local: http://localhost:5173/`

**Step 5.4: 验证**

打开浏览器访问 `http://localhost:5173/`，应看到：
- 顶部显示"还有 X 小时/分钟"
- 中间是彩色格子直条，每个格子有图标和时间
- 黑色游标线显示当前时间位置
- 底部蓝色弧线显示睡觉时间

**Step 5.5: 提交**

```bash
git add src/
git commit -m "feat: 实现时间轴视图组件"
```

---

## Task 6: 实现家长面板

**目标：** 长按左上角 2 秒进入面板，可编辑起床/睡觉时间、增删改节点

**Step 6.1: 创建家长面板组件**

创建 `src/lib/components/ParentPanel.svelte`：
```svelte
<script lang="ts">
  import { config } from '../stores/timeline'
  import { broadcastConfig } from '../sync'
  import type { TimelineNode } from '../types'
  
  let showPanel = $state(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  
  function startLongPress() {
    longPressTimer = setTimeout(() => {
      showPanel = true
      if (navigator.vibrate) navigator.vibrate(50)
    }, 2000)
  }
  
  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }
  
  function addNode() {
    const newNode: TimelineNode = {
      id: Date.now().toString(),
      time: '12:00',
      label: '新活动',
      icon: '🎯',
      color: 'play',
      required: false,
      announce: false
    }
    $config.nodes.push(newNode)
    saveConfig()
  }
  
  function deleteNode(id: string) {
    $config.nodes = $config.nodes.filter(n => n.id !== id)
    saveConfig()
  }
  
  function saveConfig() {
    config.set($config)
    broadcastConfig($config)
  }
</script>

<!-- 长按触发区域 -->
<div 
  class="long-press-trigger"
  onmousedown={startLongPress}
  onmouseup={cancelLongPress}
  onmouseleave={cancelLongPress}
  ontouchstart={startLongPress}
  ontouchend={cancelLongPress}
>
  ⚙️
</div>

{#if showPanel}
  <div class="overlay" onclick={() => showPanel = false}>
    <div class="panel" onclick|stopPropagation>
      <h2>家长面板</h2>
      
      <!-- 起床/睡觉时间 -->
      <div class="section">
        <label>起床时间</label>
        <input type="time" bind:value={$config.wakeTime} onchange={saveConfig} />
      </div>
      <div class="section">
        <label>睡觉时间</label>
        <input type="time" bind:value={$config.sleepTime} onchange={saveConfig} />
      </div>
      
      <!-- 节点列表 -->
      <div class="section">
        <h3>活动节点</h3>
        {#each $config.nodes as node, i (node.id)}
          <div class="node-editor">
            <input type="time" bind:value={node.time} onchange={saveConfig} />
            <input type="text" bind:value={node.label} onchange={saveConfig} />
            <input type="text" bind:value={node.icon} onchange={saveConfig} maxlength="2" />
            <select bind:value={node.color} onchange={saveConfig}>
              <option value="meal">进食</option>
              <option value="sleep">睡眠</option>
              <option value="play">玩耍</option>
              <option value="hygiene">卫生</option>
              <option value="study">学习</option>
              <option value="outside">外出</option>
            </select>
            <label>
              <input type="checkbox" bind:checked={node.required} onchange={saveConfig} />
              必须做
            </label>
            <label>
              <input type="checkbox" bind:checked={node.announce} onchange={saveConfig} />
              提醒
            </label>
            <button onclick={() => deleteNode(node.id)}>删除</button>
          </div>
        {/each}
        
        <button class="add-btn" onclick={addNode}>+ 新增节点</button>
      </div>
      
      <button class="close-btn" onclick={() => showPanel = false}>关闭</button>
    </div>
  </div>
{/if}

<style>
  .long-press-trigger {
    position: fixed;
    top: 0;
    left: 0;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    opacity: 0.2;
    cursor: pointer;
    z-index: 100;
  }
  
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .panel {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
  }
  
  .section {
    margin-bottom: 2rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  
  input[type="time"],
  input[type="text"],
  select {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }
  
  .node-editor {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 8px;
  }
  
  .add-btn {
    width: 100%;
    padding: 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  
  .close-btn {
    width: 100%;
    padding: 1rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 1rem;
  }
</style>
```

**Step 6.2: 更新 App.svelte**

修改 `src/App.svelte`：
```svelte
<script lang="ts">
  import Timeline from './lib/components/Timeline.svelte'
  import ParentPanel from './lib/components/ParentPanel.svelte'
  import { startClock } from './lib/stores/timeline'
  
  startClock()
</script>

<div class="app">
  <Timeline />
  <ParentPanel />
</div>

<style>
  .app {
    min-height: 100vh;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  }
</style>
```

**Step 6.3: 提交**

```bash
git add src/
git commit -m "feat: 实现家长面板（长按进入）"
```

---

## Task 7: 实现 Web Audio 蜂鸣提醒

**目标：** 节点前 5 分钟 + 节点整点时播放蜂鸣声

**Step 7.1: 创建蜂鸣工具**

创建 `src/lib/audio/beep.ts`：
```typescript
let audioContext: AudioContext | null = null

export function initAudio() {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
}

export function beep(frequency = 1000, duration = 0.15) {
  if (!audioContext) return
  
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.frequency.value = frequency
  oscillator.type = 'sine'
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + duration)
}

export function beepTriple() {
  beep()
  setTimeout(() => beep(), 200)
  setTimeout(() => beep(), 400)
}

export function beepSingle() {
  beep()
}
```

**Step 7.2: 创建提醒调度器**

创建 `src/lib/stores/reminders.ts`：
```typescript
import { config, currentTime } from './timeline'
import { beepSingle, beepTriple, initAudio } from '../audio/beep'
import type { TimelineNode } from '../types'
import { timeToMinutes } from '../time'

let reminderState = new Set<string>() // 已触发的提醒
let lastMinute = -1

export function startReminders() {
  initAudio()
  
  setInterval(() => {
    const currentMin = $currentTime
    const minuteFloor = Math.floor(currentMin)
    
    // 每分钟检查一次
    if (minuteFloor === lastMinute) return
    lastMinute = minuteFloor
    
    const nodes = $config.nodes
    const today = new Date().toISOString().split('T')[0]
    
    nodes.forEach(node => {
      if (!node.announce) return
      
      const nodeMin = timeToMinutes(node.time, $config.wakeTime)
      const diff = nodeMin - minuteFloor
      
      // 提前 5 分钟提醒
      if (diff === 5) {
        const key = `${today}-${node.id}-pre`
        if (!reminderState.has(key)) {
          beepSingle()
          reminderState.add(key)
        }
      }
      
      // 节点整点提醒
      if (diff === 0) {
        const key = `${today}-${node.id}-main`
        if (!reminderState.has(key)) {
          beepTriple()
          reminderState.add(key)
        }
      }
    })
    
    // 每天零点清理状态
    if (minuteFloor === 0 && lastMinute === 0) {
      reminderState.clear()
    }
  }, 1000)
}
```

**Step 7.3: 更新 App.svelte**

修改 `src/App.svelte`：
```svelte
<script lang="ts">
  import Timeline from './lib/components/Timeline.svelte'
  import ParentPanel from './lib/components/ParentPanel.svelte'
  import { startClock, startReminders } from './lib/stores/timeline'
  
  startClock()
  startReminders()
</script>

<div class="app">
  <Timeline />
  <ParentPanel />
</div>

<style>
  .app {
    min-height: 100vh;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  }
</style>
```

**Step 7.4: 提交**

```bash
git add src/
git commit -m "feat: 实现 Web Audio 蜂鸣提醒"
```

---

## Task 8: 实现局域网同步与访问口令

**目标：** 配置变更实时同步到其他设备，支持访问口令

**Step 8.1: 创建同步模块**

创建 `src/lib/sync.ts`：
```typescript
import { config } from './stores/timeline'
import { writable } from 'svelte/store'

export const syncStatus = writable<'connected' | 'disconnected' | 'error'>('disconnected')

let eventSource: EventSource | null = null

export function connectSSE() {
  if (eventSource) return
  
  eventSource = new EventSource('/api/events')
  
  eventSource.onopen = () => {
    syncStatus.set('connected')
  }
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'config') {
        config.set(data.payload)
      }
    } catch (e) {
      console.error('Failed to parse SSE message:', e)
    }
  }
  
  eventSource.onerror = () => {
    syncStatus.set('error')
    eventSource?.close()
    eventSource = null
    
    // 5 秒后重连
    setTimeout(connectSSE, 5000)
  }
}

export async function broadcastConfig(newConfig: any) {
  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    })
    
    if (!response.ok) {
      throw new Error('Failed to broadcast config')
    }
  } catch (e) {
    console.error('Failed to broadcast config:', e)
    syncStatus.set('error')
  }
}

export async function loadConfig() {
  try {
    const response = await fetch('/api/config')
    const data = await response.json()
    if (data && Object.keys(data).length > 0) {
      config.set(data)
    }
  } catch (e) {
    console.error('Failed to load config:', e)
  }
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    const data = await response.json()
    return data.valid
  } catch (e) {
    console.error('Failed to verify token:', e)
    return false
  }
}

export async function setToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    const data = await response.json()
    return data.success
  } catch (e) {
    console.error('Failed to set token:', e)
    return false
  }
}
```

**Step 8.2: 更新 App.svelte**

修改 `src/App.svelte`：
```svelte
<script lang="ts">
  import Timeline from './lib/components/Timeline.svelte'
  import ParentPanel from './lib/components/ParentPanel.svelte'
  import { startClock } from './lib/stores/timeline'
  import { startReminders } from './lib/stores/reminders'
  import { connectSSE, loadConfig } from './lib/sync'
  import { onMount } from 'svelte'
  
  onMount(() => {
    loadConfig()
    connectSSE()
    startClock()
    startReminders()
  })
</script>

<div class="app">
  <Timeline />
  <ParentPanel />
</div>

<style>
  .app {
    min-height: 100vh;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  }
</style>
```

**Step 8.3: 提交**

```bash
git add src/
git commit -m "feat: 实现局域网同步与访问口令"
```

---

## Task 9: 配置 PWA

**目标：** 支持加到桌面/主屏，全屏无地址栏

**Step 9.1: 创建 manifest.json**

创建 `public/manifest.json`：
```json
{
  "name": "滴答童行",
  "short_name": "时间轴",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fef3c7",
  "theme_color": "#f59e0b",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Step 9.2: 创建 Service Worker**

创建 `public/sw.js`：
```javascript
const CACHE_NAME = 'kid-timeline-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  )
})

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  )
})
```

**Step 9.3: 更新 index.html**

修改 `index.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#f59e0b">
  <link rel="manifest" href="/manifest.json">
  <title>滴答童行</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
  </script>
</body>
</html>
```

**Step 9.4: 创建简单图标**

创建 `public/icon-192.png` 和 `public/icon-512.png`（可用占位图）

**Step 9.5: 提交**

```bash
git add public/
git commit -m "feat: 配置 PWA（manifest + service worker）"
```

---

## Task 10: 端到端测试与优化

**目标：** 完整流程测试，修复问题，优化体验

**Step 10.1: 启动完整开发环境**

终端 1：启动服务端
```bash
node server/index.js
```

终端 2：启动前端
```bash
npm run dev
```

**Step 10.2: 测试核心功能**

- [ ] 打开 `http://localhost:5173/`，应看到时间轴
- [ ] 长按左上角 2 秒，应弹出家长面板
- [ ] 修改起床/睡觉时间，应实时更新
- [ ] 添加/删除/编辑节点，应实时同步
- [ ] 等待到节点前 5 分钟，应听到单声蜂鸣
- [ ] 等待到节点整点，应听到三声蜂鸣
- [ ] 用手机访问同一地址，修改配置，电脑应实时同步

**Step 10.3: 测试 PWA**

- [ ] Chrome 打开 `http://localhost:5173/`
- [ ] 点击地址栏右侧"安装"图标
- [ ] 安装后应从桌面启动，全屏无地址栏

**Step 10.4: 修复问题**

根据测试结果修复发现的 bug

**Step 10.5: 提交**

```bash
git add .
git commit -m "test: 端到端测试完成，修复问题"
```

---

## 开发完成

**恭喜！** 滴答童行 v1 已完成。

**下一步：**
1. 在家长面板中调整真实的作息时间
2. 在挂墙平板上打开网页，加到主屏
3. 享受成果！

---

## 执行方式选择

**计划完成并保存到 `docs/plans/2026-08-28-kid-timeline-clock.md`。两种执行方式：**

**1. Subagent 驱动（当前会话）** - 我派遣子代理逐任务执行，任务间审查，快速迭代

**2. 并行会话（独立）** - 打开新会话使用 executing-plans，批量执行带检查点

**选哪种？**
