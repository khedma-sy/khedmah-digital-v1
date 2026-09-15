import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from '../lib/api-client';
import { identityApi } from '../lib/identity-api';
import { readApiError } from '../lib/api-errors';

test('login preserves the canonical rejection message and status', async (t) => {
  const message = 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'INVALID_CREDENTIALS', message } }, { status: 401 }));
  await assert.rejects(() => api.auth.login('fixture@example.test', 'not-a-live-credential'),
    (error: Error & { code?: string; statusCode?: number }) => {
      assert.equal(error.message, message);
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      assert.equal(error.statusCode, 401);
      return true;
    });
});

test('both identity clients preserve email verification recovery across the wire envelope', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: {
    code: 'EMAIL_VERIFICATION_REQUIRED', message: 'يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول.'
  } }, { status: 403 }));
  for (const operation of [() => api.auth.login('fixture@example.test', 'not-a-live-credential'),
    () => identityApi.google('not-a-live-token')]) {
    await assert.rejects(operation, (error: Error & { code?: string; statusCode?: number }) => {
      assert.equal(error.code, 'EMAIL_VERIFICATION_REQUIRED');
      assert.equal(error.statusCode, 403);
      return true;
    });
  }
});

test('canonical error fields take precedence while legacy message arrays remain compatible', () => {
  assert.deepEqual(readApiError({ code: 'wrong', message: 'wrong', error: { code: 'right', message: 'right' } }, 409),
    { code: 'right', message: 'right' });
  assert.deepEqual(readApiError({ code: 'validation', message: ['first', 'second'] }, 400),
    { code: 'validation', message: 'first. second' });
});

test('malformed error bodies yield a safe message rather than stringify arbitrary objects', async (t) => {
  for (const data of [null, [], 'html', { error: { message: { private: 'sensitive' }, code: 123 } }]) {
    assert.deepEqual(readApiError(data, 401), { message: 'تعذر إكمال الطلب (401).', code: undefined });
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json(null, { status: 502 }));
  await assert.rejects(() => api.auth.session(), { message: 'تعذر إكمال الطلب (502).', statusCode: 502 });
});

test('identity translations remain available for legacy verification errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Verification token is invalid or expired.' }, { status: 400 }));
  await assert.rejects(() => identityApi.confirmEmailVerification('not-a-live-token'),
    { message: 'رابط التحقق غير صالح أو انتهت صلاحيته.', statusCode: 400 });
});
