import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production migrations 021 and 022 remain sequential, backed up, checksum-bound and transactional', async () => {
  const [workflow, runner, migration, rollback, build, dockerfile] = await Promise.all([
    read('.github/workflows/production-operator.yml'),
    read('scripts/run-production-migration.sh'),
    read('backend/migrations/versions/022_expand_category_taxonomy.sql'),
    read('backend/migrations/versions/022_expand_category_taxonomy_rollback.sql'),
    read('cloudbuild.migration.yaml'),
    read('Dockerfile.migrations')
  ]);

  assert.match(workflow, /APPLY_MIGRATION_021/);
  assert.match(workflow, /APPLY_MIGRATION_022/);
  assert.match(workflow, /APPLY_KHEDMAH_MIGRATION_\$\{MIGRATION_NUMBER\}_/);
  assert.match(workflow, /EXPECTED_BACKUP_ID: \$\{\{ inputs\.backup_id \}\}/);
  assert.match(workflow, /gcloud sql backups describe/);
  assert.match(workflow, /test "\$BACKUP_STATUS" = SUCCESSFUL/);
  assert.match(workflow, /khedmah-before-\$\{MIGRATION_NUMBER\}-/);
  assert.match(workflow, /BACKUP_AGE_SECONDS/);
  assert.match(workflow, /--max-retries[= ]0/);
  assert.match(workflow, /--set-cloudsql-instances/);
  assert.match(workflow, /DATABASE_URL=DATABASE_URL:latest/);
  assert.match(workflow, /gcloud run jobs execute/);
  assert.match(runner, /APPROVED_MIGRATION_021='021_provider_reports'/);
  assert.match(runner, /APPROVED_SHA256_021='61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698'/);
  assert.match(runner, /APPROVED_MIGRATION_022='022_expand_category_taxonomy'/);
  assert.match(runner, /APPROVED_SHA256_022='f6a8f8dd9c64b6cdbeb6eda29e53be1d48884b922b8e9aa6f2a1dcc8a6830330'/);
  const migrationSha256 = createHash('sha256').update(migration).digest('hex');
  assert.match(workflow, new RegExp(`MIGRATION_SHA256:[^\\n]+${migrationSha256}`));
  assert.match(runner, new RegExp(`APPROVED_SHA256_022='${migrationSha256}'`));
  assert.match(runner, /MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_MISSING/);
  assert.match(runner, /MIGRATION_022_NONCANONICAL_ACTIVE_POSTCONDITION_FAILED/);
  assert.match(runner, /MIGRATION_022_BEFORE_IMAGE_POSTCONDITION_FAILED/);
  assert.match(migration, /CREATE TABLE category_taxonomy_022_before_image/);
  assert.match(migration, /INSERT INTO category_taxonomy_022_before_image/);
  assert.match(rollback, /UPDATE categories AS category[\s\S]*FROM category_taxonomy_022_before_image AS before_image/);
  assert.match(rollback, /status = before_image\.status/);
  assert.match(rollback, /name_ar = before_image\.name_ar/);
  assert.match(rollback, /DROP TABLE category_taxonomy_022_before_image/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN.*organization_id/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /BEGIN;/);
  assert.match(runner, /COMMIT;/);
  assert.match(runner, /MIGRATION_021_APPLIED_AND_VERIFIED/);
  assert.match(runner, /MIGRATION_022_APPLIED_AND_VERIFIED/);
  assert.match(build, /Dockerfile\.migrations/);
  assert.match(dockerfile, /postgres:16-alpine/);
});
