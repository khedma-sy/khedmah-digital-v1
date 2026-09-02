import { AnalyticsValidationError } from './analytics.errors';
import { AnalyticsEntityType, AnalyticsEventMetadata, AnalyticsEventType } from './analytics.types';
import { RecordAnalyticsEventRequest } from './dto/analytics.dto';

const EVENT_TYPES = new Set<AnalyticsEventType>(['business_view', 'search_action', 'contact_click', 'inquiry_submitted']);
const ENTITY_TYPES = new Set<AnalyticsEntityType>(['business_profile', 'search']);
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_METADATA_KEYS = 10;
const MAX_METADATA_KEY_LENGTH = 48;
const MAX_METADATA_STRING_LENGTH = 160;
const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'token',
  'credential',
  'secret',
  'message',
  'inquiry_content',
  'owner_email',
  'owner_phone',
  'private_owner_data',
  'user_email',
  'phone'
]);

function validateString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): string {
  if (typeof value !== 'string') {
    throw new AnalyticsValidationError();
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new AnalyticsValidationError();
  }

  return trimmed;
}

function validateEventType(value: unknown): AnalyticsEventType {
  const eventType = validateString(value) as AnalyticsEventType;
  if (!EVENT_TYPES.has(eventType)) {
    throw new AnalyticsValidationError();
  }

  return eventType;
}

function validateEntityType(value: unknown): AnalyticsEntityType {
  const entityType = validateString(value) as AnalyticsEntityType;
  if (!ENTITY_TYPES.has(entityType)) {
    throw new AnalyticsValidationError();
  }

  return entityType;
}

function validateOccurredAt(value: unknown): string {
  const timestamp = validateString(value, 40);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || parsed > Date.now() + 60_000) {
    throw new AnalyticsValidationError();
  }

  return new Date(parsed).toISOString();
}

function validateContextReference(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateString(value, MAX_IDENTIFIER_LENGTH);
}

function validateMetadata(value: unknown): AnalyticsEventMetadata {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AnalyticsValidationError();
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_METADATA_KEYS) {
    throw new AnalyticsValidationError();
  }

  const safeMetadata: Record<string, string | number | boolean> = {};
  for (const [rawKey, rawMetadataValue] of entries) {
    const key = rawKey.trim().toLowerCase();
    if (!key || key.length > MAX_METADATA_KEY_LENGTH || FORBIDDEN_METADATA_KEYS.has(key)) {
      throw new AnalyticsValidationError();
    }

    if (typeof rawMetadataValue === 'string') {
      const metadataValue = rawMetadataValue.trim();
      if (metadataValue.length > MAX_METADATA_STRING_LENGTH) {
        throw new AnalyticsValidationError();
      }

      safeMetadata[key] = metadataValue;
      continue;
    }

    if (typeof rawMetadataValue === 'number') {
      if (!Number.isFinite(rawMetadataValue)) {
        throw new AnalyticsValidationError();
      }

      safeMetadata[key] = rawMetadataValue;
      continue;
    }

    if (typeof rawMetadataValue === 'boolean') {
      safeMetadata[key] = rawMetadataValue;
      continue;
    }

    throw new AnalyticsValidationError();
  }

  return safeMetadata;
}

function validateSearchMetadata(metadata: AnalyticsEventMetadata): AnalyticsEventMetadata {
  const query = metadata.query;
  if (query !== undefined && (typeof query !== 'string' || query.length > 80)) {
    throw new AnalyticsValidationError();
  }

  const resultsCount = metadata.results_count;
  if (resultsCount !== undefined && (
    typeof resultsCount !== 'number'
    || !Number.isInteger(resultsCount)
    || resultsCount < 0
    || resultsCount > 100_000
  )) {
    throw new AnalyticsValidationError();
  }

  return metadata;
}

export function validateRecordAnalyticsEvent(request: RecordAnalyticsEventRequest) {
  const eventType = validateEventType(request.eventType);
  const entityType = validateEntityType(request.entityType);

  if (eventType === 'search_action' && entityType !== 'search') {
    throw new AnalyticsValidationError();
  }

  if (eventType !== 'search_action' && entityType !== 'business_profile') {
    throw new AnalyticsValidationError();
  }

  const metadata = validateMetadata(request.metadata);

  return {
    eventType,
    entityType,
    entityId: validateString(request.entityId),
    occurredAt: validateOccurredAt(request.occurredAt),
    anonymousId: validateContextReference(request.anonymousId),
    sessionReference: validateContextReference(request.sessionReference),
    metadata: eventType === 'search_action' ? validateSearchMetadata(metadata) : metadata
  };
}
