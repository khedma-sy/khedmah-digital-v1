# Technical Contracts

## Purpose

This document defines the engineering contracts required before Khedmah Digital V1 implementation begins.

This is documentation and architecture only. It creates no backend, frontend, APIs, database tables, database migrations, packages, runtime code, environment files, secrets, credentials, API keys, production URLs, or Mission 007 work.

## Contract Authority

These contracts must be interpreted together with:

- `docs/governance/PLATFORM-CONSTITUTION.md`
- `docs/product/V1-SCOPE.md`
- `docs/product/RESERVED-MODULES.md`
- `docs/architecture/PRODUCTION-TECHNOLOGY-STACK.md`
- `docs/architecture/IMPLEMENTATION-ARCHITECTURE.md`
- `docs/contracts/DOMAIN-CONTRACTS.md`
- `docs/decisions/ADR-001-PRODUCTION-STACK.md`

If an implementation plan conflicts with approved V1 scope or reserved-module protection, the implementation plan must stop until governance approves the change.

## Backend Contracts

### Module Boundaries

Backend modules must be organized around approved V1 business capabilities only.

Rules:

- A module owns its application services, validation contracts, authorization checks, and persistence boundary for its approved domain area.
- Modules must not depend on reserved modules.
- Modules must not expose internal persistence details to controllers or other modules.
- Shared technical utilities must remain infrastructure-neutral and must not become hidden product features.
- Cross-module communication must happen through explicit service contracts or approved API boundaries.

### Service Responsibilities

Application services coordinate approved use cases.

Service responsibilities:

- Enforce domain rules after request validation.
- Coordinate persistence through approved repositories or adapters.
- Apply authorization decisions before privileged actions.
- Produce predictable success and failure outcomes.
- Avoid direct framework response handling where domain behavior should remain testable.

Services must not create APIs, database tables, jobs, or integrations unless a future implementation mission authorizes them.

### Controller Responsibilities

Controllers are API boundary adapters.

Controller responsibilities:

- Receive authorized HTTP requests once APIs are approved.
- Delegate business decisions to application services.
- Apply request validation pipes or equivalent framework validation.
- Return documented response shapes.
- Avoid embedding business rules that belong in services or domain policies.

No controllers are created by this document.

### Validation Rules

Validation must be explicit at every external input boundary.

Rules:

- Validate request body, route parameters, query parameters, headers, and uploaded file metadata where applicable.
- Reject unknown or unsafe input when appropriate.
- Normalize input only where rules are documented.
- Keep validation aligned with domain contracts.
- Treat validation failures as client errors with stable error response shapes.

No validation schemas are created by this document.

### Error Handling Principles

Error handling must be consistent and safe.

Principles:

- Do not expose stack traces, database errors, secrets, tokens, or internal infrastructure details to clients.
- Use stable machine-readable error codes.
- Include Arabic-ready user-facing messages where product requirements authorize UI exposure.
- Preserve correlation identifiers in logs and responses where appropriate.
- Distinguish validation, authentication, authorization, not found, conflict, rate limit, and internal errors.

### Logging Principles

Logging must support operations without leaking sensitive data.

Principles:

- Use structured logs.
- Include request correlation identifiers.
- Log security-relevant events.
- Do not log secrets, credentials, tokens, private keys, full session identifiers, or sensitive customer data.
- Keep logs environment-aware and production-safe.

### Security Boundaries

Backend security boundaries:

- Authentication must be verified before protected actions.
- Authorization must be checked for role-aware and ownership-aware behavior.
- Input validation must happen before application logic.
- Rate limiting must be planned for public and authentication-sensitive endpoints.
- File handling must restrict unsafe content and unsafe metadata.

## Frontend Contracts

### Application Structure

The frontend must follow a clear structure when implementation is authorized.

Structure direction:

- Route-level areas for approved V1 journeys.
- Reusable components separated from route-specific composition.
- API communication utilities separated from presentation components.
- Localization and RTL helpers treated as first-class concerns.
- Testable UI logic separated from framework-specific rendering where practical.

No frontend folders or screens are created by this document.

### Routing Principles

Routing must support Arabic-first product flows.

Principles:

- Routes must map to approved V1 journeys only.
- Admin routes must be separated from public and authenticated user routes.
- Reserved modules must not receive routes.
- Route names must remain stable and understandable.
- Future locale-aware routing may be introduced only when implementation is authorized.

### Component Boundaries

Component boundaries:

- Design primitives should be reusable and RTL-safe.
- Feature components should not own global application state unless explicitly justified.
- Components must not directly access secrets or privileged configuration.
- Components must not directly access the database.
- Components should distinguish loading, empty, success, and error states.

### State Management Direction

State management must remain minimal until product complexity requires otherwise.

Direction:

- Use local component state for local UI behavior.
- Use server-provided data through approved API communication boundaries.
- Introduce shared client state only for cross-cutting UI needs.
- Avoid premature global stores.
- Keep authentication/session state behind explicit boundaries.

### API Communication Principles

Frontend API communication:

- Must use approved API contracts only.
- Must handle validation errors, authorization errors, rate limits, and unavailable services predictably.
- Must not embed production URLs, secrets, API keys, or privileged credentials.
- Must include correlation identifiers where approved and technically appropriate.
- Must support Arabic-ready error display without exposing internal implementation details.

### RTL Requirements

Arabic-first RTL requirements:

