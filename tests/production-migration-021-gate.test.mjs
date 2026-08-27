import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production migration 021 is explicit, checksum-bound and transactional', async () => {
  const [workflow, runner, build, dockerfile] = await Promise.all([
    read('.github/workflows/production-operator.yml'),
    read('scripts/run-production-migration.sh'),
    read('cloudbuild.migration.yaml'),
    read('Dockerfile.migrations')
  ]);

  assert.match(workflow, /APPLY_MIGRATION_021/);
  assert.match(workflow, /APPLY_KHEDMAH_MIGRATION_021_/);
  assert.match(workflow, /--max-retries[= ]0/);
  assert.match(workflow, /--set-cloudsql-instances/);
  assert.match(workflow, /DATABASE_URL=DATABASE_URL:latest/);
  assert.match(workflow, /gcloud run jobs execute/);
  assert.match(runner, /APPROVED_MIGRATION='021_provider_reports'/);
  assert.match(runner, /APPROVED_SHA256='61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698'/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /BEGIN;/);
  assert.match(runner, /COMMIT;/);
  assert.match(runner, /MIGRATION_021_APPLIED_AND_VERIFIED/);
  assert.match(build, /Dockerfile\.migrations/);
  assert.match(dockerfile, /postgres:16-alpine/);
});
