'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const GALLERY_QUERY = require('./gallery-query');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const USE_POSTGRES = Boolean(process.env.DATABASE_URL);
let db;

if (USE_POSTGRES) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, Number);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  function toPostgresSql(sql) {
    let ignoreConflict = false;
    let parameterIndex = 0;
    let query = sql.replace(/INSERT OR IGNORE INTO/gi, () => {
      ignoreConflict = true;
      return 'INSERT INTO';
    });
    query = query.replace(
      /group_concat\(\s*([^,]+),\s*'([^']*)'\s*\)/gi,
      "string_agg($1, '$2')"
    );
    query = query.replace(/\bLIKE\b/gi, 'ILIKE');
    query = query.replace(/\?/g, () => `$${++parameterIndex}`);
    if (ignoreConflict) query += ' ON CONFLICT DO NOTHING';
    return query;
  }

  db = {
    prepare(sql) {
      return {
        async get(...params) {
          const result = await pool.query(toPostgresSql(sql), params);
          return result.rows[0];
        },
        async all(...params) {
          const result = await pool.query(toPostgresSql(sql), params);
          return result.rows;
        },
        async run(...params) {
          let query = toPostgresSql(sql);
          const returnsId = /^\s*INSERT\s+INTO\s+(documents|artists|exhibitions|timeline)\b/i.test(query);
          if (returnsId && !/\bRETURNING\b/i.test(query)) query += ' RETURNING id';
          const result = await pool.query(query, params);
          return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
        }
      };
    }
  };
} else {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production; SQLite is only for local development.');
  }
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, 'archive.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
}

const CATEGORIES = [
  '展览画册',
  '艺术评论',
  '艺术家手稿',
  '访谈与口述',
  '影像资料',
  '期刊与剪报',
  '档案文件'
];

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* 建表                                                                */
/* ------------------------------------------------------------------ */

if (!USE_POSTGRES) db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  birth_year INTEGER,
  death_year INTEGER,
  birthplace TEXT,
  region TEXT,
  medium TEXT,
  bio TEXT,
  statement TEXT,
  portrait TEXT,
  tags TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS exhibitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_en TEXT,
  venue TEXT,
  city TEXT,
  start_date TEXT,
  end_date TEXT,
  year INTEGER,
  curators TEXT,
  organizer TEXT,
  intro TEXT,
  poster TEXT,
  tags TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  title_en TEXT,
  category TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  pub_date TEXT,
  year INTEGER,
  extent TEXT,
  language TEXT,
  summary TEXT,
  content TEXT,
  cover TEXT,
  file_path TEXT,
  source TEXT,
  rights TEXT,
  tags TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS doc_artists (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, artist_id)
);

CREATE TABLE IF NOT EXISTS doc_exhibitions (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  exhibition_id INTEGER NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, exhibition_id)
);

CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER,
  date_text TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
