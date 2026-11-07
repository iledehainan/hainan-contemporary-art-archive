'use strict';

const fs = require('node:fs/promises');
const { inflateRawSync } = require('node:zlib');
const { TextDecoder } = require('node:util');

const TARGET_ENTRY = 'data/content-export.json';
const MAX_ZIP_ENTRIES = 4096;
const MAX_CENTRAL_DIRECTORY_SIZE = 16 * 1024 * 1024;
const MAX_EXPORT_SIZE = 16 * 1024 * 1024;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readExtraFields(extra, name) {
  let offset = 0;
  while (offset < extra.length) {
    if (offset + 4 > extra.length) throw new Error(`Invalid ZIP extra fields for ${name}.`);
    const id = extra.readUInt16LE(offset);
    const length = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + length > extra.length) throw new Error(`Invalid ZIP extra fields for ${name}.`);
    if (id === 0x0001 || id === 0x7075) {
      throw new Error(`Unsupported ZIP64 or alternate-path metadata for ${name}.`);
    }
    offset += length;
  }
}

function decodeEntryName(bytes, flags) {
  if (!(flags & 0x0800) && bytes.some((byte) => byte > 0x7f)) {
    throw new Error('ZIP entry names must use UTF-8 encoding.');
  }
  let name;
  try {
    name = utf8Decoder.decode(bytes);
  } catch {
    throw new Error('ZIP contains an invalid UTF-8 entry name.');
  }
  if (name.includes('/') && name.includes('\\')) {
    throw new Error('ZIP entry paths must not mix slash styles.');
  }
  const normalizedName = name.replace(/\\/g, '/');
  const isDirectory = normalizedName.endsWith('/');
  const components = normalizedName.split('/');
  if (isDirectory) components.pop();
  if (!name || normalizedName.startsWith('/') || /^[A-Za-z]:/.test(normalizedName) ||
      components.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('ZIP contains an unsafe or ambiguous entry path.');
  }
  return { name, normalizedName, isDirectory };
}

function assertSupportedFlags(flags, name) {
  if (flags & ~0x080e) throw new Error(`Unsupported or encrypted ZIP entry: ${name}.`);
}

async function readRange(handle, fileSize, position, length, label) {
  if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length) ||
      position < 0 || length < 0 || position + length > fileSize) {
    throw new Error(`Invalid ZIP bounds for ${label}.`);
  }
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new Error(`Truncated ZIP data for ${label}.`);
    offset += bytesRead;
  }
  return buffer;
}

function findEndOfCentralDirectory(tail, absoluteStart) {
  const matches = [];
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === tail.length) matches.push(offset);
  }
  if (matches.length !== 1) throw new Error('ZIP end-of-directory record is missing or ambiguous.');
  return absoluteStart + matches[0];
}

