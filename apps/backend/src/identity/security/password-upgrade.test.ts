import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';
import { IdentityService } from '../identity.service';
import { SessionTokenService } from './session-token.service';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password-security';

const PASSWORD = 'a-long-password';
const SALT = 'legacy-test-salt';
function encoded(password: string, iterations: number): string {
  return `pbkdf2_sha512$${iterations}$${SALT}$${pbkdf2Sync(password, SALT, iterations, 64, 'sha512').toString('base64url')}`;
}

function fixture(initialHash: string, concurrentHash?: string) {
  let storedHash = initialHash;
  let updates = 0;
  let sessions = 0;
  const account = () => ({ id: 'user-1', email: 'user@example.org', passwordHash: storedHash, status: 'active', createdAt: '', updatedAt: '' });
  const repository = {
    findAccountByEmail: async () => account(),
    findAccountById: async () => account(),
    findProfile: async () => ({ userId: 'user-1', displayName: 'User', locale: 'ar', createdAt: '', updatedAt: '' }),
    appendAuditLog: async () => {},
    saveSession: async () => { sessions += 1; },
    updatePasswordHashIfUnchanged: async (_id: string, previous: string, next: string) => {
      updates += 1;
      if (concurrentHash) storedHash = concurrentHash;
      if (storedHash !== previous) return false;
      storedHash = next;
      return true;
    },
  };
  return {
    service: new IdentityService(repository as never, new SessionTokenService()),
    current: () => ({ storedHash, updates, sessions }),
  };
}

test('old hashes upgrade on successful login; incorrect passwords do not upgrade', async () => {
  const legacy = encoded(PASSWORD, 120_000);
  const f = fixture(legacy);
  await assert.rejects(() => f.service.login({ email: 'user@example.org', password: 'not-the-password' }));
  assert.equal(f.current().updates, 0);
  const result = await f.service.login({ email: 'user@example.org', password: PASSWORD });
  assert.equal(result.user.id, 'user-1');
  assert.match(f.current().storedHash, /^pbkdf2_sha512\$220000\$/);
  assert.equal(verifyPassword(PASSWORD, f.current().storedHash), true);
  assert.equal(f.current().sessions, 1);
});

test('a concurrent password reset cannot be overwritten by login migration', async () => {
  const resetHash = encoded('another-password', 220_000);
  const f = fixture(encoded(PASSWORD, 120_000), resetHash);
  await assert.rejects(() => f.service.login({ email: 'user@example.org', password: PASSWORD }));
  assert.equal(f.current().storedHash, resetHash);
  assert.equal(f.current().sessions, 0);
});


test('stored credentials with excessive work factors fail before PBKDF2 derivation', () => {
  // These are syntactically plausible 64-byte base64url digests, but an
  // untrusted/corrupted database row must not monopolize the event loop.
  const excessive = 'pbkdf2_sha512$1000001$salt verify without downgrading and malformed hashes are rejected', async () => {
  const current = hashPassword(PASSWORD);
  assert.match(current, /^pbkdf2_sha512\$220000\$/);
  assert.equal(verifyPassword(PASSWORD, current), true);
  assert.equal(passwordNeedsRehash(current), false);
  const stronger = encoded(PASSWORD, 220_001);
  const f = fixture(stronger);
  await f.service.login({ email: 'user@example.org', password: PASSWORD });
  assert.equal(f.current().updates, 0);
  for (const hash of [
    '', 'pbkdf2_sha512$0$salt$hash', 'pbkdf2_sha512$wat$salt$hash',
    'pbkdf2_sha512$2147483648$salt$hash', `${current}$extra`,
    'pbkdf2_sha512$1000001$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 's'.repeat(129) + '
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(87),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + '*'.repeat(86)
  ]) {
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86);
  assert.equal(verifyPassword(PASSWORD, excessive), false);
  assert.equal(passwordNeedsRehash(excessive), false);
  assert.equal(verifyPassword(PASSWORD, 'pbkdf2_sha512$220000 verify without downgrading and malformed hashes are rejected', async () => {
  const current = hashPassword(PASSWORD);
  assert.match(current, /^pbkdf2_sha512\$220000\$/);
  assert.equal(verifyPassword(PASSWORD, current), true);
  assert.equal(passwordNeedsRehash(current), false);
  const stronger = encoded(PASSWORD, 220_001);
  const f = fixture(stronger);
  await f.service.login({ email: 'user@example.org', password: PASSWORD });
  assert.equal(f.current().updates, 0);
  for (const hash of [
    '', 'pbkdf2_sha512$0$salt$hash', 'pbkdf2_sha512$wat$salt$hash',
    'pbkdf2_sha512$2147483648$salt$hash', `${current}$extra`,
    'pbkdf2_sha512$1000001$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 's'.repeat(129) + '
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(87),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + '*'.repeat(86)
  ]) {
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 's'.repeat(129) + ' verify without downgrading and malformed hashes are rejected', async () => {
  const current = hashPassword(PASSWORD);
  assert.match(current, /^pbkdf2_sha512\$220000\$/);
  assert.equal(verifyPassword(PASSWORD, current), true);
  assert.equal(passwordNeedsRehash(current), false);
  const stronger = encoded(PASSWORD, 220_001);
  const f = fixture(stronger);
  await f.service.login({ email: 'user@example.org', password: PASSWORD });
  assert.equal(f.current().updates, 0);
  for (const hash of [
    '', 'pbkdf2_sha512$0$salt$hash', 'pbkdf2_sha512$wat$salt$hash',
    'pbkdf2_sha512$2147483648$salt$hash', `${current}$extra`,
    'pbkdf2_sha512$1000001$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 's'.repeat(129) + '
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(87),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + '*'.repeat(86)
  ]) {
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86)), false);
});

test('new and stronger hashes verify without downgrading and malformed hashes are rejected', async () => {
  const current = hashPassword(PASSWORD);
  assert.match(current, /^pbkdf2_sha512\$220000\$/);
  assert.equal(verifyPassword(PASSWORD, current), true);
  assert.equal(passwordNeedsRehash(current), false);
  const stronger = encoded(PASSWORD, 220_001);
  const f = fixture(stronger);
  await f.service.login({ email: 'user@example.org', password: PASSWORD });
  assert.equal(f.current().updates, 0);
  for (const hash of [
    '', 'pbkdf2_sha512$0$salt$hash', 'pbkdf2_sha512$wat$salt$hash',
    'pbkdf2_sha512$2147483648$salt$hash', `${current}$extra`,
    'pbkdf2_sha512$1000001$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 's'.repeat(129) + '
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(86),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + 'A'.repeat(87),
    'pbkdf2_sha512$220000$salty
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
 + '*'.repeat(86)
  ]) {
    assert.equal(verifyPassword(PASSWORD, hash), false);
  }
});
