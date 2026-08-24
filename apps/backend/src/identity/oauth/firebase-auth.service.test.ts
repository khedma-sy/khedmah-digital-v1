import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { FirebaseAuthService } from './firebase-auth.service';

test('FirebaseAuthService rejects malformed tokens before network access', async () => {
  const service = new FirebaseAuthService();
  await assert.rejects(() => service.verifyGoogleIdToken('short'), UnauthorizedException);
});

test('FirebaseAuthService accepts verified google.com identity from Firebase lookup', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FIREBASE_API_KEY;
  process.env.FIREBASE_API_KEY = 'test-api-key';
  globalThis.fetch = (async () => new Response(JSON.stringify({
    users: [{
      localId: 'firebase-local-id',
      email: 'User@Example.com',
      emailVerified: true,
      displayName: 'مستخدم تجريبي',
      providerUserInfo: [{ providerId: 'google.com', rawId: 'google-subject', email: 'User@Example.com' }]
    }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    const service = new FirebaseAuthService();
    const identity = await service.verifyGoogleIdToken('x'.repeat(120));
    assert.equal(identity.subject, 'google-subject');
    assert.equal(identity.email, 'user@example.com');
    assert.equal(identity.displayName, 'مستخدم تجريبي');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FIREBASE_API_KEY;
    else process.env.FIREBASE_API_KEY = originalKey;
  }
});
