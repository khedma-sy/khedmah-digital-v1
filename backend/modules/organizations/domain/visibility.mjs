import { OrganizationVisibility } from './organization-types.mjs';

export const OrganizationVisibilityClass = Object.freeze({
  [OrganizationVisibility.PUBLIC]: Object.freeze(['organizationName', 'publicDescriptionRef', 'organizationType']),
  [OrganizationVisibility.PRIVATE]: Object.freeze(['privateContactRef']),
  [OrganizationVisibility.INTERNAL]: Object.freeze(['operationalMetadataRef']),
});

export function isOrganizationVisibility(value) {
  return Object.values(OrganizationVisibility).includes(value);
}

export function validateOrganizationVisibilityExposure({ visibility, fieldClass }) {
  const errors = [];
  if (!isOrganizationVisibility(visibility)) errors.push({ field: 'visibility', code: 'ORGANIZATION_INVALID', message: 'Organization visibility must be public, private, or internal.' });
  if (visibility === OrganizationVisibility.PUBLIC && (fieldClass === OrganizationVisibility.PRIVATE || fieldClass === OrganizationVisibility.INTERNAL)) errors.push({ field: 'fieldClass', code: 'ORGANIZATION_INVALID', message: 'Private or internal organization data must not be exposed publicly.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
