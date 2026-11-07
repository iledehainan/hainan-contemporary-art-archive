'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build, buildHtml } = require('../scripts/build-github-pages');
const exported = require('../data/content-export.json');

test('builds a self-contained, read-only Pages site from the public content export', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hainan-pages-'));
  try {
    const output = await build(directory);
    const html = await fs.readFile(output, 'utf8');
    assert.match(html, /海南当代艺术文献档案/);
    assert.match(html, /window\.addEventListener\('hashchange'/);
    assert.doesNotMatch(html, /\/api\/admin|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|password_hash/);

    const start = html.indexOf('<script id="archive-data" type="application/json">');
    const contentStart = html.indexOf('>', start) + 1;
    const contentEnd = html.indexOf('</script>', contentStart);
    const embedded = JSON.parse(html.slice(contentStart, contentEnd));
    assert.equal(embedded.tables.documents.length, 34);
    assert.equal(embedded.tables.artists.length, 21);
    assert.equal(embedded.tables.exhibitions.length, 18);
    assert.equal(embedded.tables.timeline.length, 29);
    const applicationScript = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
    assert.doesNotThrow(() => new vm.Script(applicationScript));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('escapes embedded JSON so content cannot terminate the data script element', () => {
  const value = structuredClone(exported);
  value.tables.documents[0].title = '</script><script>alert(1)</script>';
  const html = buildHtml(value);
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
