'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_FILE_SIZE, MAX_BODY_SIZE, parseUpload } = require('../upload');

const cases = [
  ['archive.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0x00]],
  ['archive.jpeg', 'image/jpeg', [0xff, 0xd8, 0xff, 0x00]],
  ['archive.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['archive.webp', 'image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]],
  ['archive.gif', 'image/gif', [...Buffer.from('GIF89a')]],
  ['archive.pdf', 'application/pdf', [...Buffer.from('%PDF-1.7')]]
];

for (const [filename, mime, signature] of cases) {
  test(`accepts ${filename} with a matching signature`, () => {
    const bytes = Buffer.from(signature);
    const result = parseUpload({ filename, data: `data:${mime};base64,${bytes.toString('base64')}` });
    assert.deepEqual(result.buffer, bytes);
  });
}

test('rejects SVG uploads', () => {
  assert.throws(() => parseUpload({
    filename: 'image.svg',
    data: 'data:image/svg+xml;base64,PHN2Zz4='
  }), { status: 400 });
});

test('rejects a missing or invalid upload payload', () => {
  assert.throws(() => parseUpload(null), { status: 400 });
  assert.throws(() => parseUpload([]), { status: 400 });
});

test('rejects a MIME type that does not match the file extension', () => {
  assert.throws(() => parseUpload({
    filename: 'image.png',
    data: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff]).toString('base64')}`
  }), { status: 400 });
});

test('rejects a mismatched file signature and malformed base64', () => {
  assert.throws(() => parseUpload({
    filename: 'image.png',
    data: `data:image/png;base64,${Buffer.from('not a PNG').toString('base64')}`
  }), { status: 400 });
  assert.throws(() => parseUpload({ filename: 'image.png', data: 'data:image/png;base64,###' }), { status: 400 });
});

test('request body limit leaves room for base64 and JSON overhead', () => {
  assert.ok(MAX_BODY_SIZE > Math.ceil(MAX_FILE_SIZE / 3) * 4);
});

test('rejects files larger than 24 MiB', () => {
  const bytes = Buffer.alloc(MAX_FILE_SIZE + 1);
  assert.throws(() => parseUpload({
    filename: 'large.jpg',
    data: `data:image/jpeg;base64,${bytes.toString('base64')}`
  }), { status: 413 });
});