CREATE INDEX IF NOT EXISTS idx_doc_artists_artist ON doc_artists(artist_id);
CREATE INDEX IF NOT EXISTS idx_doc_exh_exhibition ON doc_exhibitions(exhibition_id);
CREATE INDEX IF NOT EXISTS idx_timeline_year ON timeline(year);
`);

/* ------------------------------------------------------------------ */
/* 账号与设置                                                          */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

const DEFAULT_SETTINGS = {
  site_name: '海南当代艺术文献',
  site_name_en: 'Hainan Contemporary Art Archive',
  site_subtitle: '岛屿上的艺术现场，与保存它的工作',
  intro:
    '本档案库以海南当代艺术的现场为对象，收录展览画册、评论文章、艺术家手稿、访谈口述、影像与剪报等一手材料，并持续进行整理、编目与数字化。所有条目均标注来源与编号，供研究者检索引用。',
  access_note:
    '文献原件多藏于机构与私人手中，本站提供目录与数字化副本。引用请注明档案编号；如需高清复制或有偿使用，请与我们联系。',
  contact_email: 'archive@example.com',
  address: '海南省海口市'
};

async function getSettings() {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function updateSettings(patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await stmt.run(key, value == null ? '' : String(value));
  }
  return getSettings();
}

async function ensureAdmin() {
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
  if (count > 0) return null;
  const username = 'admin';
  const password = crypto.randomBytes(4).toString('hex');
  await db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hashPassword(password), '档案管理员', 'admin', now());
  return { username, password };
}

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

function like(q) {
  return `%${String(q).trim().replace(/[%_]/g, (m) => '\\' + m)}%`;
}

function toInt(value, fallback = null) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function splitTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[,，;；、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 中文姓名按拼音字母顺序排列
const nameCollator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base' });

function sortByName(rows) {
  return rows.sort((a, b) => nameCollator.compare(a.name || '', b.name || ''));
}

function paging(query) {
  const pageSize = Math.min(Math.max(toInt(query.page_size, 20) || 20, 1), 100);
  const page = Math.max(toInt(query.page, 1) || 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/* ------------------------------------------------------------------ */
/* 文献                                                                */
/* ------------------------------------------------------------------ */

const DOC_ARTIST_NAMES = `(
  SELECT group_concat(a.name, '、') FROM doc_artists da
  JOIN artists a ON a.id = da.artist_id WHERE da.document_id = d.id
)`;

function documentFilters(query, alias = 'd') {
  const where = [];
  const params = [];
  if (query.q && String(query.q).trim()) {
    const kw = like(query.q);
    where.push(
      `(${alias}.title LIKE ? ESCAPE '\\' OR ${alias}.author LIKE ? ESCAPE '\\' OR ${alias}.summary LIKE ? ESCAPE '\\' OR ${alias}.tags LIKE ? ESCAPE '\\' OR ${alias}.content LIKE ? ESCAPE '\\' OR ${alias}.publisher LIKE ? ESCAPE '\\')`
    );
    params.push(kw, kw, kw, kw, kw, kw);
  }
  if (query.category) {
    const cats = String(query.category).split(',').filter(Boolean);
    if (cats.length) {
      where.push(`${alias}.category IN (${cats.map(() => '?').join(',')})`);
      params.push(...cats);
    }
  }
  const yearFrom = toInt(query.year_from);
  const yearTo = toInt(query.year_to);
  if (yearFrom != null) {
    where.push(`${alias}.year >= ?`);
    params.push(yearFrom);
  }
  if (yearTo != null) {
    where.push(`${alias}.year <= ?`);
    params.push(yearTo);
  }
  if (query.artist) {
    where.push(
      `EXISTS (SELECT 1 FROM doc_artists da2 WHERE da2.document_id = ${alias}.id AND da2.artist_id = ?)`
    );
    params.push(toInt(query.artist));
  }
  if (query.exhibition) {
    where.push(
      `EXISTS (SELECT 1 FROM doc_exhibitions de2 WHERE de2.document_id = ${alias}.id AND de2.exhibition_id = ?)`
    );
    params.push(toInt(query.exhibition));
  }
  if (query.has_file === '1') {
    where.push(`${alias}.file_path IS NOT NULL AND ${alias}.file_path <> ''`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function listDocuments(query = {}) {
  const { sql: whereSql, params } = documentFilters(query);
  const { page, pageSize, offset } = paging(query);
  const sortKey = query.sort || 'year_desc';
  const order =
    {
      year_desc: 'd.year DESC NULLS LAST, d.id DESC',
      year_asc: 'd.year ASC NULLS LAST, d.id ASC',
      title: 'd.title ASC',
      newest: 'd.created_at DESC'
    }[sortKey] || 'd.year DESC NULLS LAST, d.id DESC';

  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM documents d ${whereSql}`).get(...params)).n;
  const items = await db
    .prepare(
      `SELECT d.id, d.code, d.title, d.title_en, d.category, d.author, d.publisher,
              d.pub_date, d.year, d.summary, d.cover, d.file_path, d.tags, d.is_demo,
              d.created_at, ${DOC_ARTIST_NAMES} AS artist_names
       FROM documents d ${whereSql}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return { total, page, page_size: pageSize, items: items.map(normalizeDocRow) };
}

function normalizeDocRow(row) {
  return { ...row, tags: splitTags(row.tags), artists: row.artist_names || '' };
}

async function getDocument(id) {
  const row = await db.prepare('SELECT * FROM documents WHERE id = ?').get(toInt(id));
  if (!row) return null;
  const artists = await db
    .prepare(
      `SELECT a.id, a.name, a.name_en, a.birth_year, a.death_year
       FROM doc_artists da JOIN artists a ON a.id = da.artist_id
       WHERE da.document_id = ?`
    )
    .all(row.id);
  const exhibitions = await db
    .prepare(
      `SELECT e.id, e.title, e.year, e.venue
       FROM doc_exhibitions de JOIN exhibitions e ON e.id = de.exhibition_id
       WHERE de.document_id = ? ORDER BY e.year`
    )
    .all(row.id);
  const related = await db
    .prepare(
      `SELECT d.id, d.code, d.title, d.category, d.year
       FROM documents d
       WHERE d.id <> ? AND (
         d.category = ? OR d.year = ? OR EXISTS (
           SELECT 1 FROM doc_artists da1 JOIN doc_artists da2
             ON da1.artist_id = da2.artist_id
           WHERE da1.document_id = d.id AND da2.document_id = ?
         )
       )
       ORDER BY (d.category = ?) DESC, ABS(COALESCE(d.year, 0) - COALESCE(?, 0)) ASC
       LIMIT 5`
    )
    .all(row.id, row.category, row.year, row.id, row.category, row.year);

  return {
    ...row,
    tags: splitTags(row.tags),
    artists: sortByName(artists),
    exhibitions,
    related
  };
}

async function nextCode() {
  const last = await db.prepare("SELECT code FROM documents WHERE code LIKE 'HNCA-D-%' ORDER BY id DESC LIMIT 1").get();
  let n = 1;
  if (last && last.code) {
    const parsed = parseInt(String(last.code).replace('HNCA-D-', ''), 10);
    if (Number.isFinite(parsed)) n = parsed + 1;
  }
  return `HNCA-D-${String(n).padStart(4, '0')}`;
}

async function saveDocument(payload, id = null) {
  const stamp = now();
  const fields = {
    code: payload.code || await nextCode(),
    title: payload.title || '未命名文献',
    title_en: payload.title_en || null,
    category: payload.category || CATEGORIES[0],
    author: payload.author || null,
    publisher: payload.publisher || null,
    pub_date: payload.pub_date || null,
    year: toInt(payload.year),
    extent: payload.extent || null,
    language: payload.language || '中文',
    summary: payload.summary || null,
    content: payload.content || null,
    cover: payload.cover || null,
    file_path: payload.file_path || null,
    source: payload.source || null,
    rights: payload.rights || null,
    tags: splitTags(payload.tags).join(','),
    is_demo: payload.is_demo ? 1 : 0
  };

  let docId = toInt(id);
  if (docId) {
    const keys = Object.keys(fields);
    await db.prepare(
      `UPDATE documents SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
    ).run(...keys.map((k) => fields[k]), stamp, docId);
  } else {
    const keys = Object.keys(fields);
    const info = await db
      .prepare(
        `INSERT INTO documents (${keys.join(', ')}, created_at, updated_at)
         VALUES (${keys.map(() => '?').join(', ')}, ?, ?)`
      )
      .run(...keys.map((k) => fields[k]), stamp, stamp);
    docId = Number(info.lastInsertRowid);
  }

  await db.prepare('DELETE FROM doc_artists WHERE document_id = ?').run(docId);
  await db.prepare('DELETE FROM doc_exhibitions WHERE document_id = ?').run(docId);
  const linkArtist = db.prepare('INSERT OR IGNORE INTO doc_artists (document_id, artist_id) VALUES (?, ?)');
  for (const artistId of payload.artists || []) {
    if (toInt(artistId)) await linkArtist.run(docId, toInt(artistId));
  }
  const linkExh = db.prepare(
    'INSERT OR IGNORE INTO doc_exhibitions (document_id, exhibition_id) VALUES (?, ?)'
  );
  for (const exhId of payload.exhibitions || []) {
    if (toInt(exhId)) await linkExh.run(docId, toInt(exhId));
  }

  return getDocument(docId);
}

