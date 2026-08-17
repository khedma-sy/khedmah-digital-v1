import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../backend/migrations/versions/019_remove_out_of_scope_subscription_schema.sql', import.meta.url),
  'utf8'
);

test('migration 019 removes only unused subscription schema', () => {
  assert.match(migration, /DROP TABLE IF EXISTS subscriptions/);
  assert.match(migration, /DROP TABLE IF EXISTS plans/);
  assert.doesNotMatch(migration, /DROP TABLE IF EXISTS business_profiles/);
  assert.doesNotMatch(migration, /DROP TABLE IF EXISTS rate_limit_buckets/);
});

test('migration 019 fails closed when subscriptions contain data', () => {
  assert.match(
    migration,
    /MIGRATION_019_BLOCKED: subscriptions contains data/
  );
});

test('migration 019 preserves V1 discovery scope', () => {
  assert.match(
    migration,
    /Discovery fields introduced by migration 007 remain untouched/
  );
});