async function readTargetEntry(handle, fileSize, entry, centralDirectoryOffset) {
  if (entry.isDirectory || ![0, 8].includes(entry.method) ||
      entry.uncompressedSize > MAX_EXPORT_SIZE || entry.compressedSize > MAX_EXPORT_SIZE) {
    throw new Error(`${TARGET_ENTRY} has an unsupported ZIP format or exceeds the size limit.`);
  }

  const localHeader = await readRange(handle, fileSize, entry.localOffset, 30, TARGET_ENTRY);
  if (localHeader.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Invalid local ZIP header for ${TARGET_ENTRY}.`);
  }
  const localFlags = localHeader.readUInt16LE(6);
  const localMethod = localHeader.readUInt16LE(8);
  const localCrc = localHeader.readUInt32LE(14);
  const localCompressedSize = localHeader.readUInt32LE(18);
  const localUncompressedSize = localHeader.readUInt32LE(22);
  const nameLength = localHeader.readUInt16LE(26);
  const extraLength = localHeader.readUInt16LE(28);
  const variable = await readRange(
    handle,
    fileSize,
    entry.localOffset + 30,
    nameLength + extraLength,
    TARGET_ENTRY
  );
  const localName = variable.subarray(0, nameLength);
  const localExtra = variable.subarray(nameLength);
  readExtraFields(localExtra, TARGET_ENTRY);
  assertSupportedFlags(localFlags, TARGET_ENTRY);
  if (!localName.equals(entry.nameBytes) || localFlags !== entry.flags || localMethod !== entry.method) {
    throw new Error(`ZIP local and central headers disagree for ${TARGET_ENTRY}.`);
  }

  const usesDataDescriptor = Boolean(entry.flags & 0x0008);
  const localValuesMatch = (localCrc === 0 || localCrc === entry.crc) &&
    (localCompressedSize === 0 || localCompressedSize === entry.compressedSize) &&
    (localUncompressedSize === 0 || localUncompressedSize === entry.uncompressedSize);
  if ((!usesDataDescriptor &&
      (localCrc !== entry.crc || localCompressedSize !== entry.compressedSize ||
       localUncompressedSize !== entry.uncompressedSize)) ||
      (usesDataDescriptor && !localValuesMatch)) {
    throw new Error(`ZIP size or checksum metadata disagrees for ${TARGET_ENTRY}.`);
  }

  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > centralDirectoryOffset) {
    throw new Error(`Invalid compressed-data bounds for ${TARGET_ENTRY}.`);
  }
  const compressed = await readRange(handle, fileSize, dataOffset, entry.compressedSize, TARGET_ENTRY);
  if (usesDataDescriptor) {
    const available = centralDirectoryOffset - dataEnd;
    if (available < 12) throw new Error(`ZIP data descriptor is truncated for ${TARGET_ENTRY}.`);
    const descriptor = await readRange(
      handle,
      fileSize,
      dataEnd,
      Math.min(available, 16),
      `${TARGET_ENTRY} data descriptor`
    );
    const matches = [];
    if (descriptor.length >= 12) {
      matches.push(descriptor.readUInt32LE(0) === entry.crc &&
        descriptor.readUInt32LE(4) === entry.compressedSize &&
        descriptor.readUInt32LE(8) === entry.uncompressedSize);
    }
    if (descriptor.length >= 16 && descriptor.readUInt32LE(0) === 0x08074b50) {
      matches.push(descriptor.readUInt32LE(4) === entry.crc &&
        descriptor.readUInt32LE(8) === entry.compressedSize &&
        descriptor.readUInt32LE(12) === entry.uncompressedSize);
    }
    if (matches.filter(Boolean).length !== 1) {
      throw new Error(`ZIP data descriptor disagrees for ${TARGET_ENTRY}.`);
    }
  }
  let contents;
  try {
    contents = entry.method === 0
      ? compressed
      : inflateRawSync(compressed, { maxOutputLength: MAX_EXPORT_SIZE });
  } catch {
    throw new Error(`Unable to decompress ${TARGET_ENTRY}.`);
  }
  if (contents.length !== entry.uncompressedSize || crc32(contents) !== entry.crc) {
    throw new Error(`ZIP size or CRC-32 verification failed for ${TARGET_ENTRY}.`);
  }
  return contents;
}

async function readContentExportFromZip(zipPath) {
  const handle = await fs.open(zipPath, 'r');
  try {
    const { size: fileSize } = await handle.stat();
    if (fileSize < 22) throw new Error('The input is not a valid ZIP archive.');
    const tailLength = Math.min(fileSize, 22 + 0xffff);
    const tailStart = fileSize - tailLength;
    const tail = await readRange(handle, fileSize, tailStart, tailLength, 'end-of-directory record');
    const endOffset = findEndOfCentralDirectory(tail, tailStart);
    const end = tail.subarray(endOffset - tailStart);
    const diskNumber = end.readUInt16LE(4);
    const centralDisk = end.readUInt16LE(6);
    const entriesOnDisk = end.readUInt16LE(8);
    const entryCount = end.readUInt16LE(10);
    const centralSize = end.readUInt32LE(12);
    const centralOffset = end.readUInt32LE(16);
    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount ||
        entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff ||
        entryCount > MAX_ZIP_ENTRIES || centralSize > MAX_CENTRAL_DIRECTORY_SIZE ||
        centralOffset + centralSize !== endOffset) {
      throw new Error('ZIP is multi-disk, ZIP64, oversized, or has ambiguous directory bounds.');
    }

    const directory = await readRange(handle, fileSize, centralOffset, centralSize, 'central directory');
    const names = new Set();
    const targetMatches = [];
    let offset = 0;
    let parsedEntries = 0;
    while (offset < directory.length) {
      if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error('Invalid ZIP central directory.');
      }
      const flags = directory.readUInt16LE(offset + 8);
      const method = directory.readUInt16LE(offset + 10);
      const crc = directory.readUInt32LE(offset + 16);
      const compressedSize = directory.readUInt32LE(offset + 20);
      const uncompressedSize = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      const diskStart = directory.readUInt16LE(offset + 34);
      const externalAttributes = directory.readUInt32LE(offset + 38);
      const localOffset = directory.readUInt32LE(offset + 42);
      const recordLength = 46 + nameLength + extraLength + commentLength;
      if (offset + recordLength > directory.length) throw new Error('Truncated ZIP central directory.');
      if (diskStart !== 0 || compressedSize === 0xffffffff ||
          uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        throw new Error('ZIP64 or multi-disk entries are not supported.');
      }
      const nameBytes = directory.subarray(offset + 46, offset + 46 + nameLength);
      const extra = directory.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
      readExtraFields(extra, 'ZIP entry');
      const { name, normalizedName, isDirectory } = decodeEntryName(nameBytes, flags);
      assertSupportedFlags(flags, name);
      const unixHost = directory.readUInt16LE(offset + 4) >>> 8;
      const unixMode = externalAttributes >>> 16;
      const unixFileType = unixMode & 0xf000;
      if (unixHost === 3 && unixFileType === 0xa000) {
        throw new Error('ZIP symbolic links are not supported.');
      }
      const canonicalName = normalizedName.toLocaleLowerCase('en-US');
      if (names.has(canonicalName)) throw new Error('ZIP contains duplicate or case-ambiguous entry paths.');
      names.add(canonicalName);

      const entryParts = normalizedName.split('/');
      const targetLocation = entryParts.slice(-2).join('/');
      if (targetLocation.toLocaleLowerCase('en-US') === TARGET_ENTRY.toLocaleLowerCase('en-US')) {
        if (targetLocation !== TARGET_ENTRY || (entryParts.length !== 2 && entryParts.length !== 3)) {
          throw new Error(`ZIP must contain ${TARGET_ENTRY}, optionally under one root folder.`);
        }
        if ((unixHost === 3 && unixFileType !== 0 && unixFileType !== 0x8000) ||
            (externalAttributes & 0x10) !== 0) {
          throw new Error(`${TARGET_ENTRY} must be a regular file.`);
        }
        targetMatches.push({
          name,
          normalizedName,
          nameBytes: Buffer.from(nameBytes),
          isDirectory,
          flags,
          method,
          crc,
          compressedSize,
          uncompressedSize,
          localOffset
        });
      }
      offset += recordLength;
      parsedEntries += 1;
    }
    if (offset !== directory.length || parsedEntries !== entryCount) {
      throw new Error('ZIP central directory entry count is inconsistent.');
    }
    if (targetMatches.length !== 1) throw new Error(`ZIP must contain exactly one ${TARGET_ENTRY}.`);
    return await readTargetEntry(handle, fileSize, targetMatches[0], centralOffset);
  } finally {
    await handle.close();
  }
}

module.exports = { readContentExportFromZip };
