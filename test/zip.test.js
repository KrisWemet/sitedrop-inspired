import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, buildZip } from '../lib/zip.js';

test('crc32 matches known vectors', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.from('')), 0);
});

test('buildZip produces a structurally valid archive', () => {
  const zip = buildZip([
    { name: 'index.html', data: '<!DOCTYPE html><html></html>' },
    { name: 'robots.txt', data: 'User-agent: *\nAllow: /\n' },
  ]);
  // Local file header signature at start.
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  // End-of-central-directory signature in the last 22 bytes.
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  // Entry count.
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 2);
  // File names present.
  assert.ok(zip.includes(Buffer.from('index.html')));
  assert.ok(zip.includes(Buffer.from('robots.txt')));
});
