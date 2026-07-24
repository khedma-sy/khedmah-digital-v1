# Service Catalog Module Foundation

## Mission 059 Boundary

This module defines the Khedmah Digital V1 Service Catalog foundation for service identity and taxonomy only. It does not implement API routes, controllers, database models, ORM models, migrations, authentication, authorization middleware, marketplace service selling, service ordering, booking, payments, subscriptions, commissions, delivery marketplace behavior, provider matching, workflow execution, ranking, advertising, AI recommendation, tracking, frontend screens, UI, or production infrastructure.

## Service Domain Foundation

The module owns foundation references for Service, Service Identity, Service Category, Service Subcategory, Service Type, Workflow Type Reference, Service Status, Service Visibility, and Service Ownership Reference. These remain separate from Business Profile, Professional Profile, Organization, User Account, and base Profile entities.

## Taxonomy Decisions

The supported reference chain is Category → Subcategory → Service. Initial V1 taxonomy references are Technology with computer maintenance and software solutions, Healthcare with medical consultation, Food with restaurant service, and Construction with building service. Search, ranking, marketplace discovery, and provider matching are intentionally excluded.

## Workflow Type Compatibility

Workflow type references are future-compatible constants only: Consultation, Installation, Repair, Maintenance, and Delivery-compatible reference only. No workflow engine is implemented.

## Ownership Decisions

Business Profile can provide services, Professional Profile can provide professional services, and Organization can provide organizational services. The service catalog prevents Service from becoming an owner, Service owning payments, Service owning marketplace behavior, unauthorized ownership transfer, and duplicate service ownership.

## Visibility Decisions

Public service data is limited to service name, description reference, and category reference. Private fields hold provider/internal references. Internal fields hold operational metadata. Private and internal exposure is rejected for public visibility.

## Lifecycle Compatibility

Service statuses reuse Created, Pending, Active, Suspended, and Archived to stay compatible with identity and profile lifecycle contracts. No workflow engine is implemented.

## Error and Audit Compatibility

Service catalog errors use Mission 052 core errors with SERVICE_INVALID, SERVICE_DUPLICATE, SERVICE_OWNERSHIP_INVALID, SERVICE_CATEGORY_INVALID, and SERVICE_LIFECYCLE_INVALID. Future audit event constants are SERVICE_CREATED, SERVICE_UPDATED, SERVICE_STATUS_CHANGED, SERVICE_ARCHIVED, and SERVICE_OWNERSHIP_CHANGED. No API responses or audit storage are implemented.

## Allowed Dependencies

The service catalog may depend only on `backend/core`, `backend/shared`, `backend/modules/identity`, `backend/modules/users`, `backend/modules/profiles`, `backend/modules/business_profiles`, `backend/modules/professional_profiles`, and `backend/modules/organizations` by reference.

## Forbidden Dependencies

The service catalog must not depend on database, locations, trust verification, relationships, analytics, payments, marketplace, frontend, database models, migrations, production infrastructure, or delivery marketplace systems.

## Security and KILL CRITICAL Review

This foundation stores or exposes no secrets, credentials, tokens, passwords, financial data, payment data, private user documents, marketplace service selling, service ordering, booking engine, payment processing, commission system, ranking system, advertising system, AI recommendation engine, tracking system, or delivery marketplace.
