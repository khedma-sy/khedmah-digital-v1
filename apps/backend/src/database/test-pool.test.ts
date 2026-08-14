import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assertSafeDisposableDatabaseName } from './test-pool';

test('destructive database guard accepts only explicit disposable names', () => {
  assert.doesNotThrow(() => assertSafeDisposableDatabaseName('khedmah_contact_test'));
  assert.doesNotThrow(() => assertSafeDisposableDatabaseName('pr_80_ci'));
  for (const name of ['', 'postgres', 'template1', 'khedmah', 'khedmah_dev', 'production', 'customer_data']) {
    assert.throws(() => assertSafeDisposableDatabaseName(name), /UNSAFE_DESTRUCTIVE_DATABASE_TARGET/);
  }
});

test('CI database jobs explicitly use an approved disposable target', async () => {
  for (const workflow of ['node.js.yml', 'test-and-verify.yml', 'preview-deployment.yml']) {
    const source = await readFile(new URL(`../../../../.github/workflows/${workflow}`, import.meta.url), 'utf8');
    assert.match(source, /POSTGRES_DB: khedmah_ci/);
    assert.match(source, /PGDATABASE: khedmah_ci/);
    assert.match(source, /ALLOW_DESTRUCTIVE_DB_TESTS: 'true'/);
    assert.doesNotMatch(source, /(?:POSTGRES_DB|PGDATABASE): khedmah_dev/);
  }
});
