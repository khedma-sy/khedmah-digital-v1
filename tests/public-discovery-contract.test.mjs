import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('public discovery queries exclude all known production fixture names', async () => {
  const repository = await readFile(new URL('../apps/backend/src/business-profiles/business-profile.repository.ts', import.meta.url), 'utf8');
  const exclusions = repository.match(/LOWER\(BTRIM\((?:b\.)?name\)\) NOT IN \('khedmah production test', 'خدمة production test'\)/g) ?? [];

  assert.ok(exclusions.length >= 3, 'featured, recently-added and search/map queries must all exclude English and Arabic fixtures');
});
