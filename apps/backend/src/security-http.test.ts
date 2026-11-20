import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { createBackendApp } from './app';
import { AnalyticsRepository } from './analytics/analytics.repository';
import { AdMediaService } from './classifieds/ad-media.service';
import { ContactService } from './contact/contact.service';
import { DatabaseMigrator } from './database/database.migrator';
import { DatabasePool } from './database/database.pool';
import { RateLimitRepository } from './database/rate-limit.repository';
import { IdentityRepository } from './identity/identity.repository';
import { IdentityService } from './identity/identity.service';
import { MediaService } from './media/media.service';
import { ProductService } from './products/product.service';

test('actual HTTP wiring protects mutations, limits analytics, and preserves upload and public flows', async () => {
  const envKeys = ['NODE_ENV', 'RATE_LIMIT_PUBLIC_MAX', 'RATE_LIMIT_AUTH_MAX', 'CLASSIFIEDS_ENABLED', 'CORS_ORIGIN'] as const;
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_PUBLIC_MAX = '2';
  process.env.RATE_LIMIT_AUTH_MAX = '100';
  process.env.CLASSIFIEDS_ENABLED = 'false';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  const poolInit = DatabasePool.prototype.onModuleInit;
  const migratorInit = DatabaseMigrator.prototype.onModuleInit;
  DatabasePool.prototype.onModuleInit = () => {};
  DatabaseMigrator.prototype.onModuleInit = async () => {};
  let app: Awaited<ReturnType<typeof createBackendApp>> | undefined;
  try {
    app = await createBackendApp();
    const buckets = new Map<string, number>();
    let databaseRateWrites = 0;
    app.get(RateLimitRepository).consume = async (key, _window, limit) => {
      databaseRateWrites += 1;
      const count = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, count);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: new Date(Date.now() + 60_000).toISOString() };
    };
    let events = 0;
    let audits = 0;
    app.get(AnalyticsRepository).saveEvent = async () => { events += 1; };
    app.get(IdentityRepository).appendAuditLog = async () => { audits += 1; };
    const identity = app.get(IdentityService);
    identity.getCurrentUser = async token => {
      if (token !== 'valid-session') throw new UnauthorizedException('Authentication required.');
      return { id: 'customer-1', email: 'customer@example.org', status: 'active', profile: { displayName: 'Customer', locale: 'ar' } };
    };
    identity.login = async () => ({
      sessionToken: 'login-session',
      user: { id: 'customer-1', email: 'customer@example.org', status: 'active', profile: { displayName: 'Customer', locale: 'ar' } },
    });
    identity.logout = async () => {};
    app.get(ProductService).create = async () => ({ id: 'product-1' } as never);
    app.get(ContactService).trackContactClick = async () => ({ id: 'click-1' } as never);
    app.get(MediaService).upload = async () => ({ id: 'media-1' } as never);
    app.get(AdMediaService).upload = async () => ({ adRevision: 1, contentRevision: 1, image: {} as never });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    let sequence = 10;
    const send = (path: string, method: string, body = '{}', session = false, fixedIp?: string) => fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': fixedIp ?? `198.51.100.${sequence++}`,
        ...(session ? { cookie: 'khedmah_session=valid-session', origin: 'http://localhost:3000' } : {}),
      },
      body,
    });

    for (const [path, method] of [['/products', 'POST'], ['/products/p1', 'PATCH'], ['/media/m1', 'DELETE']] as const) {
      assert.equal((await send(path, method)).status, 401, `${method} ${path} must require a session`);
    }
    // Safe HTTP methods are not blanket public authorization: the protected
    // account, billing, notification and admin GET routes must still enforce
    // their service-level actor boundary before accessing user data.
    for (const path of [
      '/users/me',
      '/notifications',
      '/billing/me',
      '/billing/promo/active',
      '/admin/billing/orders/pending',
      '/admin/operations-product/overview',
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401, `GET ${path} must reject an anonymous reader`);
    }
    assert.equal((await send('/products', 'POST', '{}', true)).status, 201);
    const login = await send('/auth/login', 'POST');
    assert.equal(login.status, 201, 'login remains available without an existing session');
    assert.match(login.headers.get('set-cookie') ?? '', /khedmah_session=login-session/);
    assert.equal((await send('/auth/logout', 'POST')).status, 201);
    assert.equal((await send('/businesses/b1/contact-click', 'POST')).status, 201);
    assert.equal((await send('/admin/bootstrap', 'POST')).status, 403, 'bootstrap retains its own secret check');

    const event = JSON.stringify({ eventType: 'business_view', entityType: 'business_profile', entityId: 'b1', occurredAt: new Date().toISOString() });
    const beforeAnalytics = databaseRateWrites;
    assert.equal((await send('/analytics/events', 'POST', event, false, '203.0.113.5')).status, 201);
    assert.equal((await send('/analytics/events', 'POST', event, false, '203.0.113.5')).status, 201);
    assert.equal((await send('/analytics/events', 'POST', event, false, '203.0.113.5')).status, 429);
    assert.equal((await send('/analytics/events', 'POST', event, false, '203.0.113.5')).status, 429);
    assert.equal(events, 2);
    assert.equal(audits, 0);
    assert.equal(databaseRateWrites - beforeAnalytics, 3, 'repeat blocked requests do not write to the limiter');

    const medium = JSON.stringify({ content: 'x'.repeat(300_000) });
    assert.equal((await send('/auth/logout', 'POST', medium)).status, 413);
    assert.equal((await send('/media', 'POST', medium, true)).status, 201);
    assert.equal((await send('/classifieds/a1/media', 'POST', medium, true)).status, 201);
    assert.equal((await send('/media', 'POST', JSON.stringify({ content: 'x'.repeat(7 * 1024 * 1024) }), true)).status, 413);
    assert.equal((await send('/auth/logout', 'POST', '{bad-json')).status, 400);
    const headerResponse = await fetch(base + '/nonexistent');
    assert.match(headerResponse.headers.get('content-security-policy-report-only') ?? '', /default-src 'none'/);
  } finally {
    if (app) await app.close();
    DatabasePool.prototype.onModuleInit = poolInit;
    DatabaseMigrator.prototype.onModuleInit = migratorInit;
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
