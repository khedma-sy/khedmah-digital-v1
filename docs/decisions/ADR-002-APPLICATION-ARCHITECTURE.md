# ADR-002: Application Architecture

## Status

Accepted for implementation preparation.

## Context

Khedmah Digital V1 requires an official application architecture direction before controlled implementation begins.

The architecture must preserve:

- Arabic-first product direction.
- V1 scope protection.
- Reserved module isolation.
- Frontend/backend separation.
- Explicit API and database boundaries.
- Documentation-first governance.

This ADR is documentation only and does not start implementation.

## Decision

Khedmah Digital V1 will use a modular monorepo application architecture with separated frontend and backend applications, explicit API boundaries, explicit database ownership boundaries, and a staged scalability approach.

### Monorepo Strategy

The repository remains the single source of truth for documentation and future approved implementation.

Monorepo direction:

- Keep frontend, backend, shared contracts, infrastructure documentation, and tests coordinated in one repository when implementation is authorized.
- Preserve clear boundaries between applications and packages.
- Avoid shared runtime packages until a future mission authorizes package creation.
- Keep governance and architecture documents colocated with implementation decisions.

### Frontend/Backend Separation

Frontend and backend must be separate application layers.

Rules:

- Frontend must not directly access the database.
- Frontend must consume approved APIs only.
- Backend must own request validation, authorization, domain coordination, and persistence access.
- Admin capabilities must be separated from public and authenticated user experiences.

### API Boundary

The official API boundary is versioned REST first.

Rules:

- APIs require future implementation authorization.
- API contracts must be documented before runtime exposure.
- API responses must not leak database or infrastructure details.
- OpenAPI documentation should accompany approved API implementation.

### Database Boundary

The official database boundary is PostgreSQL behind backend persistence adapters or repositories.

Rules:

- Database access must not bypass backend domain ownership.
- Database tables and migrations require future implementation authorization.
- Schema design must follow domain contracts.
- Reserved modules must not introduce data ownership obligations.

### Future Scalability Approach

The architecture will scale in stages:

1. Modular monorepo with separated frontend and backend applications.
2. Clear module boundaries inside the backend.
3. Explicit database ownership and indexing decisions.
4. Operational monitoring and security controls before production exposure.
5. Service extraction only if usage, team scale, or operational needs justify it later.

Microservices are not selected as the starting architecture.

## Alternatives Considered

### Separate Repositories

Rejected for V1 baseline.

Reasons:

- Slower coordination across governance, contracts, frontend, backend, and documentation.
- More operational overhead before the implementation team and product scope justify it.
- Higher risk of documentation and implementation drift.

### Monolithic Application

Rejected as a single runtime application baseline.

Reasons:

- A single combined frontend/backend runtime would blur API and deployment boundaries.
- It could make future role, admin, and scaling controls harder to reason about.
- The selected approach keeps a monorepo while separating frontend and backend applications.

### Microservices First

Rejected for V1 baseline.

Reasons:

- Premature operational complexity.
- Requires service discovery, network security, distributed tracing, deployment orchestration, and data consistency decisions too early.
- Slower development speed before product workflows are proven.

### Serverless First

Rejected for V1 baseline.

Reasons:

- Can accelerate narrow functions, but may fragment business logic and increase provider coupling.
- Requires careful cold-start, observability, local development, and permissions design early.
- Less aligned with the selected NestJS backend direction.

### Mobile First

Rejected for V1 baseline.

Reasons:

- Expands design, release, testing, and platform scope before V1 web workflows are validated.
- Conflicts with the selected responsive web-first strategy.
- Native mobile remains possible only through future governance approval.

## Reasons

### Maintainability

The selected architecture improves maintainability by:

- Keeping one repository as the source of truth.
- Separating frontend, backend, API, database, and admin boundaries.
- Supporting modular backend organization.
- Keeping documentation, ADRs, and future implementation aligned.

### Scalability

The selected architecture supports scalability by:

- Avoiding premature microservices while preserving future extraction paths.
- Allowing frontend and backend applications to scale separately.
- Keeping database access behind backend ownership boundaries.
- Supporting staged operational maturity.

### Security

The selected architecture supports security by:

- Preventing direct frontend database access.
- Requiring explicit API, authentication, authorization, and admin boundaries.
- Keeping secrets and environment configuration outside the repository.
- Deferring runtime implementation until approved missions define controls.

### Development Speed

The selected architecture supports development speed by:

- Reducing coordination overhead with a monorepo.
- Avoiding microservices and multi-repository complexity too early.
- Preserving clear paths for future frontend, backend, and testing work.
- Keeping TypeScript-centered architecture decisions aligned with ADR-001.

### Investor Readiness

The selected architecture supports investor readiness by:

- Demonstrating controlled technical governance.
- Showing a credible path from documentation to implementation.
- Preserving scalability without premature complexity.
- Protecting V1 scope and reserved future opportunities.

## Mandatory Protection Confirmation

This ADR confirms:

- No implementation happened.
- No code was added.
- No packages were installed.
- No APIs were created.
- No database was created.
- No database tables were created.
- No database migrations were created.
- No frontend screens were created.
- No backend services were created.
- No production infrastructure was created.
- No secrets, credentials, API keys, environment files, production URLs, tokens, or private keys were added.
- Mission 007 was not started.

## Consequences

### Positive Consequences

- Establishes a controlled implementation architecture direction.
- Preserves Arabic-first and V1 scope commitments.
- Keeps reserved modules isolated.
- Enables future implementation missions to create code under clear contracts.

### Tradeoffs

- Future missions must still create actual application scaffolding, package configuration, runtime code, APIs, database schemas, migrations, tests, and deployment configuration separately if authorized.
- Monorepo governance requires discipline to prevent hidden coupling.
- Service extraction is deferred until justified by real scale or operational needs.

## Non-Implementation Statement

This ADR is documentation only. It does not implement backend, frontend, APIs, database tables, database migrations, packages, runtime code, production infrastructure, environment files, secrets, credentials, API keys, production URLs, or Mission 007 work.
