export const LocationAuditEvent = Object.freeze({
  LOCATION_CREATED: 'LOCATION_CREATED',
  LOCATION_UPDATED: 'LOCATION_UPDATED',
  LOCATION_STATUS_CHANGED: 'LOCATION_STATUS_CHANGED',
  LOCATION_ARCHIVED: 'LOCATION_ARCHIVED',
  LOCATION_HIERARCHY_CHANGED: 'LOCATION_HIERARCHY_CHANGED',
});

export function isLocationAuditEventName(value) {
  return Object.values(LocationAuditEvent).includes(value);
}