- Arabic and RTL layout must be treated as the default design assumption.
- Components must avoid left-to-right-only spacing, alignment, icons, and motion assumptions.
- Text truncation, forms, tables, navigation, and dialogs must be reviewed for RTL behavior.
- Locale-aware number, date, and text formatting must be planned before UI implementation.

### Accessibility Requirements

Accessibility requirements:

- Use semantic HTML where applicable.
- Preserve keyboard navigation.
- Provide accessible labels for forms and controls.
- Maintain sufficient color contrast.
- Ensure Arabic text and RTL layout do not break screen-reader or focus behavior.

## API Contracts

### API Naming Conventions

API naming conventions:

- Use lowercase kebab-case path segments.
- Use plural resource names for collections.
- Use nouns for resources and reserve verbs for approved actions that cannot be represented as resource state changes.
- Keep administrative APIs under a clearly separated admin boundary when authorized.
- Do not expose reserved modules through API names.

No API routes are created by this document.

### Versioning Strategy

Versioning strategy:

- Use explicit API versioning from the first approved API implementation.
- Treat breaking changes as new versions or governed migration events.
- Keep internal implementation versions separate from public contract versions.
- Document deprecation windows before removing exposed contracts.

### Request/Response Principles

Request and response principles:

- Requests must use explicit DTO-style contracts.
- Responses must be predictable and documented.
- Timestamps must use a consistent format when implementation is authorized.
- Identifiers must be opaque to clients unless governance approves otherwise.
- Responses must not leak internal database or infrastructure details.

### Error Response Format

API errors should use a stable format when implementation is authorized:

```json
{
  "error": {
    "code": "stable_error_code",
    "message": "Safe user-facing or client-facing message",
    "details": [],
    "correlationId": "request-correlation-id"
  }
}
```

This example is a documentation contract only and is not runtime code.

### Pagination Standards

Pagination standards:

- Collection endpoints must define pagination before implementation.
- Default and maximum page sizes must be documented per resource.
- Cursor pagination is preferred for high-volume or mutable lists.
- Offset pagination may be used only where consistency and volume make it acceptable.
- Pagination metadata must be consistent across APIs.

### Filtering Standards

Filtering standards:

- Filters must be explicit and allowlisted.
- Free-text search must be separated from structured filters where practical.
- Sorting fields must be allowlisted.
- Filtering must not expose unauthorized records.
- Reserved-module fields must not appear in V1 filters.

## Database Contracts

### Entity Ownership Rules

Entity ownership rules:

- Every future entity must have a clearly documented owning domain.
- Ownership determines who may create, update, delete, validate, and expose records.
- Cross-domain relationships must be explicit and reviewed.
- Reserved modules must not own V1 entities until approved.

No entities are created by this document.

### Relational Principles

Relational principles:

- PostgreSQL is the primary relational database direction.
- Relationships must reflect approved domain contracts.
- Referential integrity should be enforced where appropriate.
- Data duplication must be intentional and documented.
- Sensitive data must be minimized and protected.

### Migration Rules

Migration rules:

- No migrations are created during documentation-only missions.
- Future migrations must be deterministic and code-reviewed.
- Future migrations must include rollback or forward-fix strategy.
- Future migrations must not include production data or secrets.
- Schema changes must align with approved domain contracts.

### Indexing Principles

Indexing principles:

- Indexes must support approved query patterns.
- Indexes must be reviewed for write-cost and storage impact.
- Unique constraints must enforce business invariants where appropriate.
- Search indexes must not introduce reserved-module scope.

### Audit Requirements

Audit requirements:

- Security-sensitive actions must be auditable.
- Administrative actions must be auditable.
- Ownership and permission changes must be auditable.
- Audit data must avoid storing secrets, tokens, or unnecessary sensitive payloads.
- Audit implementation requires future mission authorization.

## Security Contracts

### Authentication Boundary

Authentication boundary:

- Authentication verifies identity before protected access.
- Session handling must be explicit and secure.
- Authentication secrets must remain outside the repository.
- Authentication implementation requires future mission authorization.

### Authorization Boundary

Authorization boundary:

- Authorization determines whether an authenticated actor may perform an action.
- Authorization must consider role, membership, ownership, and administrative privilege where applicable.
- Authorization failures must not reveal unauthorized resource details.
- Admin authorization must be separated from regular user authorization.

### Secrets Handling

Secrets handling:

- Do not commit secrets, credentials, tokens, private keys, API keys, production URLs, or environment files.
- Use environment-specific secret management outside the repository when implementation is authorized.
- Rotate secrets if exposure is suspected.
- Never place real production values in documentation examples.

### Input Validation

Input validation:

- Validate all external input before business logic.
- Sanitize output only where presentation context requires it.
- Restrict file uploads by type, size, and safety policy.
- Reject unexpected fields when appropriate.
- Keep validation rules aligned with domain contracts.

### Rate Limiting Principles

Rate limiting principles:

- Public endpoints must have rate limiting before production exposure.
- Authentication endpoints must receive stricter abuse protection.
- Admin endpoints must be protected by authentication, authorization, and operational monitoring.
- Rate limit responses must be predictable and must not leak internals.

## Mission 006 Protection Confirmation

This document is documentation only. It does not implement backend, frontend, APIs, database tables, migrations, packages, runtime code, production infrastructure, environment files, secrets, credentials, API keys, production URLs, or Mission 007 work.
