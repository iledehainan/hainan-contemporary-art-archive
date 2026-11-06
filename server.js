'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const store = require('./db');
const { insertDemo } = require('./seed');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = store.UPLOAD_DIR;
const COOKIE = 'hnca_session';
const SESSION_DAYS = 7;
const MAX_BODY = 32 * 1024 * 1024; // 32MB，约等于 24MB 原文件

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

insertDemo();
const initialAdmin = store.ensureAdmin();

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readJson(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('文件或数据过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(Object.assign(new Error('请求格式错误'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = store.db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    store.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

function safeJoin(root, target) {
  const resolved = path.resolve(root, '.' + path.posix.normalize('/' + target));
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

function serveFile(res, filePath, { download = false } = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendError(res, 404, '文件不存在');
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    };
    if (download || ext === '.pdf') {
      headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(path.basename(filePath))}"`;
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* 登录限流                                                            */
/* ------------------------------------------------------------------ */

const attempts = new Map();
function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > 10 * 60 * 1000) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= 8;
}
function recordAttempt(ip) {
  const rec = attempts.get(ip);
  if (!rec) attempts.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const { pathname } = url;
  const query = Object.fromEntries(url.searchParams.entries());
  const method = req.method.toUpperCase();
  const user = currentUser(req);

  if (pathname === '/api/health') return sendJson(res, 200, { ok: true, time: new Date().toISOString() });

  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'local';
    if (tooManyAttempts(ip)) return sendError(res, 429, '尝试次数过多，请稍后再试');
    const body = await readJson(req);
    const row = store.db
      .prepare('SELECT id, username, password_hash, display_name, role FROM users WHERE username = ?')
      .get(String(body.username || '').trim());
    if (!row || !store.verifyPassword(body.password || '', row.password_hash)) {
      recordAttempt(ip);
      return sendError(res, 401, '账号或密码不正确');
    }
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
    store.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, row.id, expires);
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
    );
    return sendJson(res, 200, {
      user: { id: row.id, username: row.username, display_name: row.display_name, role: row.role }
    });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(req)[COOKIE];
    if (token) store.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/me') {
    if (!user) return sendJson(res, 200, { user: null });
    return sendJson(res, 200, {
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
    });
  }

  /* -------- 公共读取 -------- */
  if (pathname === '/api/bootstrap') {
    return sendJson(res, 200, {
      settings: store.getSettings(),
      categories: store.CATEGORIES,
      stats: store.stats(),
      user: user ? { username: user.username, display_name: user.display_name } : null
    });
  }

  if (pathname === '/api/home') return sendJson(res, 200, store.home());

  if (pathname === '/api/documents') {
    return sendJson(res, 200, store.listDocuments(query));
  }

  if (pathname.startsWith('/api/documents/')) {
    const doc = store.getDocument(pathname.split('/')[3]);
    if (!doc) return sendError(res, 404, '未找到该文献');
    return sendJson(res, 200, doc);
  }

  if (pathname === '/api/artists') return sendJson(res, 200, { items: store.listArtists(query) });

  if (pathname.startsWith('/api/artists/')) {
    const artist = store.getArtist(pathname.split('/')[3]);
    if (!artist) return sendError(res, 404, '未找到该艺术家');
    return sendJson(res, 200, artist);
  }

  if (pathname === '/api/exhibitions') return sendJson(res, 200, store.listExhibitions(query));

  if (pathname.startsWith('/api/exhibitions/')) {
    const exh = store.getExhibition(pathname.split('/')[3]);
    if (!exh) return sendError(res, 404, '未找到该展览');
    return sendJson(res, 200, exh);
  }

  if (pathname === '/api/timeline') return sendJson(res, 200, { items: store.listTimeline(query) });

  if (pathname === '/api/search') {
    const q = String(query.q || '').trim();
    if (!q) return sendJson(res, 200, { documents: [], artists: [], exhibitions: [], timeline: [], total: 0 });
    return sendJson(res, 200, store.searchAll(q));
  }

  /* -------- 需要登录 -------- */
  if (pathname === '/api/upload' && method === 'POST') {
    if (!user) return sendError(res, 401, '请先登录');
    const body = await readJson(req);
    const raw = String(body.data || '');
    const match = raw.match(/^data:([^;]+);base64,(.*)$/);
    const base64 = match ? match[2] : raw;
    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch (err) {
      return sendError(res, 400, '文件解析失败');
    }
    if (!buffer.length) return sendError(res, 400, '文件为空');
    if (buffer.length > 24 * 1024 * 1024) return sendError(res, 413, '单个文件请小于 24MB');

    const ext = path.extname(String(body.filename || '')).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.pdf'];
    if (!allowed.includes(ext)) return sendError(res, 400, '仅支持 jpg / png / webp / gif / svg / pdf');

    const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
    return sendJson(res, 200, { url: `/uploads/${name}`, size: buffer.length });
  }

  if (pathname.startsWith('/api/admin')) {
    if (!user) return sendError(res, 401, '请先登录');

    if (pathname === '/api/admin/overview') {
      const stats = store.stats();
      const demo = store.db.prepare('SELECT COUNT(*) AS n FROM documents WHERE is_demo = 1').get().n;
      const recent = store.db
        .prepare('SELECT id, code, title, category, updated_at FROM documents ORDER BY updated_at DESC LIMIT 8')
        .all();
      return sendJson(res, 200, { stats, demo, recent });
    }

    if (pathname === '/api/admin/settings' && method === 'PUT') {
      const body = await readJson(req);
      return sendJson(res, 200, { settings: store.updateSettings(body) });
    }

    if (pathname === '/api/admin/password' && method === 'POST') {
      const body = await readJson(req);
      const row = store.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
      if (!store.verifyPassword(body.current || '', row.password_hash)) {
        return sendError(res, 400, '当前密码不正确');
      }
      if (String(body.next || '').length < 6) return sendError(res, 400, '新密码至少 6 位');
      store.db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(store.hashPassword(body.next), user.id);
      store.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(user.id, parseCookies(req)[COOKIE]);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/demo' && method === 'DELETE') {
      store.clearDemo();
      return sendJson(res, 200, { ok: true });
    }

    const parts = pathname.split('/').filter(Boolean); // api, admin, resource, id
    const resource = parts[2];
    const id = parts[3];
    const map = {
      documents: [store.saveDocument, store.deleteDocument],
      artists: [store.saveArtist, store.deleteArtist],
      exhibitions: [store.saveExhibition, store.deleteExhibition],
      timeline: [store.saveTimeline, store.deleteTimeline]
    };

    if (map[resource]) {
      const [save, remove] = map[resource];
      if (method === 'POST') {
        const body = await readJson(req);
        return sendJson(res, 201, save(body, null));
      }
      if (method === 'PUT' && id) {
        const body = await readJson(req);
        return sendJson(res, 200, save(body, id));
      }
      if (method === 'DELETE' && id) {
        remove(id);
        return sendJson(res, 200, { ok: true });
      }
    }

    return sendError(res, 404, '接口不存在');
  }

  return sendError(res, 404, '接口不存在');
}

