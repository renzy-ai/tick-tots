/**
 * 嘀嗒童行 服务端
 *
 * 职责：
 * 1. 提供 /api/state、/api/settings 读写作息配置（JSON 文件持久化）
 * 2. 通过 SSE 向局域网内所有设备广播配置变更（手机改 → 平板实时同步）
 * 3. 生产模式下服务 dist/ 静态资源
 *
 * 数据不出局域网，全部落在 server/data/ 下。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3010;
const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ====== 持久化 ======

const EMPTY = { config: null, settings: null };

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) };
    }
  } catch (err) {
    console.error('[server] 读取状态失败:', err.message);
  }
  return { ...EMPTY };
}

let saveErrorLogged = false;

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    saveErrorLogged = false;
  } catch (err) {
    // 仅在首次失败时记录一次，避免持续刷屏；运行仍然继续（有本地兜底）
    if (!saveErrorLogged) {
      console.warn('[server] 写入状态失败，将使用本地缓存兜底:', err.message);
      saveErrorLogged = true;
    }
  }
}

// ====== SSE 广播 ======

const sseClients = new Set();

function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ====== 请求处理 ======

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    // 简单防护：超过 1MB 直接拒绝
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('dist/ 不存在，请先执行 npm run build');
    return;
  }

  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

  // 防目录穿越
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // 带 hash 的构建产物可长期缓存，其余不缓存
        'Cache-Control': /assets\/.+-[A-Za-z0-9_-]{8}\./.test(pathname)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache'
      });
      res.end(data);
      return;
    }
    // SPA 回退
    fs.readFile(path.join(DIST_DIR, 'index.html'), (e2, html) => {
      if (e2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(html);
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  try {
    // ---- 作息配置 ----
    if (pathname === '/api/state' && req.method === 'GET') {
      const data = loadData();
      sendJSON(res, 200, { config: data.config });
      return;
    }

    if (pathname === '/api/state' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const data = loadData();
      data.config = body.config ?? null;
      saveData(data);
      broadcast('config', data.config);
      sendJSON(res, 200, { ok: true });
      return;
    }

    // ---- 设置项 ----
    if (pathname === '/api/settings' && req.method === 'GET') {
      const data = loadData();
      sendJSON(res, 200, data.settings || {});
      return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const data = loadData();
      data.settings = body;
      saveData(data);
      broadcast('settings', data.settings);
      sendJSON(res, 200, { ok: true });
      return;
    }

    // ---- SSE：配置变更推送 ----
    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');
      sseClients.add(res);

      // 心跳，防止中间代理断开
      const heartbeat = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
      });
      return;
    }

    // ---- 健康检查 ----
    if (pathname === '/api/health') {
      sendJSON(res, 200, { ok: true, clients: sseClients.size });
      return;
    }

    // ---- 静态资源 ----
    if (pathname.startsWith('/api/')) {
      sendJSON(res, 404, { error: 'Not found' });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    sendJSON(res, 400, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`嘀嗒童行 服务已启动: http://localhost:${PORT}/`);
});
