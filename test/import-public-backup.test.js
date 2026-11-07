'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const {
  loadAndValidateBackup,
  loadAndValidateContentExportZip,
  parseArgs,
  validateContentExport
} = require('../scripts/import-public-backup');

const exportPath = path.join(__dirname, '..', 'data', 'content-export.json');
const exportData = require(exportPath);
const temporaryDirectories = [];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const contents = Buffer.isBuffer(entry.contents) ? entry.contents : Buffer.from(entry.contents);
    const method = entry.method == null ? 8 : entry.method;
    const compressed = method === 8 ? deflateRawSync(contents) : contents;
    const crc = entry.crc == null ? crc32(contents) : entry.crc;
    const usesDescriptor = Boolean(entry.dataDescriptor);
    const flags = entry.flags == null ? 0x0800 | (usesDescriptor ? 0x0008 : 0) : entry.flags;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(usesDescriptor ? 0 : crc, 14);
    local.writeUInt32LE(usesDescriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(usesDescriptor ? 0 : contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localRecords.push(local, name, compressed);
    if (usesDescriptor) {
      const descriptor = Buffer.alloc(entry.descriptorSignature ? 16 : 12);
      let descriptorOffset = 0;
      if (entry.descriptorSignature) {
        descriptor.writeUInt32LE(0x08074b50, descriptorOffset);
        descriptorOffset += 4;
      }
      descriptor.writeUInt32LE(entry.descriptorCrc == null ? crc : entry.descriptorCrc, descriptorOffset);
      descriptor.writeUInt32LE(compressed.length, descriptorOffset + 4);
      descriptor.writeUInt32LE(contents.length, descriptorOffset + 8);
      localRecords.push(descriptor);
    }

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(central, name);
    localOffset += local.length + name.length + compressed.length +
      (usesDescriptor ? (entry.descriptorSignature ? 16 : 12) : 0);
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

async function writeZip(entries) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'public-backup-import-'));
  temporaryDirectories.push(directory);
  const zipPath = path.join(directory, 'content.zip');
  await fs.writeFile(zipPath, makeZip(entries));
  return zipPath;
}

test.afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

test('accepts either a checksummed backup directory or a ZIP input, but not both', () => {
  assert.deepEqual(parseArgs(['--backup-dir', 'private']), {
    backupDir: path.resolve('private'),
    backupZip: null,
    apply: false
  });
  assert.deepEqual(parseArgs(['--backup-zip', 'export.zip']), {
    backupDir: null,
    backupZip: path.resolve('export.zip'),
    apply: false
  });
  assert.throws(() => parseArgs([]), /exactly one/);
  assert.throws(() => parseArgs(['--backup-dir', 'private', '--backup-zip', 'export.zip']), /exactly one/);
});

