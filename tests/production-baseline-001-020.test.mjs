import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
