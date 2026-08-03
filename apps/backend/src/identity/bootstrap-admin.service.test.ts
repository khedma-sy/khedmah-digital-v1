/**
 * Bootstrap Admin Service — unit tests (WP-01)
 *
 * These tests run against a live PostgreSQL instance (provided in CI
 * via the test-and-verify.yml workflow service).
 */
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { Pool } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { BootstrapAdminService } from './bootstrap-admin.service';

const rawPool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: parseInt(process.env.PGPORT ?? '5432', 10),
  user: process.env.PGUSER ?? 'khedmah',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? 'khedmah_dev'
});

async function createFixture() {
  const pool = DatabasePool.fromPool(rawPool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'ar',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
      actor_user_id TEXT, request_id TEXT, correlation_id TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bootstrap_completions (
      id TEXT PRIMARY KEY,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      admin_user_id TEXT NOT NULL
    );
  `);
  return new BootstrapAdminService(pool);
}

afterEach(async () => {
  await rawPool.query(`
    DELETE FROM bootstrap_completions;
    DELETE FROM user_profiles;
    DELETE FROM user_accounts;
    DELETE FROM audit_logs;
  `).catch(() => {/* ignore if tables don't exist in this run */});
});

test('bootstrap admin: disabled when BOOTSTRAP_ADMIN_TOKEN not set', async () => {
  const service = await createFixture();
  const saved = process.env.BOOTSTRAP_ADMIN_TOKEN;
  delete process.env.BOOTSTRAP_ADMIN_TOKEN;

  const result = await service.execute('any-token');
  assert.equal(result.status, 'disabled');

  if (saved !== undefined) process.env.BOOTSTRAP_ADMIN_TOKEN = saved;
});

test('bootstrap admin: disabled when wrong token provided', async () => {
  const service = await createFixture();
  process.env.BOOTSTRAP_ADMIN_TOKEN = 'correct-token-abcdef1234567890abcdef12';
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@example.com';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'StrongPassword123!';

  const result = await service.execute('wrong-token');
  assert.equal(result.status, 'disabled');
});

test('bootstrap admin: creates administrator on first execution', async () => {
  const service = await createFixture();
  const token = 'valid-bootstrap-token-abcdef1234567890';
  process.env.BOOTSTRAP_ADMIN_TOKEN = token;
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'bootstrap-admin@khedmah.test';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'BootstrapPass123!';
  process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME = 'Bootstrap Admin';

  const result = await service.execute(token);
  assert.equal(result.status, 'created');
  assert.ok(result.adminId, 'adminId should be returned');

  // Verify account was created.
  const rows = await rawPool.query(`SELECT email FROM user_accounts WHERE id = $1`, [result.adminId]);
  assert.equal(rows.rows[0]?.email, 'bootstrap-admin@khedmah.test');

  // Verify audit log was written.
  const audit = await rawPool.query(`SELECT event_type FROM audit_logs WHERE event_type = 'bootstrap.admin.created'`);
  assert.ok(audit.rows.length > 0, 'audit log entry should exist');

  // Verify bootstrap_completions row was written.
  const completion = await rawPool.query(`SELECT admin_user_id FROM bootstrap_completions`);
  assert.equal(completion.rows[0]?.admin_user_id, result.adminId);
});

test('bootstrap admin: returns already_completed on second execution', async () => {
  const service = await createFixture();
  const token = 'valid-bootstrap-token-abcdef1234567890';
  process.env.BOOTSTRAP_ADMIN_TOKEN = token;
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'bootstrap-admin2@khedmah.test';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'BootstrapPass123!';

  const first = await service.execute(token);
  assert.equal(first.status, 'created');

  const second = await service.execute(token);
  assert.equal(second.status, 'already_completed');
});

test('bootstrap admin: password is not stored in plain text', async () => {
  const service = await createFixture();
  const token = 'valid-bootstrap-token-abcdef1234567890';
  const plainPassword = 'PlainTextPassword123!';
  process.env.BOOTSTRAP_ADMIN_TOKEN = token;
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'bootstrap-admin3@khedmah.test';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = plainPassword;

  const result = await service.execute(token);
  assert.equal(result.status, 'created');

  const rows = await rawPool.query(`SELECT password_hash FROM user_accounts WHERE id = $1`, [result.adminId]);
  const storedHash = rows.rows[0]?.password_hash as string;
  assert.ok(storedHash, 'password_hash should exist');
  assert.notEqual(storedHash, plainPassword, 'plain text password must not be stored');
  assert.ok(storedHash.startsWith('pbkdf2_'), 'password should be pbkdf2 hash');
});
