import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('migration 029 emits a safe structural fingerprint and stays fail-closed', () => {
  const runner = read('scripts/deployment/run-taxi-pricing-nonproduction-migration.sh');

  assert.match(runner, /MIGRATION_029_FINGERPRINT:identity=\$\{base\}:table=\$\{table_count\}:function=\$\{function_count\}:trigger=\$\{trigger_count\}:index=\$\{index_count\}:unique_constraint=\$\{unique_constraint\}:ceiling_constraint=\$\{ceiling_constraint\}/);
  assert.match(runner, /if \[ "\$state" = 'partial_or_unverified' \]; then\s+schema_fingerprint >&2/);
  assert.match(runner, /partial_or_unverified\) exit 44/);
  assert.match(runner, /\[ "\$state" = 'not_applied' \] \|\| exit_for_state "\$state"/);

  // Diagnostics disclose only object-presence/count metadata, never row contents or credentials.
  assert.doesNotMatch(runner, /MIGRATION_029_FINGERPRINT:[^\n]*(DATABASE_URL|PGPASSWORD|session|token|user_id)/i);
});
