import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeDisposableDatabaseName } from './test-pool';

test('destructive database guard accepts only explicit disposable names', () => {
  assert.doesNotThrow(() => assertSafeDisposableDatabaseName('khedmah_contact_test'));
  assert.doesNotThrow(() => assertSafeDisposableDatabaseName('pr_80_ci'));
  for (const name of ['', 'postgres', 'template1', 'khedmah', 'khedmah_dev', 'production', 'customer_data']) {
    assert.throws(() => assertSafeDisposableDatabaseName(name), /UNSAFE_DESTRUCTIVE_DATABASE_TARGET/);
  }
});
