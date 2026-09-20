import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('non-production Product Store migration 024 is checksum-bound, isolated, idempotent and ordered before Classifieds 025', async () => {
  const [runner, wrapper, migration, deploy, dockerfile, build] = await Promise.all([
    read('scripts/deployment/run-product-store-nonproduction-migration.sh'),
    read('scripts/deployment/ensure-product-store-nonproduction-schema.sh'),
    read('backend/migrations/versions/024_product_store.sql'),
    read('scripts/deployment/deploy-cloud-run-environment.sh'),
    read('Dockerfile.product-store-migration'),
    read('cloudbuild.product-store-migration.yaml')
  ]);

  const sha = createHash('sha256').update(migration).digest('hex');
  assert.equal(sha, 'd2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6');
  assert.match(runner, new RegExp(`APPROVED_SHA256='${sha}'`));
  assert.match(runner, /preview\|staging/);
  assert.match(runner, /Refusing Product Store migration 024 against the production project/);
  assert.match(runner, /APPLY_KHEDMAH_NONPROD_024_/);
  assert.match(runner, /category_taxonomy_022_before_image/);
  assert.match(runner, /MIGRATION_024_ALREADY_APPLIED_AND_VERIFIED/);
  assert.match(runner, /MIGRATION_024_APPLIED_AND_VERIFIED/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /BEGIN;/);
  assert.match(runner, /COMMIT;/);

  assert.match(wrapper, /GOOGLE_CLOUD_PROJECT.*PRODUCTION_GOOGLE_CLOUD_PROJECT/s);
  assert.match(wrapper, /DATABASE_URL=DATABASE_URL:latest/);
  assert.match(wrapper, /--service-account "\$RUNTIME_SERVICE_ACCOUNT"/);
  assert.match(wrapper, /cloudbuild\.product-store-migration\.yaml/);
  assert.doesNotMatch(wrapper, /production-operator/);

  const productStoreGate = deploy.indexOf('ensure-product-store-nonproduction-schema.sh');
  const classifiedsGate = deploy.indexOf('ensure-classifieds-nonproduction-schema.sh');
  assert.ok(productStoreGate >= 0);
  assert.ok(classifiedsGate > productStoreGate);

  assert.match(dockerfile, /024_product_store\.sql/);
  assert.match(dockerfile, /run-product-store-nonproduction-migration/);
  assert.match(build, /Dockerfile\.product-store-migration/);
  assert.match(build, /product-store-migration/);
});
