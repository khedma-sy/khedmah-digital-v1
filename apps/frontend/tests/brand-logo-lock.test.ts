import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const sourcePath = resolve(process.cwd(), 'app/components/brand-mark.tsx');

const APPROVED_UMBRELLA_PATHS = [
  'M14 53C18 27 36 10 60 10s42 17 46 43c-11-8-23-10-34-3-7-9-17-9-24 0-11-7-23-5-34 3Z',
  'M48 50c3-22 7-34 12-40 6 7 10 19 12 40-8-8-16-8-24 0Z',
  'M72 50c11-7 23-5 34 3-4-20-14-33-28-39 4 9 7 21 8 36-5-2-9-2-14 0Z',
  'M60 10v62',
  'M60 72v24c0 11 16 11 16 0'
] as const;

const APPROVED_UMBRELLA_COLORS = ['#07427c', '#81be49', '#fd9603', '#fafafa'] as const;

test('approved umbrella geometry remains unchanged', async () => {
  const source = await readFile(sourcePath, 'utf8');
  for (const path of APPROVED_UMBRELLA_PATHS) {
    assert.match(source, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /viewBox="0 0 120 126"/);
});

test('approved umbrella palette remains unchanged', async () => {
  const source = await readFile(sourcePath, 'utf8');
  for (const color of APPROVED_UMBRELLA_COLORS) {
    assert.ok(source.includes(color), `Missing approved umbrella color ${color}`);
  }
});

test('brand lock does not constrain product copy outside the umbrella drawing', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.ok(source.includes('khedma-brand'));
  assert.ok(!APPROVED_UMBRELLA_PATHS.some(path => path.includes('خدمة')));
});