async function deleteDocument(id) {
  await db.prepare('DELETE FROM documents WHERE id = ?').run(toInt(id));
}

/* ------------------------------------------------------------------ */
/* 艺术家                                                              */
/* ------------------------------------------------------------------ */

async function listArtists(query = {}) {
  const where = [];
  const params = [];
  if (query.q && String(query.q).trim()) {
    const kw = like(query.q);
    where.push('(name LIKE ? ESCAPE \'\\\' OR name_en LIKE ? ESCAPE \'\\\' OR bio LIKE ? ESCAPE \'\\\' OR tags LIKE ? ESCAPE \'\\\')');
    params.push(kw, kw, kw, kw);
  }
  if (query.region) {
    where.push('region = ?');
    params.push(query.region);
  }
  if (query.decade) {
    const d = toInt(query.decade);
    if (d != null) {
      where.push('birth_year >= ? AND birth_year < ?');
      params.push(d, d + 10);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM doc_artists da WHERE da.artist_id = a.id) AS doc_count
       FROM artists a ${whereSql}`
    )
    .all(...params);
  return sortByName(rows).map((r) => ({ ...r, tags: splitTags(r.tags) }));
}

async function getArtist(id) {
  const row = await db.prepare('SELECT * FROM artists WHERE id = ?').get(toInt(id));
  if (!row) return null;
  const documents = await db
    .prepare(
      `SELECT d.id, d.code, d.title, d.category, d.year, d.author, d.summary
       FROM documents d JOIN doc_artists da ON da.document_id = d.id
       WHERE da.artist_id = ? ORDER BY d.year DESC NULLS LAST, d.id DESC`
    )
    .all(row.id);
  const exhibitions = await db
    .prepare(
      `SELECT DISTINCT e.id, e.title, e.year, e.venue, e.start_date, e.end_date
       FROM exhibitions e
       JOIN doc_exhibitions de ON de.exhibition_id = e.id
       JOIN doc_artists da ON da.document_id = de.document_id
       WHERE da.artist_id = ? ORDER BY e.start_date DESC NULLS LAST`
    )
    .all(row.id);
  return { ...row, tags: splitTags(row.tags), documents, exhibitions };
}

async function saveArtist(payload, id = null) {
  const stamp = now();
  const fields = {
    name: payload.name || '未命名',
    name_en: payload.name_en || null,
    birth_year: toInt(payload.birth_year),
    death_year: toInt(payload.death_year),
    birthplace: payload.birthplace || null,
    region: payload.region || null,
    medium: payload.medium || null,
    bio: payload.bio || null,
    statement: payload.statement || null,
    portrait: payload.portrait || null,
    tags: splitTags(payload.tags).join(','),
    is_demo: payload.is_demo ? 1 : 0
  };
  const keys = Object.keys(fields);
  let artistId = toInt(id);
  if (artistId) {
    await db.prepare(
      `UPDATE artists SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
    ).run(...keys.map((k) => fields[k]), stamp, artistId);
  } else {
    const info = await db
      .prepare(
        `INSERT INTO artists (${keys.join(', ')}, created_at, updated_at)
         VALUES (${keys.map(() => '?').join(', ')}, ?, ?)`
      )
      .run(...keys.map((k) => fields[k]), stamp, stamp);
    artistId = Number(info.lastInsertRowid);
  }
  return getArtist(artistId);
}

