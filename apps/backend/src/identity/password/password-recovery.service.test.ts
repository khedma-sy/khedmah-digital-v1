import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordRecoveryService } from './password-recovery.service';

function tokenHash(raw: string): string {
  const { createHash } = require('node:crypto');
  return createHash('sha256').update(raw).digest('base64url');
}

test('PasswordRecoveryService consumes reset token and revokes sessions', async () => {
  const rawToken = 'a'.repeat(43);
  const statements: string[] = [];
  const db = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('FROM password_reset_tokens')) {
        assert.equal(params?.[0], tokenHash(rawToken));
        return [{ id: 'reset-id', user_id: 'user-id', expires_at: new Date(Date.now() + 60_000), used_at: null }];
      }
      return [];
    },
    async transaction(fn: (client: { query(sql: string, params?: unknown[]): Promise<void> }) => Promise<void>) {
      await fn({ query: async (sql: string) => { statements.push(sql); } });
    }
  };
  const audit: string[] = [];
  const repository = {
    appendAuditLog: async (event: string) => { audit.push(event); }
  };
  const service = new PasswordRecoveryService(db as never, repository as never);
  const result = await service.resetPassword(rawToken, 'new-password-123');

  assert.equal(result.message, 'Password reset successful.');
  assert.ok(statements.some((sql) => sql.includes('UPDATE identity_credentials SET password_hash')));
  assert.ok(statements.some((sql) => sql.includes('UPDATE password_reset_tokens SET used_at')));
  assert.ok(statements.some((sql) => sql.includes('UPDATE identity_sessions SET revoked_at')));
  assert.deepEqual(audit, ['auth.password_reset_completed']);
});
