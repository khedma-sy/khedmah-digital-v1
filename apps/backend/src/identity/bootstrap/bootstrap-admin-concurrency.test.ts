import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DatabasePool } from '../../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../../database/test-pool';
import { IdentityRepository } from '../identity.repository';
import { SessionTokenService } from '../security/session-token.service';
import { BootstrapAdminService } from './bootstrap-admin.service';

const rawPool = createTestPool();

after(async () => {
  await rawPool.end();
});

test('concurrent bootstrap requests produce exactly one bootstrap administrator', async () => {
  await resetCanonicalTestSchema(rawPool);
  const pool = DatabasePool.fromPool(rawPool);
  await pool.query(`
    TRUNCATE admin_roles, audit_logs, identity_sessions, identity_credentials, profiles, core_user_accounts CASCADE
  `);

  const repository = new IdentityRepository(pool);
  const service = new BootstrapAdminService(repository, new SessionTokenService());
  const originalSecret = process.env.BOOTSTRAP_ADMIN_SECRET;
  const secret = 'bootstrap-concurrency-secret-'.padEnd(40, 'x');
  process.env.BOOTSTRAP_ADMIN_SECRET = secret;

  try {
    const results = await Promise.allSettled([
      service.bootstrap(secret, {
        email: 'admin-one@khedmah.example',
        password: 'admin-one-secure-password',
        displayName: 'Admin One'
      }),
      service.bootstrap(secret, {
        email: 'admin-two@khedmah.example',
        password: 'admin-two-secure-password',
        displayName: 'Admin Two'
      })
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);

    const roleCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_roles WHERE role='bootstrap_admin'`
    );
    const accountCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM core_user_accounts`
    );
    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs WHERE event_type='admin.bootstrap'`
    );

    assert.equal(roleCount[0]?.count, '1');
    assert.equal(accountCount[0]?.count, '1');
    assert.equal(auditCount[0]?.count, '1');
  } finally {
    if (originalSecret === undefined) delete process.env.BOOTSTRAP_ADMIN_SECRET;
    else process.env.BOOTSTRAP_ADMIN_SECRET = originalSecret;
  }
});