async function deleteArtist(id) {
  await db.prepare('DELETE FROM artists WHERE id = ?').run(toInt(id));
}

/* ------------------------------------------------------------------ */
/* 展览                                                                */
/* ------------------------------------------------------------------ */

async function listExhibitions(query = {}) {
  const where = [];
  const params = [];
  if (query.q && String(query.q).trim()) {
    const kw = like(query.q);
    where.push(
      `(title LIKE ? ESCAPE '\\' OR title_en LIKE ? ESCAPE '\\' OR venue LIKE ? ESCAPE '\\' OR curators LIKE ? ESCAPE '\\' OR intro LIKE ? ESCAPE '\\')`
    );
    params.push(kw, kw, kw, kw, kw);
  }
  const yearFrom = toInt(query.year_from);
  const yearTo = toInt(query.year_to);
  if (yearFrom != null) {
    where.push('year >= ?');
    params.push(yearFrom);
  }
  if (yearTo != null) {
    where.push('year <= ?');
    params.push(yearTo);
  }
  if (query.artist) {
    where.push(
      `EXISTS (SELECT 1 FROM doc_exhibitions de JOIN doc_artists da ON da.document_id = de.document_id
               WHERE de.exhibition_id = exhibitions.id AND da.artist_id = ?)`
    );
    params.push(toInt(query.artist));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { page, pageSize, offset } = paging(query);
  const total = (await db
    .prepare(`SELECT COUNT(*) AS n FROM exhibitions ${whereSql}`)
    .get(...params)).n;
  const items = await db
    .prepare(
      `SELECT *, (SELECT COUNT(*) FROM doc_exhibitions de WHERE de.exhibition_id = exhibitions.id) AS doc_count
       FROM exhibitions ${whereSql}
       ORDER BY year DESC NULLS LAST, start_date DESC NULLS LAST, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  return {
    total,
    page,
    page_size: pageSize,
    items: items.map((r) => ({ ...r, tags: splitTags(r.tags) }))
  };
}

async function getExhibition(id) {
  const row = await db.prepare('SELECT * FROM exhibitions WHERE id = ?').get(toInt(id));
  if (!row) return null;
  const documents = await db
    .prepare(
      `SELECT d.id, d.code, d.title, d.category, d.year, d.author, d.summary
       FROM documents d JOIN doc_exhibitions de ON de.document_id = d.id
       WHERE de.exhibition_id = ? ORDER BY d.year DESC NULLS LAST`
    )
    .all(row.id);
  const artists = await db
    .prepare(
      `SELECT DISTINCT a.id, a.name, a.name_en
       FROM artists a
       JOIN doc_artists da ON da.artist_id = a.id
       JOIN doc_exhibitions de ON de.document_id = da.document_id
       WHERE de.exhibition_id = ?`
    )
    .all(row.id);
  return { ...row, tags: splitTags(row.tags), documents, artists: sortByName(artists) };
}

async function saveExhibition(payload, id = null) {
  const stamp = now();
  const fields = {
    title: payload.title || '未命名展览',
    title_en: payload.title_en || null,
    venue: payload.venue || null,
    city: payload.city || '海口',
    start_date: payload.start_date || null,
    end_date: payload.end_date || null,
    year: toInt(payload.year) || (payload.start_date ? toInt(String(payload.start_date).slice(0, 4)) : null),
    curators: payload.curators || null,
    organizer: payload.organizer || null,
    intro: payload.intro || null,
    poster: payload.poster || null,
    tags: splitTags(payload.tags).join(','),
    is_demo: payload.is_demo ? 1 : 0
  };
  const keys = Object.keys(fields);
  let exhId = toInt(id);
  if (exhId) {
    await db.prepare(
      `UPDATE exhibitions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
    ).run(...keys.map((k) => fields[k]), stamp, exhId);
  } else {
    const info = await db
      .prepare(
        `INSERT INTO exhibitions (${keys.join(', ')}, created_at, updated_at)
         VALUES (${keys.map(() => '?').join(', ')}, ?, ?)`
      )
      .run(...keys.map((k) => fields[k]), stamp, stamp);
    exhId = Number(info.lastInsertRowid);
  }
  return getExhibition(exhId);
}

