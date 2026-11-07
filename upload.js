'use strict';

const path = require('node:path');

const MAX_FILE_SIZE = 24 * 1024 * 1024;
const MAX_BODY_SIZE = Math.ceil(MAX_FILE_SIZE / 3) * 4 + 64 * 1024;

function parseUpload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('文件信息格式错误'), { status: 400 });
  }
  const filename = path.basename(String(body.filename || ''));
  const ext = path.extname(filename).toLowerCase();
  const allowed = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf'
  };
  const expectedType = allowed[ext];
  if (!expectedType) {
    throw Object.assign(new Error('仅支持 jpg / png / webp / gif 图片和 PDF 文件'), { status: 400 });
  }

  const raw = String(body.data || '');
  const match = raw.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  const base64 = match ? match[2] : raw;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw Object.assign(new Error('文件解析失败'), { status: 400 });
  }
  if (match && match[1].toLowerCase() !== expectedType) {
    throw Object.assign(new Error('文件类型与扩展名不匹配'), { status: 400 });
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.toString('base64') !== base64) {
    throw Object.assign(new Error('文件解析失败'), { status: 400 });
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error('单个文件不能超过 24 MiB'), { status: 413 });
  }

  const signatures = {
    '.jpg': () => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    '.jpeg': () => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    '.png': () => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    '.webp': () => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
    '.gif': () => buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6)),
    '.pdf': () => buffer.toString('ascii', 0, 5) === '%PDF-'
  };
  if (!signatures[ext]()) {
    throw Object.assign(new Error('文件内容与所选类型不匹配'), { status: 400 });
  }

  return { buffer, ext };
}

module.exports = { MAX_FILE_SIZE, MAX_BODY_SIZE, parseUpload };
