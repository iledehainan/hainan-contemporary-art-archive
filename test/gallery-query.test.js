'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const galleryQuery = require('../gallery-query');

test('gallery query returns linked document, artist, and exhibition images', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE documents (id INTEGER, title TEXT, category TEXT, year INTEGER, cover TEXT);
    CREATE TABLE artists (id INTEGER, name TEXT, medium TEXT, birth_year INTEGER, portrait TEXT);
    CREATE TABLE exhibitions (id INTEGER, title TEXT, venue TEXT, year INTEGER, poster TEXT);
    INSERT INTO documents VALUES (1, '图录', '展览画册', 1998, '/uploads/book.jpg');
    INSERT INTO artists VALUES (2, '艺术家', '绘画', 1975, '/uploads/portrait.png');
    INSERT INTO exhibitions VALUES (3, '群展', '海口', 2004, '/uploads/poster.webp');
  `);

  const items = db.prepare(galleryQuery).all();
  assert.deepEqual(items.map((item) => item.type), ['exhibition', 'document', 'artist']);
  assert.deepEqual(items.map((item) => item.image), [
    '/uploads/poster.webp',
    '/uploads/book.jpg',
    '/uploads/portrait.png'
  ]);
  db.close();
});
