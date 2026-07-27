"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRecordAnalyticsEvent = validateRecordAnalyticsEvent;
const analytics_errors_1 = require("./analytics.errors");
const EVENT_TYPES = new Set(['business_view', 'search_action', 'contact_click', 'inquiry_submitted']);
const ENTITY_TYPES = new Set(['business_profile', 'search']);
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
function validateString(value, maxLength = MAX_IDENTIFIER_LENGTH) {
    if (typeof value !== 'string') {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    return trimmed;
}
function validateEventType(value) {
    const eventType = validateString(value);
    if (!EVENT_TYPES.has(eventType)) {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    return eventType;
}
function validateEntityType(value) {
    const entityType = validateString(value);
    if (!ENTITY_TYPES.has(entityType)) {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    return entityType;
}
function validateOccurredAt(value) {
    const timestamp = validateString(value, 40);
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed) || parsed > Date.now() + 60_000) {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    return new Date(parsed).toISOString();
}
function validateContextReference(value) {
    if (value === undefined) {
        return undefined;
    }
    return validateString(value, MAX_IDENTIFIER_LENGTH);
}
function validateMetadata(value) {
    if (value === undefined) {
        return {};
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_METADATA_KEYS) {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    const safeMetadata = {};
    for (const [rawKey, rawMetadataValue] of entries) {
        const key = rawKey.trim().toLowerCase();
        if (!key || key.length > MAX_METADATA_KEY_LENGTH || FORBIDDEN_METADATA_KEYS.has(key)) {
            throw new analytics_errors_1.AnalyticsValidationError();
        }
        if (typeof rawMetadataValue === 'string') {
            const metadataValue = rawMetadataValue.trim();
            if (metadataValue.length > MAX_METADATA_STRING_LENGTH) {
                throw new analytics_errors_1.AnalyticsValidationError();
            }
            safeMetadata[key] = metadataValue;
            continue;
        }
        if (typeof rawMetadataValue === 'number') {
            if (!Number.isFinite(rawMetadataValue)) {
                throw new analytics_errors_1.AnalyticsValidationError();
            }
            safeMetadata[key] = rawMetadataValue;
            continue;
        }
        if (typeof rawMetadataValue === 'boolean') {
            safeMetadata[key] = rawMetadataValue;
            continue;
        }
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    return safeMetadata;
}
function validateRecordAnalyticsEvent(request) {
    const eventType = validateEventType(request.eventType);
    const entityType = validateEntityType(request.entityType);
    if (eventType === 'search_action' && entityType !== 'search') {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    if (eventType !== 'search_action' && entityType !== 'business_profile') {
        throw new analytics_errors_1.AnalyticsValidationError();
    }
    return {
        eventType,
        entityType,
        entityId: validateString(request.entityId),
        occurredAt: validateOccurredAt(request.occurredAt),
        anonymousId: validateContextReference(request.anonymousId),
        sessionReference: validateContextReference(request.sessionReference),
        metadata: validateMetadata(request.metadata)
    };
}
//# sourceMappingURL=analytics.validation.js.map