import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminClassifiedsApi, classifiedsApi } from '../lib/classifieds-client';

async function expectIssue(operation: () => Promise<unknown>, expected: { message: string; statusCode: number; code?: string }) {
  await assert.rejects(operation, (cause: unknown) => {
    assert.ok(cause instanceof Error);
    const issue = cause as Error & { statusCode?: number; code?: string };
    assert.deepEqual({ message: issue.message, statusCode: issue.statusCode, code: issue.code }, { code: undefined, ...expected });
    return true;
  });
}

test('Classifieds owner and reviewer clients prefer the canonical envelope and actual HTTP status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    statusCode: 401, code: 'AD_REVIEW_CONFLICT', message: 'legacy text',
    error: { code: 'request_error', message: 'Request could not be completed.' }
  }, { status: 409 }));
  for (const operation of [() => classifiedsApi.getMine('ad-1'), () => adminClassifiedsApi.pending()]) {
    await expectIssue(operation, { message: 'تعذر إكمال الطلب.', statusCode: 409, code: 'request_error' });
  }
});

for (const [statusCode, code, wireMessage, message] of [
  [400, 'validation_error', 'Request validation failed.', 'تعذر التحقق من البيانات المدخلة.'],
  [404, 'not_found', 'Resource was not found.', 'المحتوى المطلوب غير موجود.'],
  [503, 'internal_error', 'Unexpected platform error.', 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.']
] as const) {
  test(`Classifieds translates the existing safe ${statusCode} filter response`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code, message: wireMessage } }, { status: statusCode }));
    await expectIssue(() => classifiedsApi.list(), { message, statusCode, code });
  });
}

test('Classifieds retains legacy string and message-array compatibility', async (t) => {
  const bodies = [
    { message: '  تعذر حفظ المراجعة.  ', code: 'AD_REVIEW_CONFLICT' },
    { message: [' الحقل الأول مطلوب ', '', ' الحقل الثاني مطلوب '], code: 'validation_error' }
  ];
  t.mock.method(globalThis, 'fetch', async () => Response.json(bodies.shift(), { status: 400 }));
  await expectIssue(() => adminClassifiedsApi.pending(), { message: 'تعذر حفظ المراجعة.', statusCode: 400, code: 'AD_REVIEW_CONFLICT' });
  await expectIssue(() => classifiedsApi.list(), { message: 'الحقل الأول مطلوب. الحقل الثاني مطلوب', statusCode: 400, code: 'validation_error' });
});

test('an empty canonical error still takes precedence over legacy fields', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: {}, message: 'legacy text must not override the envelope', code: 'legacy_code'
  }, { status: 401 }));
  await expectIssue(() => classifiedsApi.listMine(), { message: 'تعذر إكمال الطلب (401).', statusCode: 401 });
});

test('malformed Classifieds errors keep HTTP status without stringifying objects or trusting non-string codes', async (t) => {
  let body: unknown;
  t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status: 502 }));
  for (body of [null, [], 'upstream html', { message: { private: 'never display' } },
    { error: { message: ['valid', { private: 'never display' }], code: 123 } },
    { error: { message: ' ', code: { private: 'never expose' } } }]) {
    await expectIssue(() => classifiedsApi.list(), { message: 'تعذر إكمال الطلب (502).', statusCode: 502 });
  }
});

test('invalid JSON on an unsuccessful response produces the shared fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>private upstream failure</html>', { status: 502 }));
  await expectIssue(() => classifiedsApi.get('ad-1'), { message: 'تعذر إكمال الطلب (502).', statusCode: 502 });
});

test('an uncertain Classifieds create is never retried automatically and an explicit retry preserves its request key', async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const input = Object.freeze({ clientRequestId: 'classifieds-create-transport-0001', titleAr: 'مسودة اختبار' });
  const success = { ad: { id: 'ad-1', status: 'draft', contentRevision: 1 } };
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return calls.length === 1
      ? Response.json({ error: { code: 'internal_error', message: 'Unexpected platform error.' } }, { status: 503 })
      : Response.json(success);
  });
  await expectIssue(() => classifiedsApi.create(input), {
    message: 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.', statusCode: 503, code: 'internal_error'
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(await classifiedsApi.create(input), success);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, '/api/v1/classifieds');
    assert.equal(call.init?.method, 'POST');
    assert.equal(call.init?.credentials, 'include');
    assert.equal(new Headers(call.init?.headers).get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(call.init?.body)), input);
  }
  assert.equal(calls[0].init?.body, calls[1].init?.body);
});

test('a failed media-delete fetch stays a network failure and preserves the supplied revision and request key', async (t) => {
  const networkFailure = new TypeError('fixture connection lost');
  const calls: { url: string; init?: RequestInit }[] = [];
  const input = Object.freeze({ clientRequestId: 'classifieds-delete-transport-0001', expectedContentRevision: 7 });
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    throw networkFailure;
  });
  await assert.rejects(() => classifiedsApi.deleteImage('ad/1', 'image/1', input), (cause: unknown) => {
    assert.equal(cause, networkFailure);
    assert.equal('statusCode' in networkFailure, false);
    assert.equal('code' in networkFailure, false);
    return true;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/v1/classifieds/ad%2F1/media/image%2F1');
  assert.equal(calls[0].init?.method, 'DELETE');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), input);
});
