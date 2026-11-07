'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TABLES = [
  'users',
  'sessions',
  'artists',
  'exhibitions',
  'documents',
  'doc_artists',
  'doc_exhibitions',
  'timeline',
  'settings'
];

const FILES = [
  'artists.json',
  'documents.json',
  'exhibitions.json',
  'metadata.json',
  'settings.json',
  'timeline.json'
];
const RECOVERED_FILE = 'recovered-document-0035.json';
const RECOVERED_SOURCE_MARKERS = ['文旅中国', '中国文化报', '原创', '梁平平', '用户此前提供'];
const RECOVERED_SOURCE_NOTE = '根据用户此前提供的信息恢复；不属于公开 API 导出';
const SCREENSHOT_ONLY_NOTE = '仅有截图著录，未录入全文。';
const RECOVERED_TAGS = ['海南版画', '梁平平', '黑白木刻', '渔港题材', '版画评论', '文脉传承'];
const METADATA_COUNT_FIELDS = {
  documents: 'document_count',
  artists: 'artist_count',
  exhibitions: 'exhibition_count',
  timeline: 'timeline_count',
  settings: 'settings_count'
};

const FIELDS = {
  artists: [
    'id', 'name', 'name_en', 'birth_year', 'death_year', 'birthplace', 'region',
    'medium', 'bio', 'statement', 'portrait', 'tags', 'is_demo', 'created_at', 'updated_at'
  ],
  exhibitions: [
    'id', 'title', 'title_en', 'venue', 'city', 'start_date', 'end_date', 'year',
    'curators', 'organizer', 'intro', 'poster', 'tags', 'is_demo', 'created_at', 'updated_at'
  ],
  documents: [
    'id', 'code', 'title', 'title_en', 'category', 'author', 'publisher', 'pub_date',
    'year', 'extent', 'language', 'summary', 'content', 'cover', 'file_path', 'source',
    'rights', 'tags', 'is_demo', 'created_at', 'updated_at'
  ],
  timeline: [
    'id', 'year', 'month', 'date_text', 'title', 'description', 'category',
    'is_demo', 'created_at', 'updated_at'
  ]
};

function parseArgs(args) {
  let backupDir;
  let apply = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--backup-dir' && args[i + 1]) {
      if (backupDir) throw new Error('Specify --backup-dir only once.');
      backupDir = args[i + 1];
      i += 1;
    } else if (args[i] === '--apply') {
      if (apply) throw new Error('Specify --apply only once.');
      apply = true;
    } else {
      throw new Error(`Unknown or incomplete option: ${args[i]}`);
    }
  }
  if (!backupDir) throw new Error('A private backup directory is required.');
  return { backupDir: path.resolve(backupDir), apply };
}

async function readJson(directory, filename) {
  const contents = await fs.readFile(path.join(directory, filename), 'utf8');
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`Invalid JSON in ${filename}.`);
  }
}

function assertRecordArray(value, name) {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(`${name} must be a JSON array of records.`);
  }
}

function assertUniqueIds(rows, name) {
  const ids = new Set();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id < 1) {
      throw new Error(`${name} contains a missing or invalid id.`);
    }
    if (ids.has(row.id)) throw new Error(`${name} contains duplicate ids.`);
    ids.add(row.id);
  }
  return ids;
}

function serializeTags(value, name) {
  if (value == null) return '';
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
    throw new Error(`${name}.tags must be an array of strings.`);
  }
  return value.join(',');
}