/* ------------------------------------------------------------------ */
/* 页面路由                                                            */
/* ------------------------------------------------------------------ */

const PRETTY_ROUTES = [
  { re: /^\/doc\/\d+\/?$/, file: 'document.html' },
  { re: /^\/artist\/\d+\/?$/, file: 'artist.html' },
  { re: /^\/exhibition\/\d+\/?$/, file: 'exhibition.html' }
];

const ALIASES = {
  '/archive': 'archive.html',
  '/artists': 'artists.html',
  '/exhibitions': 'exhibitions.html',
  '/timeline': 'timeline.html',
  '/about': 'about.html',
  '/admin': 'admin.html',
  '/search': 'archive.html'
};

function handlePage(req, res, url) {
  const { pathname } = url;

  if (pathname.startsWith('/uploads/')) {
    const target = safeJoin(UPLOAD_DIR, pathname.replace('/uploads/', ''));
    if (!target) return sendError(res, 403, '禁止访问');
    return serveFile(res, target, { download: true });
  }

  for (const route of PRETTY_ROUTES) {
    if (route.re.test(pathname)) return serveFile(res, path.join(PUBLIC_DIR, route.file));
  }

  if (ALIASES[pathname]) return serveFile(res, path.join(PUBLIC_DIR, ALIASES[pathname]));

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = safeJoin(PUBLIC_DIR, rel);
  if (!target) return sendError(res, 403, '禁止访问');
  return serveFile(res, target);
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    handlePage(req, res, url);
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendError(res, status, err.message || '服务器错误');
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  海南当代艺术文献 · 数字文献档案库');
  console.log(`  本地访问：http://localhost:${PORT}`);
  console.log(`  管理后台：http://localhost:${PORT}/admin`);
  console.log('');
  if (initialAdmin) {
    console.log('  ⚠ 首次启动，已生成管理员账号：');
    console.log(`    账号：${initialAdmin.username}`);
    console.log(`    密码：${initialAdmin.password}`);
    console.log('    请登录后立即在「设置」中修改密码。');
    console.log('');
  }
});

module.exports = { server };
