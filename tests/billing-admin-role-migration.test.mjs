import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, rollback, workflow] = await Promise.all([
  read('backend/migrations/versions/033_billing_admin_role.sql'),
  read('backend/migrations/versions/033_billing_admin_role_rollback.sql'),
  read('.github/workflows/database-migration-check.yml')
]);

const destructiveDataSql = /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+public\.admin_roles|INSERT\s+INTO\s+public\.admin_roles)\b/i;

test('Migration 033 atomically extends the canonical admin role constraint', () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /LOCK TABLE public\.admin_roles IN ACCESS EXCLUSIVE MODE;/);
  assert.match(migration, /DROP CONSTRAINT admin_roles_role_check;/);
  assert.doesNotMatch(migration, /DROP CONSTRAINT IF EXISTS admin_roles_role_check/);
  assert.match(
    migration,
    /CHECK \(role IN \('bootstrap_admin', 'platform_admin', 'moderator', 'billing_admin'\)\);/
  );
  assert.match(migration, /COMMIT;/);
  assert.doesNotMatch(migration, destructiveDataSql);
});

test('Migration 033 rollback fails closed before narrowing roles when billing assignments exist', () => {
  const blocker = rollback.indexOf("WHERE role = 'billing_admin'");
  const failure = rollback.indexOf('MIGRATION_033_ROLLBACK_BLOCKED: billing_admin assignments exist');
  const constraintChange = rollback.indexOf('DROP CONSTRAINT admin_roles_role_check');

  assert.ok(blocker >= 0, 'rollback must inspect billing_admin assignments');
  assert.ok(failure > blocker, 'rollback must raise the governed blocking error');
  assert.ok(constraintChange > failure, 'the data guard must run before the constraint is narrowed');
  assert.match(rollback, /BEGIN;/);
  assert.match(rollback, /LOCK TABLE public\.admin_roles IN ACCESS EXCLUSIVE MODE;/);
  assert.match(rollback, /USING ERRCODE = '55000';/);
  assert.doesNotMatch(rollback, /DROP CONSTRAINT IF EXISTS admin_roles_role_check/);
  assert.match(
    rollback,
    /CHECK \(role IN \('bootstrap_admin', 'platform_admin', 'moderator'\)\);/
  );
  assert.match(rollback, /COMMIT;/);
  assert.doesNotMatch(rollback, destructiveDataSql);
});

test('Migration 033 is present in both governed workflow inventories with its safety checks', () => {
  assert.match(workflow, /^\s+033_billing_admin_role$/m);
  assert.match(workflow, /^\s+033_billing_admin_role\.sql \\$/m);
  assert.match(workflow, /^\s+033_billing_admin_role_rollback\.sql \\$/m);
  assert.match(workflow, /MIGRATION_033_ROLLBACK_BLOCKED: billing_admin assignments exist/);
  assert.match(workflow, /Migration 033 must preserve admin role assignments/);
});
