export const ServiceCatalogAuditEvent = Object.freeze({
  SERVICE_CREATED: 'SERVICE_CREATED',
  SERVICE_UPDATED: 'SERVICE_UPDATED',
  SERVICE_STATUS_CHANGED: 'SERVICE_STATUS_CHANGED',
  SERVICE_ARCHIVED: 'SERVICE_ARCHIVED',
  SERVICE_OWNERSHIP_CHANGED: 'SERVICE_OWNERSHIP_CHANGED',
});

export function isServiceCatalogAuditEventName(value) {
  return Object.values(ServiceCatalogAuditEvent).includes(value);
}
