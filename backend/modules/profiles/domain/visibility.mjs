import { ProfileVisibility } from './profile-types.mjs';

export const ProfileVisibilityClass = Object.freeze({
  [ProfileVisibility.PUBLIC]: Object.freeze(['displayName', 'publicDescriptionRef']),
  [ProfileVisibility.PRIVATE]: Object.freeze(['personalInformationRef']),
  [ProfileVisibility.INTERNAL]: Object.freeze(['securityMetadataRef', 'operationalMetadataRef']),
});

export function isProfileVisibility(value) {
  return Object.values(ProfileVisibility).includes(value);
}

export function validateProfileVisibilityExposure({ visibility, fieldClass }) {
  const errors = [];
  if (!isProfileVisibility(visibility)) errors.push({ field: 'visibility', code: 'PROFILE_VISIBILITY_INVALID', message: 'Profile visibility must be public, private, or internal.' });
  if (visibility === ProfileVisibility.PUBLIC && (fieldClass === ProfileVisibility.PRIVATE || fieldClass === ProfileVisibility.INTERNAL)) {
    errors.push({ field: 'fieldClass', code: 'PROFILE_VISIBILITY_INVALID', message: 'Private or internal profile data must not be exposed publicly.' });
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
