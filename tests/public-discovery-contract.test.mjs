import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('public discovery queries exclude the known production fixture', async () => {
  const repository = await readFile(new URL('../apps/backend/src/business-profiles/business-profile.repository.ts', import.meta.url), 'utf8');
  const exclusions = repository.match(/LOWER\(name\) <> 'khedmah production test'/g) ?? [];

  assert.ok(exclusions.length >= 3, 'featured, recently-added and search/map queries must all exclude the production fixture');
});
