import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { ServiceCatalogAuditEvent, isServiceCatalogAuditEventName } from '../backend/modules/service_catalog/domain/audit-events.mjs';
import { createServiceCatalogError, ServiceCatalogErrorCode } from '../backend/modules/service_catalog/domain/errors.mjs';
import { canTransitionServiceLifecycle, validateServiceLifecycleTransition } from '../backend/modules/service_catalog/domain/lifecycle.mjs';
import { ForbiddenServiceOwnershipRule, ServiceOwnerModule, ServiceOwnershipBoundary, validateServiceOwnershipReference } from '../backend/modules/service_catalog/domain/ownership.mjs';
import { ServiceCatalogSecurityPolicy, assertNoServiceSensitiveExposure } from '../backend/modules/service_catalog/domain/security-policy.mjs';
import { ServiceCatalogConcept, ServiceCategory, ServiceStatus, ServiceSubcategory, ServiceTaxonomy, ServiceType, ServiceVisibility, WorkflowTypeReference } from '../backend/modules/service_catalog/domain/service-types.mjs';
import { ServiceVisibilityClass, validateServiceVisibilityExposure } from '../backend/modules/service_catalog/domain/visibility.mjs';
import { APPROVED_SERVICE_CATEGORIES, APPROVED_SERVICE_STATUSES, APPROVED_SERVICE_SUBCATEGORIES, APPROVED_SERVICE_TYPES, APPROVED_SERVICE_VISIBILITIES, APPROVED_WORKFLOW_TYPE_REFERENCES, validateServiceCatalogFoundation, validateServiceTaxonomyReference } from '../backend/modules/service_catalog/schemas/service-catalog-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validService = Object.freeze({
  serviceIdentityRef: 'service_identity:computer-maintenance-001',
  serviceName: 'Computer maintenance',
  category: ServiceCategory.TECHNOLOGY,
  subcategory: ServiceSubcategory.COMPUTER_MAINTENANCE,
  categoryRef: 'service_category:technology',
  subcategoryRef: 'service_subcategory:computer_maintenance',
  serviceType: ServiceType.BUSINESS_SERVICE,
  workflowTypeRef: WorkflowTypeReference.MAINTENANCE,
  visibility: ServiceVisibility.PUBLIC,
  status: ServiceStatus.CREATED,
  ownershipRef: Object.freeze({ ownerModule: ServiceOwnerModule.BUSINESS_PROFILES, ownerRef: 'business_profile:repair-shop-001' }),
});

test('service catalog module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/service_catalog/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('service concepts define identity and taxonomy only', () => {
  assert.equal(ServiceCatalogConcept.SERVICE, 'Service');
  assert.equal(ServiceCatalogConcept.SERVICE_IDENTITY, 'Service Identity');
  assert.equal(ServiceCatalogConcept.WORKFLOW_TYPE_REFERENCE, 'Workflow Type Reference');
  assert.equal(ServiceOwnershipBoundary.SERVICE_IS_PROVIDED_ENTITY_ONLY, 'service_is_provided_entity_only');
});

test('taxonomy supports category to subcategory to service references', () => {
  assert.deepEqual(APPROVED_SERVICE_CATEGORIES, Object.values(ServiceCategory));
  assert.deepEqual(APPROVED_SERVICE_SUBCATEGORIES, Object.values(ServiceSubcategory));
  assert.deepEqual(ServiceTaxonomy[ServiceCategory.TECHNOLOGY], [ServiceSubcategory.COMPUTER_MAINTENANCE, ServiceSubcategory.SOFTWARE_SOLUTIONS]);
  assert.equal(validateServiceTaxonomyReference(ServiceCategory.HEALTHCARE, ServiceSubcategory.MEDICAL_CONSULTATION).valid, true);
  assert.equal(validateServiceTaxonomyReference(ServiceCategory.FOOD, ServiceSubcategory.RESTAURANT_SERVICE).valid, true);
  assert.equal(validateServiceTaxonomyReference(ServiceCategory.CONSTRUCTION, ServiceSubcategory.BUILDING_SERVICE).valid, true);
  assert.equal(validateServiceTaxonomyReference(ServiceCategory.FOOD, ServiceSubcategory.BUILDING_SERVICE).valid, false);
});

