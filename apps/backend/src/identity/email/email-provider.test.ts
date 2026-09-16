import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { ConsoleEmailProvider, createEmailProvider, EmailDeliveryError, ResendEmailProvider, UnavailableEmailProvider } from './email-provider';

const message = { to: 'owner@example.test', subject: 'Verification', textBody: 'private-token-in-link', htmlBody: '<b>private-token-in-link</b>' };
const names = ['NODE_ENV', 'RESEND_API_KEY', 'EMAIL_FROM'] as const;
let original: Array<string | undefined>;
beforeEach(() => { original = names.map(name => process.env[name]); names.forEach(name => delete process.env[name]); });
afterEach(() => { mock.restoreAll(); mock.timers.reset(); names.forEach((name, i) => { if (original[i] === undefined) delete process.env[name]; else process.env[name] = original[i]; }); });
const rejectsWith = (code: string) => (error: unknown) => {
  assert.ok(error instanceof EmailDeliveryError); assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /private-token|private-provider|re_test|owner@/); return true;
};

for (const mode of ['preview', 'PREVIEW ', 'unknown']) test(`${mode}: absent mail cannot succeed or print a verification token`, async () => {
  process.env.NODE_ENV = mode;
  const stdout = mock.method(process.stdout, 'write', () => true);
  const provider = createEmailProvider(); assert.ok(provider instanceof UnavailableEmailProvider);
  await assert.rejects(provider.send(message), rejectsWith('EMAIL_NOT_CONFIGURED'));
  assert.equal(stdout.mock.callCount(), 0);
});
for (const mode of ['production', 'staging', 'PRODUCTION ']) test(`${mode}: startup refuses missing or blank mail configuration`, () => {
  process.env.NODE_ENV = mode; process.env.RESEND_API_KEY = '   ';
  assert.throws(() => createEmailProvider(), rejectsWith('EMAIL_NOT_CONFIGURED'));
});
test('local console transport redacts recipient and complete message', async () => {
  const output: unknown[] = []; mock.method(process.stdout, 'write', (chunk: unknown) => { output.push(chunk); return true; });
  const provider = createEmailProvider(); assert.ok(provider instanceof ConsoleEmailProvider); await provider.send(message);
  assert.equal(output.length, 1); assert.doesNotMatch(String(output[0]), /owner@|private-token|Verification/);
});
test('Resend request is single-shot, bounded and requires an acceptance receipt', async () => {
  process.env.RESEND_API_KEY = ' re_test '; process.env.EMAIL_FROM = ' sender@example.test ';
  const request = mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails'); assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal); assert.equal(init.signal.aborted, false);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer re_test');
    assert.equal(JSON.parse(String(init?.body)).from, 'sender@example.test');
    return new Response(JSON.stringify({ id: 'test-message-id' }), { status: 200 });
  });
  await new ResendEmailProvider().send(message); assert.equal(request.mock.callCount(), 1);
});
test('provider rejection never exposes its response body or retries the request', async () => {
  process.env.RESEND_API_KEY = 're_test';
  const request = mock.method(globalThis, 'fetch', async () => new Response('private-provider private-token', { status: 403 }));
  await assert.rejects(new ResendEmailProvider().send(message), rejectsWith('EMAIL_REJECTED'));
  assert.equal(request.mock.callCount(), 1);
});
for (const receipt of [{}, { id: '' }, { id: 7 }, null]) test(`malformed acceptance ${JSON.stringify(receipt)} cannot report success`, async () => {
  process.env.RESEND_API_KEY = 're_test'; mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(receipt)));
  await assert.rejects(new ResendEmailProvider().send(message), rejectsWith('EMAIL_INVALID_RESPONSE'));
});
test('network failure is sanitized', async () => {
  process.env.RESEND_API_KEY = 're_test'; mock.method(globalThis, 'fetch', async () => { throw new Error('private-provider re_test'); });
  await assert.rejects(new ResendEmailProvider().send(message), rejectsWith('EMAIL_UNAVAILABLE'));
});
test('timeout aborts a hanging request without automatic duplicate delivery', async () => {
  process.env.RESEND_API_KEY = 're_test'; mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const request = mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('private-provider timeout')), { once: true }));
  });
  const result = assert.rejects(new ResendEmailProvider().send(message), rejectsWith('EMAIL_UNAVAILABLE'));
  mock.timers.tick(10000); await result;
  assert.equal(signal?.aborted, true); assert.equal(request.mock.callCount(), 1);
});
test('configuration cannot inject headers through the key or sender', () => {
  process.env.RESEND_API_KEY = 're_test\nprivate-provider'; assert.throws(() => new ResendEmailProvider(), rejectsWith('EMAIL_NOT_CONFIGURED'));
  process.env.RESEND_API_KEY = 're_test'; process.env.EMAIL_FROM = 'sender@example.test\nBcc: owner@example.test';
  assert.throws(() => new ResendEmailProvider(), rejectsWith('EMAIL_NOT_CONFIGURED'));
});