test('validates a checksummed legacy backup directory', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'public-backup-dir-'));
  temporaryDirectories.push(directory);
  const backup = {
    'artists.json': [],
    'documents.json': [],
    'exhibitions.json': [],
    'timeline.json': [],
    'settings.json': {},
    'metadata.json': {
      document_count: 0,
      artist_count: 0,
      exhibition_count: 0,
      timeline_count: 0,
      settings_count: 0
    }
  };
  const manifest = [];
  for (const [filename, value] of Object.entries(backup)) {
    const contents = Buffer.from(JSON.stringify(value));
    await fs.writeFile(path.join(directory, filename), contents);
    manifest.push(`${crypto.createHash('sha256').update(contents).digest('hex')}  ${filename}`);
  }
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${manifest.join('\n')}\n`);
  const loaded = await loadAndValidateBackup(directory);
  assert.deepEqual(loaded.counts, { documents: 0, artists: 0, exhibitions: 0, timeline: 0, settings: 0 });
});

test('converts the public ZIP export and preserves entity and relationship counts', async () => {
  const zipPath = await writeZip([
    { name: '海南当代艺术文献网站\\data\\content-export.json', contents: JSON.stringify(exportData) },
    { name: '海南当代艺术文献网站\\data\\archive.db', contents: 'ignored database payload', method: 99 },
    { name: '海南当代艺术文献网站\\uploads\\', contents: '', method: 0 }
  ]);
  const loaded = await loadAndValidateContentExportZip(zipPath);
  assert.deepEqual(loaded.counts, {
    documents: 34,
    artists: 21,
    exhibitions: 18,
    timeline: 29,
    settings: 0
  });
  assert.equal(loaded.links.artists.length, 73);
  assert.equal(loaded.links.exhibitions.length, 21);
  assert.equal(loaded.recoveredDocumentCount, 0);
  assert.equal(
    loaded.documents.find((document) => document.id === 14).artists.length,
    exportData.tables.doc_artists.filter((link) => link.document_id === 14).length
  );
});

test('rejects ambiguous ZIP paths, duplicate entries, encryption, and invalid CRC values', async (t) => {
  await t.test('rejects paths that are not the exact export path', async () => {
    const zipPath = await writeZip([{ name: '../data/content-export.json', contents: '{}' }]);
    await assert.rejects(loadAndValidateContentExportZip(zipPath), /unsafe or ambiguous entry path/);
  });
  await t.test('rejects duplicate export entries', async () => {
    const zipPath = await writeZip([
      { name: 'data/content-export.json', contents: '{}' },
      { name: 'data/content-export.json', contents: '{}' }
    ]);
    await assert.rejects(loadAndValidateContentExportZip(zipPath), /duplicate or case-ambiguous/);
  });
  await t.test('rejects encrypted entries', async () => {
    const zipPath = await writeZip([
      { name: 'data/content-export.json', contents: '{}', flags: 0x0801 }
    ]);
    await assert.rejects(loadAndValidateContentExportZip(zipPath), /encrypted ZIP entry/);
  });
  await t.test('rejects corrupted export checksums', async () => {
    const zipPath = await writeZip([
      { name: 'data/content-export.json', contents: '{}', crc: (crc32(Buffer.from('{}')) ^ 1) >>> 0 }
    ]);
    await assert.rejects(loadAndValidateContentExportZip(zipPath), /CRC-32 verification failed/);
  });
  await t.test('validates data descriptors and rejects inconsistent descriptor metadata', async () => {
    const contents = JSON.stringify(exportData);
    const validZipPath = await writeZip([{
      name: 'data/content-export.json',
      contents,
      dataDescriptor: true,
      descriptorSignature: true
    }]);
    const loaded = await loadAndValidateContentExportZip(validZipPath);
    assert.equal(loaded.counts.documents, 34);

    const invalidZipPath = await writeZip([{
      name: 'data/content-export.json',
      contents,
      dataDescriptor: true,
      descriptorCrc: crc32(Buffer.from(contents)) ^ 1
    }]);
    await assert.rejects(loadAndValidateContentExportZip(invalidZipPath), /data descriptor disagrees/);
  });
});

test('rejects unexpected tables, inconsistent metadata, bad relationships, and upload references', async (t) => {
  await t.test('rejects duplicate JSON keys rather than silently accepting the last value', async () => {
    const zipPath = await writeZip([{
      name: 'data/content-export.json',
      contents: '{"exported_at":"2026-11-06T07:36:47.402Z","exported_at":"2026-11-06T07:36:47.402Z"}'
    }]);
    await assert.rejects(loadAndValidateContentExportZip(zipPath), /duplicate object keys/);
  });
  await t.test('rejects non-public tables such as users or sessions', () => {
    const value = structuredClone(exportData);
    value.tables.users = [];
    assert.throws(() => validateContentExport(value), /tables has missing or unexpected fields/);
  });
  await t.test('rejects inconsistent statistics', () => {
    const value = structuredClone(exportData);
    value.stats.documents += 1;
    assert.throws(() => validateContentExport(value), /stats count mismatch/);
  });
  await t.test('rejects references to missing related records', () => {
    const value = structuredClone(exportData);
    value.tables.doc_artists[0].artist_id = 999999;
    assert.throws(() => validateContentExport(value), /relationship to a missing record/);
  });
  await t.test('rejects references to files not transferred to Storage', () => {
    const value = structuredClone(exportData);
    value.tables.documents[0].cover = '/uploads/not-in-archive.jpg';
    value.stats.digitized = 1;
    assert.throws(() => validateContentExport(value), /references.*uploads/);
  });
});

test('ZIP dry run completes without opening a database connection', async () => {
  const zipPath = await writeZip([
    { name: 'data/content-export.json', contents: JSON.stringify(exportData) }
  ]);
  const scriptPath = path.join(__dirname, '..', 'scripts', 'import-public-backup.js');
  const result = spawnSync(process.execPath, [scriptPath, '--backup-zip', zipPath], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run only\. No database connection was opened/);
  assert.match(result.stdout, /document-artist links=73/);
});
