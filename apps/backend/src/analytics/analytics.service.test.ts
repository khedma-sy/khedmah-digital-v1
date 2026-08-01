import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { AnalyticsValidationError } from './analytics.errors';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { IdentityRepository } from '../identity/identity.repository';
import { PlatformLogger } from '../logging/platform-logger';

const rawPool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: parseInt(process.env.PGPORT ?? '5432', 10),
  user: process.env.PGUSER ?? 'khedmah',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? 'khedmah_dev'
});

async function createService() {
  const pool = DatabasePool.fromPool(rawPool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
      actor_user_id TEXT, request_id TEXT, correlation_id TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('TRUNCATE audit_logs');

  const repository = new AnalyticsRepository();
  const identityRepository = new IdentityRepository(pool);
  const logger = new PlatformLogger();
  logger.log = () => undefined;

  return {
    identityRepository,
    repository,
    service: new AnalyticsService(repository, identityRepository, logger)
  };
}

const occurredAt = new Date().toISOString();

test('allowed event types are accepted', async () => {
  const { repository, service } = await createService();
  const allowed = [
    ['business_view', 'business_profile', 'business-1'],
    ['search_action', 'search', 'search-results'],
    ['contact_click', 'business_profile', 'business-1'],
    ['inquiry_submitted', 'business_profile', 'business-1']
  ] as const;

  for (const [eventType, entityType, entityId] of allowed) {
    const receipt = await service.recordEvent({ eventType, entityType, entityId, occurredAt, metadata: { source: 'public' } });
    assert.equal(receipt.eventType, eventType);
  }

  assert.equal(repository.listEvents().length, allowed.length);
});

test('unknown events are rejected', async () => {
  const { service } = await createService();

  await assert.rejects(
    () => service.recordEvent({ eventType: 'unknown', entityType: 'business_profile', entityId: 'business-1', occurredAt }),
    AnalyticsValidationError
  );
});

test('private data is rejected', async () => {
  const { service } = await createService();

  await assert.rejects(
    () => service.recordEvent({ eventType: 'business_view', entityType: 'business_profile', entityId: 'business-1', occurredAt, metadata: { token: 'unsafe' } }),
    AnalyticsValidationError
  );
  await assert.rejects(
    () => service.recordEvent({ eventType: 'inquiry_submitted', entityType: 'business_profile', entityId: 'business-1', occurredAt, metadata: { message: 'private inquiry' } }),
    AnalyticsValidationError
  );
});

test('safe metadata is stored with a privacy-safe receipt', async () => {
  const { repository, service } = await createService();
  const receipt = await service.recordEvent({
    eventType: 'business_view',
    entityType: 'business_profile',
    entityId: 'business-1',
    occurredAt,
    anonymousId: 'anon-1',
    metadata: { source: 'public_profile', result_position: 1, has_filter: true }
  });
  const stored = repository.findEvent(receipt.id);

  assert.ok(stored);
  assert.deepEqual(stored.metadata, { source: 'public_profile', result_position: 1, has_filter: true });
  assert.deepEqual(Object.keys(receipt).sort(), ['entityId', 'entityType', 'eventType', 'id', 'recordedAt']);
});

test('audit boundary records event submission without storing private actor profiles', async () => {
  const { identityRepository, service } = await createService();
  await service.recordEvent({ eventType: 'contact_click', entityType: 'business_profile', entityId: 'business-1', occurredAt });

  const logs = await identityRepository.listAuditLogs();
  assert.ok(logs.some((event) => event.eventType === 'analytics.event.recorded'));
});
