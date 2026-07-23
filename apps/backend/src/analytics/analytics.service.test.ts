import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnalyticsValidationError } from './analytics.errors';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { IdentityRepository } from '../identity/identity.repository';
import { PlatformLogger } from '../logging/platform-logger';

function createService() {
  const repository = new AnalyticsRepository();
  const identityRepository = new IdentityRepository();
  const logger = new PlatformLogger();
  logger.log = () => undefined;

  return {
    identityRepository,
    repository,
    service: new AnalyticsService(repository, identityRepository, logger)
  };
}

const occurredAt = new Date().toISOString();

test('allowed event types are accepted', () => {
  const { repository, service } = createService();
  const allowed = [
    ['business_view', 'business_profile', 'business-1'],
    ['search_action', 'search', 'search-results'],
    ['contact_click', 'business_profile', 'business-1'],
    ['inquiry_submitted', 'business_profile', 'business-1']
  ] as const;

  for (const [eventType, entityType, entityId] of allowed) {
    const receipt = service.recordEvent({ eventType, entityType, entityId, occurredAt, metadata: { source: 'public' } });
    assert.equal(receipt.eventType, eventType);
  }

  assert.equal(repository.listEvents().length, allowed.length);
});

test('unknown events are rejected', () => {
  const { service } = createService();

  assert.throws(
    () => service.recordEvent({ eventType: 'unknown', entityType: 'business_profile', entityId: 'business-1', occurredAt }),
    AnalyticsValidationError
  );
});

test('private data is rejected', () => {
  const { service } = createService();

  assert.throws(
    () => service.recordEvent({ eventType: 'business_view', entityType: 'business_profile', entityId: 'business-1', occurredAt, metadata: { token: 'unsafe' } }),
    AnalyticsValidationError
  );
  assert.throws(
    () => service.recordEvent({ eventType: 'inquiry_submitted', entityType: 'business_profile', entityId: 'business-1', occurredAt, metadata: { message: 'private inquiry' } }),
    AnalyticsValidationError
  );
});

test('safe metadata is stored with a privacy-safe receipt', () => {
  const { repository, service } = createService();
  const receipt = service.recordEvent({
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

test('audit boundary records event submission without storing private actor profiles', () => {
  const { identityRepository, service } = createService();
  service.recordEvent({ eventType: 'contact_click', entityType: 'business_profile', entityId: 'business-1', occurredAt });

  assert.ok(identityRepository.listAuditLogs().some((event) => event.eventType === 'analytics.event.recorded'));
});