test('workflow type references remain compatibility constants only', () => {
  assert.deepEqual(APPROVED_WORKFLOW_TYPE_REFERENCES, Object.values(WorkflowTypeReference));
  assert.ok(APPROVED_WORKFLOW_TYPE_REFERENCES.includes(WorkflowTypeReference.CONSULTATION));
  assert.ok(APPROVED_WORKFLOW_TYPE_REFERENCES.includes(WorkflowTypeReference.INSTALLATION));
  assert.ok(APPROVED_WORKFLOW_TYPE_REFERENCES.includes(WorkflowTypeReference.REPAIR));
  assert.ok(APPROVED_WORKFLOW_TYPE_REFERENCES.includes(WorkflowTypeReference.MAINTENANCE));
  assert.ok(APPROVED_WORKFLOW_TYPE_REFERENCES.includes(WorkflowTypeReference.DELIVERY_COMPATIBLE_REFERENCE));
});

test('ownership boundaries allow provider profiles and reject service/payment/marketplace ownership drift', () => {
  assert.equal(validateServiceOwnershipReference(validService.ownershipRef).valid, true);
  assert.deepEqual(APPROVED_SERVICE_TYPES, Object.values(ServiceType));
  assert.equal(ForbiddenServiceOwnershipRule.SERVICE_AS_OWNER, 'service_as_owner');
  const invalid = validateServiceOwnershipReference({ ownerModule: 'service_catalog', ownerRef: 'service_identity:001', serviceOwnerRef: 'service:owner', paymentAccountRef: 'payment:001', marketplaceBehaviorRef: 'marketplace:001', duplicateServiceOwnership: true, transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.every((error) => error.code === 'SERVICE_OWNERSHIP_INVALID'));
});

test('visibility rules define public private internal classes and prevent private/internal exposure', () => {
  assert.deepEqual(APPROVED_SERVICE_VISIBILITIES, Object.values(ServiceVisibility));
  assert.ok(ServiceVisibilityClass.public.includes('serviceName'));
  assert.ok(ServiceVisibilityClass.public.includes('descriptionRef'));
  assert.ok(ServiceVisibilityClass.public.includes('categoryRef'));
  assert.ok(ServiceVisibilityClass.private.includes('ownerRef'));
  assert.ok(ServiceVisibilityClass.internal.includes('operationalMetadataRef'));
  assert.equal(validateServiceVisibilityExposure({ visibility: ServiceVisibility.PUBLIC, fieldClass: ServiceVisibility.PUBLIC }).valid, true);
  assert.equal(validateServiceVisibilityExposure({ visibility: ServiceVisibility.PUBLIC, fieldClass: ServiceVisibility.PRIVATE }).valid, false);
  assert.equal(validateServiceVisibilityExposure({ visibility: ServiceVisibility.PUBLIC, exposesInternalReference: true }).valid, false);
});

test('lifecycle compatibility reuses Created Pending Active Suspended Archived states', () => {
  assert.deepEqual(APPROVED_SERVICE_STATUSES, Object.values(ServiceStatus));
  assert.equal(canTransitionServiceLifecycle(ServiceStatus.CREATED, ServiceStatus.PENDING), true);
  assert.equal(canTransitionServiceLifecycle(ServiceStatus.PENDING, ServiceStatus.ACTIVE), true);
  assert.equal(canTransitionServiceLifecycle(ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED), true);
  assert.equal(canTransitionServiceLifecycle(ServiceStatus.SUSPENDED, ServiceStatus.ACTIVE), true);
  assert.equal(canTransitionServiceLifecycle(ServiceStatus.ACTIVE, ServiceStatus.ARCHIVED), true);
  assert.equal(canTransitionServiceLifecycle(ServiceStatus.ARCHIVED, ServiceStatus.ACTIVE), false);
  assert.equal(validateServiceLifecycleTransition(ServiceStatus.CREATED, ServiceStatus.ACTIVE).valid, false);
});

test('validation checks identity category subcategory service type status visibility and ownership only', () => {
  assert.equal(validateServiceCatalogFoundation(validService).valid, true);
  const invalid = validateServiceCatalogFoundation({ serviceIdentityRef: 'service:001', category: ServiceCategory.FOOD, subcategory: ServiceSubcategory.BUILDING_SERVICE, categoryRef: 'category:food', subcategoryRef: 'subcategory:building', serviceType: 'marketplace_listing', workflowTypeRef: 'booking', status: 'paid', visibility: 'public', ownershipRef: { ownerModule: 'payments', ownerRef: 'payment:001' } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'serviceIdentityRef'));
  assert.ok(invalid.errors.some((error) => error.code === 'SERVICE_CATEGORY_INVALID'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.ownerModule'));
});

test('service catalog errors are compatible with Mission 052 core errors', () => {
  const invalid = createServiceCatalogError(ServiceCatalogErrorCode.SERVICE_INVALID, 'Invalid service.');
  const duplicate = createServiceCatalogError(ServiceCatalogErrorCode.SERVICE_DUPLICATE, 'Duplicate service.');
  const ownership = createServiceCatalogError(ServiceCatalogErrorCode.SERVICE_OWNERSHIP_INVALID, 'Invalid service ownership.');
  const lifecycle = createServiceCatalogError(ServiceCatalogErrorCode.SERVICE_LIFECYCLE_INVALID, 'Invalid service lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('audit compatibility defines future event constants only', () => {
  assert.equal(ServiceCatalogAuditEvent.SERVICE_CREATED, 'SERVICE_CREATED');
  assert.equal(ServiceCatalogAuditEvent.SERVICE_UPDATED, 'SERVICE_UPDATED');
  assert.equal(ServiceCatalogAuditEvent.SERVICE_STATUS_CHANGED, 'SERVICE_STATUS_CHANGED');
  assert.equal(ServiceCatalogAuditEvent.SERVICE_ARCHIVED, 'SERVICE_ARCHIVED');
  assert.equal(ServiceCatalogAuditEvent.SERVICE_OWNERSHIP_CHANGED, 'SERVICE_OWNERSHIP_CHANGED');
  assert.ok(Object.values(ServiceCatalogAuditEvent).every(isServiceCatalogAuditEventName));
});

test('dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/service_catalog/domain/service-types.mjs',
    'backend/modules/service_catalog/domain/ownership.mjs',
    'backend/modules/service_catalog/domain/visibility.mjs',
    'backend/modules/service_catalog/domain/lifecycle.mjs',
    'backend/modules/service_catalog/domain/errors.mjs',
    'backend/modules/service_catalog/domain/audit-events.mjs',
    'backend/modules/service_catalog/domain/security-policy.mjs',
    'backend/modules/service_catalog/schemas/service-catalog-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|locations|trust_verification|relationships|analytics|payments|marketplace|frontend|apps\/backend)/);
  assert.doesNotMatch(content, /controller|route|migration|ORM model|database connection/i);
});

test('security boundaries expose no secrets credentials tokens passwords or financial/payment data', () => {
  assert.equal(ServiceCatalogSecurityPolicy.storesSecretsOrCredentials, false);
  assert.equal(ServiceCatalogSecurityPolicy.storesTokensOrPasswords, false);
  assert.equal(ServiceCatalogSecurityPolicy.storesFinancialData, false);
  assert.equal(ServiceCatalogSecurityPolicy.storesPaymentData, false);
  assert.deepEqual(assertNoServiceSensitiveExposure({ serviceIdentityRef: 'service_identity:001' }), { valid: true, exposed: [] });
  assert.equal(assertNoServiceSensitiveExposure({ accessToken: 'never', paymentData: 'never' }).valid, false);
});

test('service catalog foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/service_catalog/README.md');
  assert.match(readme, /marketplace service selling/);
  assert.match(readme, /service ordering/);
  assert.match(readme, /booking/);
  assert.match(readme, /payments/);
  assert.match(readme, /commissions/);
  assert.match(readme, /ranking/);
  assert.match(readme, /advertising/);
  assert.match(readme, /AI recommendation/);
  assert.match(readme, /tracking/);
  assert.match(readme, /delivery marketplace/);
});
