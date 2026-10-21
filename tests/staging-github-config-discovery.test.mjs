import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const path = fileURLToPath(new URL('../scripts/deployment/discover-staging-github-config.sh', import.meta.url));
const script = await readFile(path, 'utf8');

test('Staging discovery is read-only and never reads secret payloads', () => {
  assert.equal(spawnSync('/bin/bash', ['-n', path]).status, 0);
  assert.match(script, /gcloud projects describe/);
  assert.match(script, /workload-identity-pools providers describe/);
  assert.match(script, /refs\/heads\/develop/);
  assert.match(script, /\.github\/workflows\/staging-deployment\.yml@refs\/heads\/develop/);
  assert.match(script, /attributeCondition/);
  assert.match(script, /gcloud sql instances list/);
  assert.match(script, /gcloud artifacts repositories list/);
  assert.match(script, /gcloud storage buckets list/);
  assert.match(script, /gcloud services list --enabled --filter='config\.name=identitytoolkit\.googleapis\.com'/);
  assert.doesNotMatch(script, /gcloud services describe identitytoolkit\.googleapis\.com/);
  assert.match(script, /gcloud secrets versions describe latest/);
  assert.match(script, /--secret DATABASE_MIGRATION_URL/);
  assert.doesNotMatch(script, /secrets versions access/);
  assert.doesNotMatch(script, /services enable/);
  assert.doesNotMatch(script, /gcloud\s+(?:sql|storage|artifacts|iam|run|secrets)[^\n]*(?:create|delete|update|deploy|add-iam-policy-binding|set-iam-policy)/);
});

test('Staging discovery reports the complete protected configuration boundary', () => {
  for (const name of [
    'GCP_WORKLOAD_IDENTITY_PROVIDER',
    'GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT',
    'GCP_STAGING_RUNTIME_SERVICE_ACCOUNT',
    'GCP_STAGING_MIGRATION_SERVICE_ACCOUNT',
    'STAGING_DATABASE_MIGRATION_SECRET_VERSION',
    'STAGING_GOOGLE_CLOUD_PROJECT_NUMBER',
    'STAGING_ARTIFACT_REPOSITORY',
    'STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME',
    'STAGING_GCS_MEDIA_BUCKET',
    'STAGING_FIREBASE_PROJECT_ID',
    'STAGING_EMAIL_FROM',
    'MISSING_STAGING_SECRET_VERSIONS',
    'UNRESOLVED_STAGING_GITHUB_CONFIGURATION'
  ]) assert.match(script, new RegExp(name));
});

test('Staging discovery rejects a missing, falsified, or Production target before any gcloud call', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'staging-discovery-identity-'));
  const marker = join(temp, 'gcloud-called');
  const fakeGcloud = join(temp, 'gcloud');
  try {
    await writeFile(fakeGcloud, `#!/bin/sh\ntouch "${marker}"\nexit 99\n`);
    await chmod(fakeGcloud, 0o755);
    for (const env of [
      { STAGING_GOOGLE_CLOUD_PROJECT: 'khedmah-staging' },
      { STAGING_GOOGLE_CLOUD_PROJECT: 'khedmah-staging', PRODUCTION_GOOGLE_CLOUD_PROJECT: 'wrong-project' },
      { STAGING_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl' },
    ]) {
      const result = spawnSync('/bin/bash', [path], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, ...env },
      });
      assert.equal(result.status, 5, result.stderr);
      assert.equal(existsSync(marker), false);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
