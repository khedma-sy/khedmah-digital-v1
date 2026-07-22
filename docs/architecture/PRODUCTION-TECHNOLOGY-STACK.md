# Production Technology Stack

## Purpose

This document defines the official production technology stack preparation baseline for Khedmah Digital V1.

This is an architecture preparation document only. It does not create backend code, frontend code, APIs, database models, migrations, packages, runtime infrastructure, environment files, secrets, credentials, API keys, or production URLs.

## Decision Summary

Khedmah Digital V1 will use a TypeScript-centered production stack with a clear separation between frontend, backend, database, infrastructure, and storage responsibilities.

| Area | Official direction |
| --- | --- |
| Frontend | Next.js with React and TypeScript |
| Backend | NestJS with TypeScript |
| API approach | Versioned REST APIs first, documented with OpenAPI when implementation is authorized |
| Database | PostgreSQL |
| Migration strategy | Code-reviewed, reversible database migrations introduced only during an approved implementation mission |
| Infrastructure | Container-ready application services with separated environments |
| Storage | Object storage for media and uploaded files |

## Frontend

### Framework

The official frontend framework direction is Next.js with React.

Reasons:

- Strong production ecosystem for web applications.
- Mature routing, rendering, asset, and build capabilities.
- Good fit for Arabic-first responsive web experiences.
- Supports controlled implementation without requiring early backend coupling.

### Language

Frontend implementation must use TypeScript.

Reasons:

- Improves maintainability as product scope grows.
- Makes contracts between UI, API clients, and domain types easier to review.
- Reduces avoidable runtime errors during controlled implementation.

### Mobile/Web Strategy

V1 will begin with a responsive web application strategy.

- Mobile web support is required from the beginning.
- Native mobile applications are not part of the initial implementation baseline.
- Progressive Web App capabilities may be evaluated later if approved by governance.
- Native mobile implementation remains reserved until explicitly approved.

### RTL Support

Arabic-first and right-to-left support are mandatory.

Frontend implementation must plan for:

- `dir="rtl"` as the default Arabic interface direction.
- Arabic typography and spacing rules.
- RTL-safe layout primitives.
- Locale-aware formatting for dates, numbers, and text.
- No left-to-right-only design assumptions.

### Testing Approach

Frontend testing direction:

- Unit tests for reusable logic and presentation helpers.
- Component tests for critical UI behavior.
- Accessibility checks for Arabic-first interface quality.
- End-to-end tests for approved user journeys once screens are authorized.

No frontend tests are created by this document.

### Build System

The frontend build system will use the official Next.js build pipeline when implementation is authorized.

Build preparation principles:

- Keep build configuration minimal.
- Avoid premature custom bundler configuration.
- Treat linting, type checking, testing, and production builds as separate quality gates.
- Do not add packages or build files during this documentation mission.

## Backend

### Framework

The official backend framework direction is NestJS.

Reasons:

- TypeScript-first backend development.
- Modular architecture suitable for controlled V1 boundaries.
- Clear support for controllers, providers, guards, pipes, and dependency injection.
- Strong fit for maintainable business workflows without introducing microservices prematurely.

### Language

Backend implementation must use TypeScript.

Reasons:

- Aligns frontend and backend language choices.
- Supports shared contract thinking without requiring shared runtime packages during foundation preparation.
- Improves maintainability and review quality.

### API Approach

The official API approach is versioned REST APIs first.

Implementation rules:

- API implementation requires a separately approved implementation mission.
- API contracts must follow domain contract reconciliation before runtime code is created.
- OpenAPI documentation should be generated or maintained when APIs are authorized.
- GraphQL is not selected for V1 baseline.
- Public API exposure must be explicitly approved.

### Validation Strategy

Backend validation must be explicit at request boundaries.

Preparation baseline:

- Validate incoming payloads before business logic.
- Use DTO-style request and response contracts when implementation is authorized.
- Keep validation aligned with domain contracts.
- Reject unrecognized or unsafe input where appropriate.
- Do not create validation schemas during this documentation mission.

### Authentication Foundation

Authentication must be designed as a boundary before implementation.

Preparation baseline:

- Support role-aware access control for approved user and admin capabilities.
- Prefer standards-based authentication foundations.
- Keep secrets and credentials outside the repository.
- Do not create authentication code, auth routes, tokens, keys, or environment files during this mission.

## Database

### Primary Database

The official primary database direction is PostgreSQL.

Reasons:

- Mature relational data model support.
- Strong transactional guarantees.
- Broad operational ecosystem.
- Good fit for business records, ownership boundaries, auditability, and future reporting needs.

### Migration Strategy

Database migrations must be introduced only during an approved implementation mission.

Migration principles:

- Every schema change must be reviewed.
- Migrations must be deterministic and reproducible.
- Rollback or forward-fix strategy must be documented before production use.
- Migration files must not appear during documentation-only missions.
- Database state must be environment-specific and never committed as production data.

### Data Ownership Principles

Data ownership must follow explicit domain boundaries.

Principles:

- Each domain area must own its data definitions.
- Cross-domain data access must happen through approved service or contract boundaries.
- Reserved modules must not introduce tables, relationships, or obligations.
- Customer data, production data, and credentials must never be committed.

## Infrastructure

### Deployment Direction

The production deployment direction is container-ready services with separated frontend, backend, database, and storage responsibilities.

Preparation baseline:

- Runtime deployment files are not created by this document.
- Production infrastructure must be introduced only by an approved implementation or operations mission.
- The stack must support repeatable deployments and rollback procedures once implementation begins.

### Environment Separation

Environment separation is mandatory.

Expected future environments:

- Local development.
- Test or continuous integration.
- Staging.
- Production.

Rules:

- No production URLs in the repository.
- No secrets or credentials in the repository.
- Environment files must not be committed.
- Environment-specific configuration must be documented before use.

### Monitoring Principles

Monitoring must be planned before production launch.

Principles:

- Application health checks.
- Structured logs.
- Error tracking.
- Performance metrics.
- Security-relevant audit events.
- Alerting for availability and critical failures.

No monitoring service is implemented by this document.

### Security Baseline

Security baseline:

- No secrets, credentials, tokens, API keys, private keys, production URLs, or environment files in the repository.
- Authentication and authorization must be explicit boundaries.
- Input validation is mandatory at backend request boundaries.
- File uploads must be scanned or restricted according to future security policy.
- Production access must follow least privilege.

## Storage

### Media Storage Strategy

The official storage direction is object storage for media and uploaded files.

Preparation baseline:

- Store files outside the application runtime filesystem.
- Store metadata in PostgreSQL only after database implementation is authorized.
- Use signed or controlled access patterns where appropriate.
- Keep storage providers configurable without committing provider credentials.

### File Handling Principles

File handling must follow security-first rules:

- Validate file type and size.
- Restrict executable or unsafe uploads.
- Separate original files from generated derivatives where applicable.
- Avoid exposing direct private storage paths.
- Do not implement upload workflows during this documentation mission.

## Explicit Non-Implementation Statement

This document does not implement product functionality. It creates no backend, frontend, API, database, migration, infrastructure, package installation, runtime code, environment file, secret, credential, API key, or production URL.