async function deleteExhibition(id) {
  await db.prepare('DELETE FROM exhibitions WHERE id = ?').run(toInt(id));
}

/* ------------------------------------------------------------------ */
/* 年表                                                                */
/* ------------------------------------------------------------------ */

async function listTimeline(query = {}) {
  const where = [];
  const params = [];
  const from = toInt(query.year_from);
  const to = toInt(query.year_to);
  if (from != null) {
    where.push('year >= ?');
    params.push(from);
  }
  if (to != null) {
    where.push('year <= ?');
    params.push(to);
  }
  if (query.q && String(query.q).trim()) {
    const kw = like(query.q);
    where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(kw, kw);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM timeline ${whereSql} ORDER BY year ASC, COALESCE(month, 13) ASC, id ASC`)
    .all(...params);
}

async function saveTimeline(payload, id = null) {
  const stamp = now();
  const fields = {
    year: toInt(payload.year) || new Date().getFullYear(),
    month: toInt(payload.month),
    date_text: payload.date_text || null,
    title: payload.title || '未命名事件',
    description: payload.description || null,
    category: payload.category || '艺术活动',
    is_demo: payload.is_demo ? 1 : 0
  };
  const keys = Object.keys(fields);
  let tid = toInt(id);
  if (tid) {
    await db.prepare(
      `UPDATE timeline SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
    ).run(...keys.map((k) => fields[k]), stamp, tid);
  } else {
    const info = await db
      .prepare(
        `INSERT INTO timeline (${keys.join(', ')}, created_at, updated_at)
         VALUES (${keys.map(() => '?').join(', ')}, ?, ?)`
      )
      .run(...keys.map((k) => fields[k]), stamp, stamp);
    tid = Number(info.lastInsertRowid);
  }
  return db.prepare('SELECT * FROM timeline WHERE id = ?').get(tid);
}

async function deleteTimeline(id) {
  await db.prepare('DELETE FROM timeline WHERE id = ?').run(toInt(id));
}

/* ------------------------------------------------------------------ */
/* 检索与统计                                                          */
/* ------------------------------------------------------------------ */

