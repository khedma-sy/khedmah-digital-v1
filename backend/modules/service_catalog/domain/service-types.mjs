import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const ServiceCatalogConcept = Object.freeze({
  SERVICE: 'Service',
  SERVICE_IDENTITY: 'Service Identity',
  SERVICE_CATEGORY: 'Service Category',
  SERVICE_SUBCATEGORY: 'Service Subcategory',
  SERVICE_TYPE: 'Service Type',
  WORKFLOW_TYPE_REFERENCE: 'Workflow Type Reference',
  SERVICE_STATUS: 'Service Status',
  SERVICE_VISIBILITY: 'Service Visibility',
  SERVICE_OWNERSHIP_REFERENCE: 'Service Ownership Reference',
});

export const ServiceCategory = Object.freeze({
  TECHNOLOGY: 'technology',
  HEALTHCARE: 'healthcare',
  FOOD: 'food',
  CONSTRUCTION: 'construction',
});

export const ServiceSubcategory = Object.freeze({
  COMPUTER_MAINTENANCE: 'computer_maintenance',
  SOFTWARE_SOLUTIONS: 'software_solutions',
  MEDICAL_CONSULTATION: 'medical_consultation',
  RESTAURANT_SERVICE: 'restaurant_service',
  BUILDING_SERVICE: 'building_service',
});

export const ServiceTaxonomy = Object.freeze({
  [ServiceCategory.TECHNOLOGY]: Object.freeze([ServiceSubcategory.COMPUTER_MAINTENANCE, ServiceSubcategory.SOFTWARE_SOLUTIONS]),
  [ServiceCategory.HEALTHCARE]: Object.freeze([ServiceSubcategory.MEDICAL_CONSULTATION]),
  [ServiceCategory.FOOD]: Object.freeze([ServiceSubcategory.RESTAURANT_SERVICE]),
  [ServiceCategory.CONSTRUCTION]: Object.freeze([ServiceSubcategory.BUILDING_SERVICE]),
});

export const ServiceType = Object.freeze({
  BUSINESS_SERVICE: 'business_service',
  PROFESSIONAL_SERVICE: 'professional_service',
  ORGANIZATIONAL_SERVICE: 'organizational_service',
});

export const WorkflowTypeReference = Object.freeze({
  CONSULTATION: 'consultation',
  INSTALLATION: 'installation',
  REPAIR: 'repair',
  MAINTENANCE: 'maintenance',
  DELIVERY_COMPATIBLE_REFERENCE: 'delivery_compatible_reference',
});

export const ServiceVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const ServiceStatus = Object.freeze({
  CREATED: ProfileStatus.CREATED,
  PENDING: ProfileStatus.PENDING,
  ACTIVE: ProfileStatus.ACTIVE,
  SUSPENDED: ProfileStatus.SUSPENDED,
  ARCHIVED: ProfileStatus.ARCHIVED,
});

export const REQUIRED_SERVICE_FIELDS = Object.freeze(['serviceIdentityRef', 'serviceName', 'categoryRef', 'subcategoryRef', 'serviceType', 'workflowTypeRef', 'visibility', 'status', 'ownershipRef']);
export const SERVICE_IDENTITY_REFERENCE_PATTERN = /^service_identity:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const SERVICE_CATEGORY_REFERENCE_PATTERN = /^service_category:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const SERVICE_SUBCATEGORY_REFERENCE_PATTERN = /^service_subcategory:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const SERVICE_OWNER_REFERENCE_PATTERN = /^(business_profile|professional_profile|organization):[a-z0-9][a-z0-9._:-]{2,127}$/i;
