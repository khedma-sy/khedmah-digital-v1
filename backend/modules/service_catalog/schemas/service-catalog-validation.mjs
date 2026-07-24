import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { SERVICE_CATEGORY_REFERENCE_PATTERN, SERVICE_IDENTITY_REFERENCE_PATTERN, SERVICE_OWNER_REFERENCE_PATTERN, SERVICE_SUBCATEGORY_REFERENCE_PATTERN, REQUIRED_SERVICE_FIELDS, ServiceCategory, ServiceStatus, ServiceSubcategory, ServiceTaxonomy, ServiceType, ServiceVisibility, WorkflowTypeReference } from '../domain/service-types.mjs';
import { validateServiceOwnershipReference } from '../domain/ownership.mjs';

const serviceCategories = Object.freeze(Object.values(ServiceCategory));
const serviceSubcategories = Object.freeze(Object.values(ServiceSubcategory));
const serviceTypes = Object.freeze(Object.values(ServiceType));
const serviceStatuses = Object.freeze(Object.values(ServiceStatus));
const serviceVisibilities = Object.freeze(Object.values(ServiceVisibility));
const workflowTypeReferences = Object.freeze(Object.values(WorkflowTypeReference));

export function validateServiceTaxonomyReference(category, subcategory) {
  const errors = [];
  if (!serviceCategories.includes(category)) errors.push({ field: 'category', code: 'SERVICE_CATEGORY_INVALID', message: 'Service category is unsupported.' });
  if (!serviceSubcategories.includes(subcategory)) errors.push({ field: 'subcategory', code: 'SERVICE_CATEGORY_INVALID', message: 'Service subcategory is unsupported.' });
  if (serviceCategories.includes(category) && serviceSubcategories.includes(subcategory) && !ServiceTaxonomy[category].includes(subcategory)) errors.push({ field: 'subcategory', code: 'SERVICE_CATEGORY_INVALID', message: 'Service subcategory must belong to the selected category.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateServiceCatalogFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_SERVICE_FIELDS),
    validateAllowedValue('category', value.category, serviceCategories),
    validateAllowedValue('subcategory', value.subcategory, serviceSubcategories),
    validateAllowedValue('serviceType', value.serviceType, serviceTypes),
    validateAllowedValue('workflowTypeRef', value.workflowTypeRef, workflowTypeReferences),
    validateAllowedValue('status', value.status, serviceStatuses),
    validateAllowedValue('visibility', value.visibility, serviceVisibilities),
    validatePattern('serviceIdentityRef', value.serviceIdentityRef, SERVICE_IDENTITY_REFERENCE_PATTERN, 'serviceIdentityRef must be a safe service identity reference.'),
    validatePattern('categoryRef', value.categoryRef, SERVICE_CATEGORY_REFERENCE_PATTERN, 'categoryRef must be a safe service category reference.'),
    validatePattern('subcategoryRef', value.subcategoryRef, SERVICE_SUBCATEGORY_REFERENCE_PATTERN, 'subcategoryRef must be a safe service subcategory reference.'),
    validatePattern('ownershipRef.ownerRef', value.ownershipRef?.ownerRef, SERVICE_OWNER_REFERENCE_PATTERN, 'ownershipRef.ownerRef must reference a business profile, professional profile, or organization.'),
    validateServiceTaxonomyReference(value.category, value.subcategory),
    validateServiceOwnershipReference(value.ownershipRef),
  );
}

export { serviceCategories as APPROVED_SERVICE_CATEGORIES, serviceStatuses as APPROVED_SERVICE_STATUSES, serviceSubcategories as APPROVED_SERVICE_SUBCATEGORIES, serviceTypes as APPROVED_SERVICE_TYPES, serviceVisibilities as APPROVED_SERVICE_VISIBILITIES, workflowTypeReferences as APPROVED_WORKFLOW_TYPE_REFERENCES };
