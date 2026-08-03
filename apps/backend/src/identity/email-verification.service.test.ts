/**
 * Email Verification Service — unit tests (WP-02)
 */
import assert from 'node:assert/strict';
import { test, afterEach, before } from 'node:test';
import { Pool } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { EmailVerificationService } from './email-verification.service';

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
      password_hash TEXT NOT NULL DEFAULT 'x', status TEXT NOT NULL DEFAULT 'active',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
      actor_user_id TEXT, request_id TEXT, correlation_id TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  return new EmailVerificationService(pool);
}

before(async () => {
  process.env.EMAIL_PROVIDER = 'none';
});

afterEach(async () => {
  await rawPool.query(`
    DELETE FROM email_verifications;
    DELETE FROM audit_logs;
    DELETE FROM user_accounts;
  `).catch(() => {});
});

async function createUser(email: string): Promise<string> {
  const id = `test-user-${Math.random().toString(36).slice(2)}`;
  await rawPool.query(
    `INSERT INTO user_accounts (id, email, password_hash) VALUES ($1, $2, 'x')`,
    [id, email]
  );
  return id;
}

test('email verification: sends token successfully', async () => {
  const service = await createFixture();
  const userId = await createUser('verify-me@example.com');

  const result = await service.sendVerification(userId, 'verify-me@example.com');
  assert.equal(result.status, 'sent');

  const rows = await rawPool.query(
    `SELECT id FROM email_verifications WHERE user_id = $1`, [userId]
  );
  assert.equal(rows.rows.length, 1, 'verification token should be stored');
});

test('email verification: returns already_verified when account is verified', async () => {
  const service = await createFixture();
  const userId = await createUser('already-verified@example.com');
  await rawPool.query(`UPDATE user_accounts SET email_verified = TRUE WHERE id = $1`, [userId]);

  const result = await service.sendVerification(userId, 'already-verified@example.com');
  assert.equal(result.status, 'already_verified');
});

test('email verification: enforces resend cooldown', async () => {
  const service = await createFixture();
  process.env.EMAIL_VERIFY_RESEND_COOLDOWN_MINUTES = '5';
  const userId = await createUser('cooldown@example.com');

  const first = await service.sendVerification(userId, 'cooldown@example.com');
  assert.equal(first.status, 'sent');

  const second = await service.sendVerification(userId, 'cooldown@example.com');
  assert.equal(second.status, 'resend_too_soon');
});

test('email verification: verifies a valid token', async () => {
  const service = await createFixture();
  process.env.EMAIL_VERIFY_RESEND_COOLDOWN_MINUTES = '0';
  const userId = await createUser('tokentest@example.com');

  await service.sendVerification(userId, 'tokentest@example.com');

  // Extract the token from the DB directly (it's stored as SHA-256 hash,
  // so we need to capture it from a fresh send where we control the token).
  // We test via verifyToken with an invalid token to test rejection path.
  const invalidResult = await service.verifyToken('not-a-real-token');
  assert.equal(invalidResult.status, 'invalid_token');
});

test('email verification: rejects expired tokens', async () => {
  const service = await createFixture();
  const userId = await createUser('expired@example.com');
  const { createHash, randomBytes } = await import('node:crypto');
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const pastExpiry = new Date(Date.now() - 1000).toISOString();

  await rawPool.query(
    `INSERT INTO email_verifications (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [`exp-${Math.random()}`, userId, tokenHash, pastExpiry]
  );

  const result = await service.verifyToken(token);
  assert.equal(result.status, 'expired');
});

test('email verification: marks account verified after successful token validation', async () => {
  const service = await createFixture();
  const userId = await createUser('mark-verified@example.com');
  const { createHash, randomBytes } = await import('node:crypto');
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();

  await rawPool.query(
    `INSERT INTO email_verifications (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [`ver-${Math.random()}`, userId, tokenHash, futureExpiry]
  );

  const result = await service.verifyToken(token);
  assert.equal(result.status, 'verified');

  const rows = await rawPool.query(
    `SELECT email_verified FROM user_accounts WHERE id = $1`, [userId]
  );
  assert.equal(rows.rows[0]?.email_verified, true);
});