async function searchAll(q) {
  const kw = like(q);
  const documents = await db
    .prepare(
      `SELECT id, code, title, category, year FROM documents
       WHERE title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\'
       ORDER BY year DESC NULLS LAST LIMIT 8`
    )
    .all(kw, kw, kw);
  const artists = await db
    .prepare(
      `SELECT id, name, name_en, birth_year, death_year, region FROM artists
       WHERE name LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' OR bio LIKE ? ESCAPE '\\'
       LIMIT 6`
    )
    .all(kw, kw, kw);
  const exhibitions = await db
    .prepare(
      `SELECT id, title, year, venue FROM exhibitions
       WHERE title LIKE ? ESCAPE '\\' OR venue LIKE ? ESCAPE '\\' OR intro LIKE ? ESCAPE '\\'
       ORDER BY year DESC NULLS LAST LIMIT 6`
    )
    .all(kw, kw, kw);
  const timeline = await db
    .prepare(
      `SELECT id, year, title FROM timeline
       WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
       ORDER BY year DESC LIMIT 5`
    )
    .all(kw, kw);
  return {
    documents,
    artists,
    exhibitions,
    timeline,
    total: documents.length + artists.length + exhibitions.length + timeline.length
  };
}

async function stats() {
  const one = async (sql) => (await db.prepare(sql).get()).n;
  const categoryRows = await db
    .prepare('SELECT category, COUNT(*) AS n FROM documents GROUP BY category ORDER BY n DESC')
    .all();
  const yearRange = await db
    .prepare('SELECT MIN(year) AS min, MAX(year) AS max FROM documents WHERE year IS NOT NULL')
    .get();
  return {
    documents: await one('SELECT COUNT(*) AS n FROM documents'),
    artists: await one('SELECT COUNT(*) AS n FROM artists'),
    exhibitions: await one('SELECT COUNT(*) AS n FROM exhibitions'),
    timeline: await one('SELECT COUNT(*) AS n FROM timeline'),
    digitized: await one("SELECT COUNT(*) AS n FROM documents WHERE file_path IS NOT NULL AND file_path <> ''"),
    categories: categoryRows,
    years: { from: yearRange.min, to: yearRange.max }
  };
}

async function home() {
  const featured = await db
    .prepare(
      `SELECT d.id, d.code, d.title, d.category, d.year, d.author, d.cover, d.summary, d.is_demo
       FROM documents d WHERE d.cover IS NOT NULL AND d.cover <> ''
       ORDER BY d.year DESC LIMIT 3`
    )
    .all();
  const latest = await db
    .prepare(
      `SELECT id, code, title, category, year, author, created_at FROM documents
       ORDER BY created_at DESC LIMIT 6`
    )
    .all();
  const exhibitions = await db
    .prepare(
      `SELECT id, title, venue, city, year, start_date, end_date, poster FROM exhibitions
       ORDER BY year DESC NULLS LAST, start_date DESC NULLS LAST LIMIT 4`
    )
    .all();
  const timeline = await db
    .prepare(
      `SELECT id, year, month, title, category FROM timeline
       ORDER BY year DESC, COALESCE(month, 13) DESC LIMIT 5`
    )
    .all();
  return { featured, latest, exhibitions, timeline, stats: await stats() };
}

async function gallery() {
  return db.prepare(GALLERY_QUERY).all();
}

async function clearDemo() {
  await db.prepare('DELETE FROM documents WHERE is_demo = 1').run();
  await db.prepare('DELETE FROM artists WHERE is_demo = 1').run();
  await db.prepare('DELETE FROM exhibitions WHERE is_demo = 1').run();
  await db.prepare('DELETE FROM timeline WHERE is_demo = 1').run();
}

module.exports = {
  db,
  USE_POSTGRES,
  ROOT,
  DATA_DIR,
  UPLOAD_DIR,
  CATEGORIES,
  hashPassword,
  verifyPassword,
  getSettings,
  updateSettings,
  ensureAdmin,
  listDocuments,
  getDocument,
  saveDocument,
  deleteDocument,
  nextCode,
  listArtists,
  getArtist,
  saveArtist,
  deleteArtist,
  listExhibitions,
  getExhibition,
  saveExhibition,
  deleteExhibition,
  listTimeline,
  saveTimeline,
  deleteTimeline,
  searchAll,
  stats,
  home,
  gallery,
  clearDemo,
  splitTags,
  toInt,
  now,
  like
};
