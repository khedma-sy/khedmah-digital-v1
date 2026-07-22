# ADR-001: Production Stack

## Status

Accepted for implementation preparation.

## Context

Khedmah Digital V1 has completed its documentation foundation baseline and requires an official production technology stack before controlled implementation begins.

The decision must preserve:

- Arabic-first product direction.
- V1 scope protection.
- Reserved module isolation.
- Documentation-first governance.
- No runtime implementation during this mission.

## Decision

Khedmah Digital V1 will use the following production stack direction:

| Area | Decision |
| --- | --- |
| Frontend | Next.js with React and TypeScript |
| Backend | NestJS with TypeScript |
| API style | Versioned REST APIs first, with OpenAPI documentation when implementation is authorized |
| Database | PostgreSQL |
| Migrations | Reviewed, deterministic, reversible or forward-fixable migrations introduced only during approved implementation |
| Infrastructure | Container-ready services with separated environments |
| Storage | Object storage for media and uploaded files |
| Mobile strategy | Responsive web first; native mobile remains future scope |

This decision is architecture preparation only. It does not authorize implementation by itself.

## Alternatives Considered

### Frontend Alternatives

#### Plain React with Vite

Rejected for V1 baseline.

Reasons:

- Strong developer experience, but requires more architectural decisions around routing, rendering, and production conventions.
- Less opinionated than desired for a controlled implementation baseline.

#### Angular

Rejected for V1 baseline.

Reasons:

- Mature framework, but heavier adoption path for the current TypeScript-centered web strategy.
- Less aligned with the preferred React ecosystem direction.

#### Native Mobile First

Rejected for V1 baseline.

Reasons:

- Expands implementation scope too early.
- Creates additional release, design, and platform complexity.
- Conflicts with responsive web first preparation.

### Backend Alternatives

#### Express Minimal Backend

Rejected for V1 baseline.

Reasons:

- Mature and flexible, but requires more custom structure for modules, validation, dependency boundaries, and authorization conventions.
- Higher risk of inconsistent implementation patterns as the project grows.

#### Laravel

Rejected for V1 baseline.

Reasons:

- Mature and productive, but would split the primary language strategy between frontend TypeScript and backend PHP.
- Less aligned with the selected TypeScript-centered repository direction.

#### Django

Rejected for V1 baseline.

Reasons:

- Mature and secure framework, but would split the language strategy between frontend TypeScript and backend Python.
- Not selected as the primary ecosystem for this repository.

### API Alternatives

#### GraphQL First

Rejected for V1 baseline.

Reasons:

- Useful for complex client-driven querying, but adds schema governance and operational complexity early.
- Versioned REST is simpler for controlled V1 implementation and auditability.

#### Event-Driven or Microservices First

Rejected for V1 baseline.

Reasons:

- Premature for V1.
- Adds infrastructure and operational complexity before product implementation is authorized.

### Database Alternatives

#### MySQL

Rejected for V1 baseline.

Reasons:

- Mature relational database, but PostgreSQL is preferred for relational modeling, transactional guarantees, extensibility, and future reporting needs.

#### MongoDB

Rejected for V1 baseline.

Reasons:

- Flexible document model, but V1 business records need clear relational ownership, consistency, and auditability.

#### Serverless/Managed Document Store First

Rejected for V1 baseline.

Reasons:

- Can accelerate prototypes, but may increase coupling to provider-specific behavior.
- Relational PostgreSQL better supports the expected business data model.

## Reasons

### Scalability

The selected stack supports staged scalability:

- Next.js can support responsive web delivery and production build optimization.
- NestJS supports modular backend organization before service decomposition is necessary.
- PostgreSQL supports transactional business records and can scale operationally with proven patterns.
- Object storage separates media growth from application runtime storage.

### Maintainability

The stack improves maintainability by:

- Using TypeScript across frontend and backend.
- Separating frontend, backend, database, API, authentication, admin, and storage boundaries.
- Supporting explicit domain-aligned modules.
- Avoiding premature microservices, native mobile, or multi-language complexity.

### Security

The stack supports security through:

- Explicit backend request validation.
- Role-aware authorization boundaries.
- Standards-based authentication planning.
- Environment separation.
- No committed secrets, credentials, production URLs, API keys, private keys, or environment files.

### Developer Productivity

The stack supports productivity through:

- Mature documentation and ecosystem support.
- Shared TypeScript language across web and backend layers.
- Opinionated framework conventions for routing, modules, dependency boundaries, testing, and builds.
- Reduced early operational complexity.

### Ecosystem Maturity

The stack is selected for mature ecosystems:

- React and Next.js for production web applications.
- NestJS for structured TypeScript backend services.
- PostgreSQL for relational persistence.
- Object storage patterns for media and file handling.

## Security Requirements

This ADR confirms that the decision introduces none of the following:

- Secrets.
- Credentials.
- Production URLs.
- API keys.
- Private keys.
- Environment files.
- Runtime code.
- APIs.
- Database models.
- Migrations.
- Frontend screens.
- Backend services.
- Production infrastructure.

## Consequences

### Positive Consequences

- Establishes a clear implementation baseline.
- Preserves Arabic-first and V1 scope requirements.
- Keeps reserved modules isolated.
- Enables future implementation missions to proceed with consistent architecture decisions.

### Tradeoffs

- The stack decision may require future implementation missions to add package management, framework scaffolding, test tooling, and deployment configuration separately.
- Native mobile and GraphQL remain available only as future, separately approved decisions.
- Database schema design remains intentionally deferred until domain contracts are reconciled for implementation.

## Non-Implementation Confirmation

This ADR is documentation only. It does not create backend code, frontend code, APIs, database models, migrations, infrastructure, packages, environment files, secrets, credentials, API keys, private keys, production URLs, or product features.
