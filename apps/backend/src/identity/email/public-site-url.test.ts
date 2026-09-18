import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { buildPublicActionUrl, getPublicSiteUrl } from './public-site-url';
let mode: string | undefined; let site: string | undefined;
beforeEach(() => { mode = process.env.NODE_ENV; site = process.env.NEXT_PUBLIC_SITE_URL; delete process.env.NEXT_PUBLIC_SITE_URL; });
afterEach(() => { if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode; if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = site; });
for (const environment of ['preview', 'staging', 'production', 'PRODUCTION ', 'unknown']) test(`${environment}: email links cannot fall back to localhost`, () => {
  process.env.NODE_ENV = environment; assert.throws(getPublicSiteUrl, /must be configured/);
  for (const value of ['http://preview.example.test', 'https://localhost', 'https://127.0.0.1', 'https://[::1]']) {
    process.env.NEXT_PUBLIC_SITE_URL = value; assert.throws(getPublicSiteUrl, /non-local HTTPS/);
  }
});
test('development retains its explicit localhost fallback', () => { process.env.NODE_ENV = 'development'; assert.equal(getPublicSiteUrl(), 'http://localhost:3000'); });
test('valid isolated HTTPS site creates both canonical token links', () => {
  process.env.NODE_ENV = 'preview'; process.env.NEXT_PUBLIC_SITE_URL = ' https://preview.example.test/ ';
  for (const path of ['/auth/verify-email', '/auth/reset-password']) {
    const url = new URL(buildPublicActionUrl(path, 'test-token+&value'));
    assert.equal(url.origin, 'https://preview.example.test'); assert.equal(url.pathname, path); assert.equal(url.searchParams.get('token'), 'test-token+&value');
  }
});
test('credentials and token-bearing configuration are rejected without disclosure', () => {
  process.env.NODE_ENV = 'production';
  for (const value of ['https://owner:private-token@example.test', 'https://example.test/?token=private-token', 'https://example.test/#private-token', 'javascript:private-token', 'private-token']) {
    process.env.NEXT_PUBLIC_SITE_URL = value;
    assert.throws(getPublicSiteUrl, (error: unknown) => { assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /private-token/); return true; });
  }
});
test('action paths cannot change the configured origin', () => {
  process.env.NODE_ENV = 'preview'; process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.example.test';
  for (const path of ['https://other.example.test', '//other.example.test', '/\\other.example.test', 'relative']) assert.throws(() => buildPublicActionUrl(path, 'test-token'), /configured site/);
});
