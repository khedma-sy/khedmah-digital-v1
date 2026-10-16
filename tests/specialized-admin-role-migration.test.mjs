import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, rollback, workflow, migrator] = await Promise.all([
  read('backend/migrations/versions/035_specialized_admin_roles.sql'),
  read('backend/migrations/versions/035_specialized_admin_roles_rollback.sql'),
  read('.github/workflows/database-migration-check.yml'),
  read('apps/backend/src/database/database.migrator.ts')
]);

const destructiveDataSql = /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+public\.admin_roles|INSERT\s+INTO\s+public\.admin_roles)\b/i;

test('Migration 035 atomically extends the canonical admin role constraint without assigning roles', () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /LOCK TABLE public\.admin_roles IN ACCESS EXCLUSIVE MODE;/);
  assert.match(migration, /DROP CONSTRAINT admin_roles_role_check;/);
  for (const role of ['billing_admin', 'taxi_pricing_admin', 'category_admin']) {
    assert.ok(migration.includes(`'${role}'`), `missing ${role}`);
  }
  assert.match(migration, /COMMIT;/);
  assert.doesNotMatch(migration, destructiveDataSql);
});

test('Migration 035 rollback fails closed before narrowing roles when specialized assignments exist', () => {
  const blocker = rollback.indexOf("WHERE role IN ('taxi_pricing_admin', 'category_admin')");
  const failure = rollback.indexOf('MIGRATION_035_ROLLBACK_BLOCKED: specialized admin assignments exist');
  const constraintChange = rollback.indexOf('DROP CONSTRAINT admin_roles_role_check');
  assert.ok(blocker >= 0);
  assert.ok(failure > blocker);
  assert.ok(constraintChange > failure);
  assert.match(rollback, /USING ERRCODE = '55000';/);
  assert.doesNotMatch(rollback, destructiveDataSql);
});

test('Migration 035 is governed and required by canonical startup verification', () => {
  assert.match(workflow, /^\s+035_specialized_admin_roles$/m);
  assert.match(workflow, /^\s+035_specialized_admin_roles\.sql \\$/m);
  assert.match(workflow, /^\s+035_specialized_admin_roles_rollback\.sql \\$/m);
  assert.match(workflow, /MIGRATION_035_ROLLBACK_BLOCKED: specialized admin assignments exist/);
  assert.match(migrator, /REQUIRED_CANONICAL_SCHEMA_VERSION = '035'/);
  assert.match(migrator, /admin_roles_role_check_specialized_admins/);
  assert.match(migrator, /taxi_pricing_admin/);
  assert.match(migrator, /category_admin/);
});
