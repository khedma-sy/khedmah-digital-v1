import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('database migrator does not redefine governed professional_profiles schema', async () => {
  const source = await readFile(new URL('./database.migrator.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS professional_profiles \(/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS professional_directory_profiles \(/);
});
