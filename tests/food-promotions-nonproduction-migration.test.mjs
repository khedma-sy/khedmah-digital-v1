import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, rollback, runner, ensure, deploy, dockerfile, cloudbuild, productionOperator] = await Promise.all([
  read('backend/migrations/versions/034_food_order_promotions.sql'),
  read('backend/migrations/versions/034_food_order_promotions_rollback.sql'),
  read('scripts/deployment/run-food-promotions-nonproduction-migration.sh'),
  read('scripts/deployment/ensure-food-promotions-nonproduction-schema.sh'),
  read('scripts/deployment/deploy-cloud-run-environment.sh'),
  read('Dockerfile.food-promotions-migration'),
  read('cloudbuild.food-promotions-migration.yaml'),
  read('.github/workflows/production-operator.yml'),
]);

test('Migration 034 defines a restaurant-funded claim ledger and immutable order snapshot', () => {
  for (const required of [
    'CREATE TABLE food_promo_codes', 'merchant_business_id', 'percentage_off', 'fixed_amount',
    'minimum_subtotal', 'max_redemptions', 'per_user_limit', 'ADD COLUMN food_promo_id',
    'ADD COLUMN promo_code', 'ADD COLUMN discount_amount', 'CREATE TABLE food_promo_claims',
    "status IN ('applied','redeemed','released')", 'subtotal - discount_amount + delivery_fee',
  ]) assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(migration, /payment_gateway|platform_funded|stripe|paypal/i);
});

test('Migration 034 rollback refuses to discard live promotion or order discount data', () => {
  assert.match(rollback, /MIGRATION_034_ROLLBACK_BLOCKED/);
  assert.match(rollback, /food_promo_claims/);
  assert.match(rollback, /discount_amount <> 0/);
  assert.ok(rollback.indexOf('MIGRATION_034_ROLLBACK_BLOCKED') < rollback.indexOf('DROP TABLE food_promo_claims'));
});

test('Migration 034 reviewed identity matches runner and deploy wrapper', () => {
  const bytes = Buffer.from(migration);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const gitBlob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(sha256, '127206eb637c285b5fe8ed7bba389360562288e27cc3379d22596fb7dc2ac2dd');
  assert.equal(gitBlob, 'b59b8ae42b86bc505d9f2293579546a344e37ab1');
  for (const source of [runner, ensure]) { assert.match(source, new RegExp(sha256)); }
  assert.match(ensure, new RegExp(gitBlob));
});

test('Migration 034 runner is POSIX-valid, fail-closed and non-production only', () => {
  const runnerPath = fileURLToPath(new URL('../scripts/deployment/run-food-promotions-nonproduction-migration.sh', import.meta.url));
  const syntax = spawnSync('/bin/sh', ['-n', runnerPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || 'Migration 034 runner must parse as POSIX shell');
  for (const required of ['preview|staging', 'APPLY_KHEDMAH_NONPROD_034_', 'MIGRATION_034_REQUIRES_FULFILLMENT_026', 'MIGRATION_034_PARTIAL_OR_UNVERIFIED_STATE', "pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-food-promotions-034',0))", 'MIGRATION_034_APPLIED_AND_VERIFIED']) assert.match(runner, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(runner, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|printenv/i);
  assert.match(ensure, /Refusing food promotion schema operation on the production project/);
  assert.match(ensure, /FOOD_PROMOTIONS_034_FAILED_EXECUTION/);
  assert.match(ensure, /--max-retries 0/);
});

test('Migration 034 is applied before backend build and never exposed to the Production operator', () => {
  const gate = deploy.indexOf('ensure-food-promotions-nonproduction-schema.sh');
  const backend = deploy.indexOf('cloudbuild.${environment}-backend.yaml');
  assert.ok(gate >= 0 && backend > gate);
  assert.match(deploy, /APPLY_KHEDMAH_NONPROD_034_\$\{environment\^\^\}/);
  assert.match(dockerfile, /034_food_order_promotions\.sql/);
  assert.match(cloudbuild, /Dockerfile\.food-promotions-migration/);
  assert.doesNotMatch(productionOperator, /034_food_order_promotions|food-promotions-migration|APPLY_MIGRATION_034/);
});
