import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const ProfessionalProfileConcept = Object.freeze({
  PROFESSIONAL_PROFILE: 'Professional Profile',
  PROFESSIONAL_IDENTITY: 'Professional Identity',
  PROFESSION_TYPE: 'Profession Type',
  PROFESSIONAL_STATUS: 'Professional Status',
  PROFESSIONAL_VISIBILITY: 'Professional Visibility',
  PROFESSIONAL_OWNERSHIP_REFERENCE: 'Professional Ownership Reference',
});

export const ProfessionType = Object.freeze({
  DOCTOR: 'doctor',
  DENTIST: 'dentist',
  ENGINEER: 'engineer',
  LAWYER: 'lawyer',
  CONSULTANT: 'consultant',
  FREELANCER: 'freelancer',
  TECHNICAL_SPECIALIST: 'technical_specialist',
  OTHER_PROFESSIONAL: 'other_professional',
});

export const ProfessionalVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const ProfessionalStatus = Object.freeze({
  CREATED: ProfileStatus.CREATED,
  PENDING: ProfileStatus.PENDING,
  ACTIVE: ProfileStatus.ACTIVE,
  SUSPENDED: ProfileStatus.SUSPENDED,
  ARCHIVED: ProfileStatus.ARCHIVED,
});

export const REQUIRED_PROFESSIONAL_PROFILE_FIELDS = Object.freeze(['professionalIdentityRef', 'profileRef', 'professionType', 'visibility', 'status', 'ownershipRef']);
export const PROFESSIONAL_IDENTITY_REFERENCE_PATTERN = /^professional_identity:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const PROFILE_REFERENCE_PATTERN = /^profile:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const USER_ACCOUNT_REFERENCE_PATTERN = /^user_account:[a-z0-9][a-z0-9._:-]{2,127}$/i;
