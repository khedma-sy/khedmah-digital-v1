import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('Taxi 029 pre-schema failures have stable non-secret exit codes and valid POSIX shell syntax', () => {
  const runnerPath = fileURLToPath(new URL('../scripts/deployment/run-taxi-pricing-nonproduction-migration.sh', import.meta.url));
  const runner = read('scripts/deployment/run-taxi-pricing-nonproduction-migration.sh');
  const syntax = spawnSync('/bin/sh', ['-n', runnerPath], { encoding: 'utf8' });

  assert.equal(syntax.status, 0, syntax.stderr || 'Taxi 029 runner must parse as POSIX shell');
  for (const code of [61, 62, 63, 64, 65, 66, 67, 68, 69]) {
    assert.match(runner, new RegExp(`exit ${code}(?:;|\\s)`));
  }
  assert.match(runner, /sha256sum -c - >\/dev\/null 2>&1 \|\| exit 69/);
  assert.doesNotMatch(runner, /DATABASE_URL[^\n]*echo|PGPASSWORD[^\n]*echo|printenv/i);
});

test('Taxi 029 deployment propagates bounded failed-execution diagnostics without weakening fail-closed behavior', () => {
  const ensure = read('scripts/deployment/ensure-taxi-pricing-nonproduction-schema.sh');

  assert.match(ensure, /set \+e\s+execution_output="\$\(gcloud run jobs execute/);
  assert.match(ensure, /execution_status=\$\?/);
  assert.match(ensure, /TAXI_029_FAILED_EXECUTION=\$\{execution_name\}/);
  assert.match(ensure, /TAXI_029_CONTAINER_LOGS_BEGIN/);
  assert.match(ensure, /resource\.type=\\"cloud_run_job\\" AND resource\.labels\.job_name=\\"\$\{job\}\\"/);
  assert.match(ensure, /--freshness=30m/);
  assert.match(ensure, /--limit=200/);
  assert.match(ensure, /exit "\$execution_status"/);
  assert.doesNotMatch(ensure, /DATABASE_URL=.*echo|PGPASSWORD|printenv|env\s*$/m);
});
