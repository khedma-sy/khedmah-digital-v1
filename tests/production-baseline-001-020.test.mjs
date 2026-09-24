import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-baseline-001-020.yml', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/run-production-baseline-001-020.sh', import.meta.url), 'utf8');
const dockerfile = await readFile(new URL('../Dockerfile.production-baseline-001-020', import.meta.url), 'utf8');
const build = await readFile(new URL('../cloudbuild.production-baseline-001-020.yaml', import.meta.url), 'utf8');

test('fresh production baseline is manual, latest-main locked, backup-gated and single-shot', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /INITIALIZE_KHEDMAH_SCHEMA_001_020_/);
  assert.match(workflow, /gcloud sql backups describe/);
  assert.match(workflow, /khedmah-before-baseline-/);
  assert.match(workflow, /--tasks 1/);
  assert.match(workflow, /--parallelism 1/);
  assert.match(workflow, /--max-retries 0/);
  assert.doesNotMatch(workflow, /\npush:|\npull_request:|\nschedule:/);
});

test('baseline image and runner bind the exact 001-020 lineage by aggregate SHA-256', () => {
  for (const number of Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(3, '0'))) {
    assert.match(runner, new RegExp(`\\b${number}_[a-z0-9_]+`));
  }
  assert.match(workflow, /BASELINE_MANIFEST_SHA256/);
  assert.match(workflow, /cat "\$\{files\[@\]\}" \| sha256sum/);
  assert.match(runner, /actual_manifest_sha=.*sha256sum/);
  assert.match(runner, /baseline migration manifest checksum mismatch/);
  assert.match(dockerfile, /postgres:16-alpine/);
  assert.match(build, /Dockerfile\.production-baseline-001-020/);
});

test('baseline refuses any existing Khedmah schema and verifies 019 scope reconciliation', () => {
  assert.match(runner, /BASELINE_REQUIRES_FRESH_DATABASE/);
  assert.match(runner, /core_user_accounts/);
  assert.match(runner, /food_promo_codes/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /BEGIN;/);
  assert.match(runner, /COMMIT;/);
  assert.match(runner, /to_regclass\('public\.plans'\) IS NOT NULL/);
  assert.match(runner, /to_regclass\('public\.subscriptions'\) IS NOT NULL/);
  assert.match(runner, /BASELINE_019_SCOPE_RECONCILIATION_FAILED/);
  assert.match(runner, /BASELINE_001_020_APPLIED_AND_VERIFIED/);
});


test('baseline uses the dedicated migration identity and elevated database secret only', () => {
  assert.match(workflow, /OPERATIONS_MIGRATION_SERVICE_ACCOUNT/);
  assert.match(workflow, /--service-account "\$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"/);
  assert.match(workflow, /DATABASE_URL=DATABASE_MIGRATION_URL:latest/);
  assert.doesNotMatch(workflow, /--service-account "\$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"/);
  assert.doesNotMatch(workflow, /DATABASE_URL=DATABASE_URL:latest/);
});


// Execute the unchanged SQL-delivery tail from the real runner. The psql double
// captures stdin only; it never connects to PostgreSQL or reads secret values.
// Unlike a source regex alone, these tests detect shell expansion before psql.
const sqlDelivery = runner.slice(runner.indexOf('psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'));
assert.ok(sqlDelivery.startsWith('psql '), 'The real baseline SQL-delivery block must exist');

async function executeSqlDelivery(shell, { variable, exitCode = '0' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-baseline-delivery-'));
  try {
    const capture = join(directory, 'sql-input.txt');
    await writeFile(join(directory, 'psql'), `#!/bin/sh
set -eu
cat > "$CAPTURE_SQL"
exit "$PSQL_TEST_EXIT"
`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`,
      CAPTURE_SQL: capture, PSQL_TEST_EXIT: exitCode };
    delete env.baseline_verify;
    delete env.BASH_ENV;
    delete env.ENV;
    if (variable !== undefined) env.baseline_verify = variable;
    const result = spawnSync(shell, ['-c',
      'set -eu\nDATABASE_URL=postgresql://baseline-test.invalid/never-connect\n' + sqlDelivery],
      { env, encoding: 'utf8', timeout: 5000 });
    assert.ifError(result.error);
    let input = '';
    try { input = await readFile(capture, 'utf8'); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { ...result, input };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

for (const shell of ['sh', 'bash']) {
  test(`baseline passes literal PostgreSQL dollar quotes with unset variable under ${shell}`, async () => {
    const result = await executeSqlDelivery(shell);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.input, /^BEGIN;/);
    assert.match(result.input, /DO \$baseline_verify\$/);
    assert.match(result.input, /\$baseline_verify\$;\nCOMMIT;/);
    assert.equal((result.input.match(/^\\ir \/migrations\/\d{3}_[a-z0-9_]+\.sql$/gm) ?? []).length, 20);
    assert.match(result.input, /RAISE EXCEPTION 'BASELINE_001_020_POSTCONDITION_FAILED'/);
    assert.match(result.input, /RAISE EXCEPTION 'BASELINE_019_SCOPE_RECONCILIATION_FAILED'/);
    assert.match(result.stdout, /BASELINE_001_020_APPLIED_AND_VERIFIED/);
  });

  test(`baseline ignores a same-named environment variable under ${shell}`, async () => {
    const result = await executeSqlDelivery(shell, { variable: 'SHOULD_NOT_ENTER_SQL' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.input, /DO \$baseline_verify\$/);
    assert.doesNotMatch(result.input, /SHOULD_NOT_ENTER_SQL/);
  });

  test(`baseline propagates psql failure without announcing success under ${shell}`, async () => {
    const result = await executeSqlDelivery(shell, { exitCode: '3' });
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.input, /DO \$baseline_verify\$/);
    assert.doesNotMatch(result.stdout, /BASELINE_001_020_APPLIED_AND_VERIFIED/);
  });
}