function validateRecoveredDocument(value, existingDocumentIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${RECOVERED_FILE} must contain one document record.`);
  }
  const record = value;
  if (!Array.isArray(record.artists) || record.artists.length !== 0 ||
      !Array.isArray(record.exhibitions) || record.exhibitions.length !== 0) {
    throw new Error(`${RECOVERED_FILE} must have empty artists and exhibitions arrays.`);
  }
  const expected = {
    id: 48,
    code: 'HNCA-D-0035',
    title: '海南当代版画艺术的文脉传承——梁平平版画艺术赏析',
    category: '艺术评论',
    author: '陈淑丽',
    publisher: '中国文化报',
    pub_date: '2026-11-04',
    year: 2026,
    language: '中文'
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (record[field] !== expectedValue) {
      throw new Error(`${RECOVERED_FILE} has an unexpected ${field}.`);
    }
  }
  if (existingDocumentIds.has(record.id)) {
    throw new Error(`${RECOVERED_FILE} duplicates a public-export document id.`);
  }
  if (record.is_demo != null && record.is_demo !== 0) {
    throw new Error(`${RECOVERED_FILE} must not be marked as demo data.`);
  }
  if (typeof record.source !== 'string' ||
      RECOVERED_SOURCE_MARKERS.some((marker) => !record.source.includes(marker)) ||
      typeof record.rights !== 'string' || record.rights.length > 280) {
    throw new Error(`${RECOVERED_FILE} must retain the specified source and page attribution.`);
  }
  if (typeof record.summary !== 'string' || record.summary.trim().length === 0 ||
      record.summary.length > 280) {
    throw new Error(`${RECOVERED_FILE}.summary must be a short summary of at most 280 characters.`);
  }
  if (record.content != null && record.content !== '' && record.content !== SCREENSHOT_ONLY_NOTE) {
    throw new Error(`${RECOVERED_FILE}.content must be empty or the screenshot-only catalog note.`);
  }
  if (JSON.stringify(record.tags) !== JSON.stringify(RECOVERED_TAGS)) {
    throw new Error(`${RECOVERED_FILE} must contain exactly the six specified tags in order.`);
  }
  record.content = SCREENSHOT_ONLY_NOTE;
  if (!record.source.includes('不属于公开 API 导出')) {
    record.source = `${record.source}（${RECOVERED_SOURCE_NOTE}）`;
  }
  record.is_demo = 0;
  return record;
}

function recordValues(row, fields, name) {
  const values = fields.map((field) => {
    if (field === 'tags') return serializeTags(row[field], name);
    if (field === 'is_demo') return row[field] == null ? 0 : row[field];
    return row[field] === undefined ? null : row[field];
  });
  if (!Number.isSafeInteger(values[0]) || values[0] < 1) {
    throw new Error(`${name} contains a missing or invalid id.`);
  }
  if (values[fields.indexOf('is_demo')] !== 0 && values[fields.indexOf('is_demo')] !== 1) {
    throw new Error(`${name}.is_demo must be 0 or 1.`);
  }
  return values;
}

async function loadAndValidateBackup(backupDir) {
  const manifest = await fs.readFile(path.join(backupDir, 'SHA256SUMS.txt'), 'utf8');
  const recoveredPath = path.join(backupDir, RECOVERED_FILE);
  let recoveredExists = false;
  try {
    await fs.access(recoveredPath);
    recoveredExists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const checksums = new Map();
  for (const line of manifest.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+[* ]?([A-Za-z0-9_.-]+)$/);
    if (!match || checksums.has(match[2])) throw new Error('Invalid or duplicate entry in SHA256SUMS.txt.');
    checksums.set(match[2], match[1].toLowerCase());
  }
  const expectedFiles = recoveredExists ? [...FILES, RECOVERED_FILE] : FILES;
  if (checksums.size !== expectedFiles.length || expectedFiles.some((file) => !checksums.has(file))) {
    throw new Error('SHA256SUMS.txt must contain exactly the expected backup files, including the recovered record when present.');
  }

  for (const file of expectedFiles) {
    const bytes = await fs.readFile(path.join(backupDir, file));
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== checksums.get(file)) throw new Error(`SHA-256 verification failed for ${file}.`);
  }

  const [artists, documents, exhibitions, timeline, settings, metadata] = await Promise.all([
    readJson(backupDir, 'artists.json'),
    readJson(backupDir, 'documents.json'),
    readJson(backupDir, 'exhibitions.json'),
    readJson(backupDir, 'timeline.json'),
    readJson(backupDir, 'settings.json'),
    readJson(backupDir, 'metadata.json')
  ]);
  const recovered = recoveredExists ? await readJson(backupDir, RECOVERED_FILE) : null;
  assertRecordArray(artists, 'artists.json');
  assertRecordArray(documents, 'documents.json');
  assertRecordArray(exhibitions, 'exhibitions.json');
  assertRecordArray(timeline, 'timeline.json');
  for (const [rows, fields] of [
    [artists, ['portrait']],
    [exhibitions, ['poster']],
    [documents, ['cover', 'file_path']]
  ]) {
    if (rows.some((row) => fields.some(
      (field) => typeof row[field] === 'string' && row[field].startsWith('/uploads/')
    ))) {
      throw new Error('The backup references /uploads/ files that this importer does not transfer.');
    }
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings.json must be a JSON object.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('metadata.json must be a JSON object.');
  }

  const counts = {
    documents: documents.length,
    artists: artists.length,
    exhibitions: exhibitions.length,
    timeline: timeline.length,
    settings: Object.keys(settings).length
  };
  for (const [name, count] of Object.entries(counts)) {
    if (metadata[METADATA_COUNT_FIELDS[name]] !== count) {
      throw new Error(`Backup metadata count mismatch for ${name}.`);
    }
  }

  const artistIds = assertUniqueIds(artists, 'artists');
  const exhibitionIds = assertUniqueIds(exhibitions, 'exhibitions');
  const documentIds = assertUniqueIds(documents, 'documents');
  const documentCodes = new Set();
  for (const document of documents) {
    if (typeof document.code !== 'string' || !document.code || documentCodes.has(document.code)) {
      throw new Error('documents contains a missing or duplicate document code.');
    }
    documentCodes.add(document.code);
  }
  assertUniqueIds(timeline, 'timeline');
  if (recovered) {
    validateRecoveredDocument(recovered, documentIds);
    if (documentCodes.has(recovered.code)) {
      throw new Error(`${RECOVERED_FILE} duplicates a public-export document code.`);
    }
    documentIds.add(recovered.id);
    documentCodes.add(recovered.code);
    documents.push(recovered);
  }

  const links = { artists: [], exhibitions: [] };
  for (const document of documents) {
    for (const [relation, validIds] of [
      ['artists', artistIds],
      ['exhibitions', exhibitionIds]
    ]) {
      if (!Array.isArray(document[relation])) {
        throw new Error(`Document relationships for ${relation} must be arrays.`);
      }
      const seen = new Set();
      for (const related of document[relation]) {
        const id = related && typeof related === 'object' ? related.id : related;
        if (!Number.isSafeInteger(id) || !validIds.has(id)) {
          throw new Error(`A document has an invalid ${relation} relationship.`);
        }
        if (seen.has(id)) throw new Error(`A document has a duplicate ${relation} relationship.`);
        seen.add(id);
        links[relation].push([document.id, id]);
      }
    }
  }

  for (const [key, value] of Object.entries(settings)) {
    if (!key || (value !== null && typeof value !== 'string')) {
      throw new Error('Settings keys must be non-empty and values must be strings or null.');
    }
  }

  return {
    artists,
    documents,
    exhibitions,
    timeline,
    settings,
    links,
    counts,
    recoveredDocumentCount: recovered ? 1 : 0
  };
}

async function importBackup(data) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be supplied through the process environment; credentials are never read from a file.');
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(`LOCK TABLE ${TABLES.map((table) => `public.${table}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);

    for (const table of TABLES) {
      const result = await client.query(`SELECT COUNT(*)::text AS count FROM public.${table}`);
      if (BigInt(result.rows[0].count) !== 0n) {
        throw new Error(`Refusing import: public.${table} is not empty.`);
      }
    }

    for (const table of ['artists', 'exhibitions', 'documents', 'timeline']) {
      for (const row of data[table]) {
        await insertRow(client, table, FIELDS[table], row);
      }
    }
    for (const [documentId, artistId] of data.links.artists) {
      await client.query(
        'INSERT INTO public.doc_artists (document_id, artist_id) VALUES ($1, $2)',
        [documentId, artistId]
      );
    }
    for (const [documentId, exhibitionId] of data.links.exhibitions) {
      await client.query(
        'INSERT INTO public.doc_exhibitions (document_id, exhibition_id) VALUES ($1, $2)',
        [documentId, exhibitionId]
      );
    }
    for (const [key, value] of Object.entries(data.settings)) {
      await client.query('INSERT INTO public.settings (key, value) VALUES ($1, $2)', [key, value]);
    }
    for (const table of ['artists', 'exhibitions', 'documents', 'timeline']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM public.${table}`
      );
    }

    await client.query('COMMIT');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        throw new Error('Import failed and PostgreSQL rollback also failed; verify the destination before retrying.');
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function insertRow(client, table, fields, row) {
  const values = recordValues(row, fields, `${table} record`);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(
    `INSERT INTO public.${table} (${fields.join(', ')}) VALUES (${placeholders})`,
    values
  );
}

async function main(args) {
  const { backupDir, apply } = parseArgs(args);
  const data = await loadAndValidateBackup(backupDir);
  console.log('Backup verified: SHA-256, metadata counts, IDs, and relationships.');
  console.log(`Records to import: ${JSON.stringify(data.counts)}; ` +
    `recovered records=${data.recoveredDocumentCount}; ` +
    `document-artist links=${data.links.artists.length}; ` +
    `document-exhibition links=${data.links.exhibitions.length}.`);
  if (!apply) {
    console.log('Dry run only. No database connection was opened. Add --apply to import into an empty PostgreSQL schema.');
    return;
  }
  await importBackup(data);
  console.log('Import committed. All target tables were empty before import; serial sequences were advanced.');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Import stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { loadAndValidateBackup, parseArgs };
