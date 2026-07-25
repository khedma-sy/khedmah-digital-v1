# Mission 069F — Runtime Domain Integration Strategy Audit

## 1. Decision

**Official integration model: Option B — the executable `apps/backend` host consumes canonical backend modules through explicit adapters.**

**Readiness decision: REQUIRES FURTHER RECONCILIATION.**

The target architecture is decided, but an implementation plan is not yet safe because runtime identity, profile, organization, audit, and analytics shapes differ from canonical contracts; the canonical application/repository layers are mostly placeholders; package/type boundaries are not defined; and canonical tests currently fail in both workspaces.

This audit changes no runtime, API, database, migration, or feature behavior.

## 2. Repository Identity

| Check | Result |
| --- | --- |
| Working directory | `/workspace/khedmah-digital-v1` |
| Git root | `/workspace/khedmah-digital-v1` |
| Repository basename | `khedmah-digital-v1` |
| Branch | `work` |
| Remote | None configured |
| Initial status | Clean |
| Legacy repository | Not detected |

## 3. Current Executable Runtime

### Bootstrap and composition

`apps/backend/src/main.ts` is the only backend process entry point. It loads platform configuration, creates the NestJS application, and listens on the configured port. `apps/backend/src/app.module.ts` composes Identity, Organizations, Contact, and Analytics modules plus Health and Logging providers.

The application exposes controllers for:

- authentication registration, login, logout, and session;
- current-user profile reads and updates;
- organization creation, reads, updates, and membership operations;
- business contact inquiries/click events;
- analytics event recording;
- platform health.

### Current responsibility placement

| Concern | Current location |
| --- | --- |
| HTTP/controller mapping | `apps/backend/src/**/**.controller.ts` and `health.controller.ts` |
| Request DTOs | Runtime module `dto/` files |
| Request validation | Runtime `*.validation.ts` files |
| Use-case and business rules | Runtime `*.service.ts` files |
| Authentication/session handling | Identity service, password helper, token service, and cookie helper |
| Authorization/ownership checks | Organization and contact services |
| Persistence abstraction and storage | Runtime `*.repository.ts`; all are in-memory Maps/arrays |
| Error-to-HTTP behavior | Runtime error classes and global Nest exception filter |
| Request context and logging | Runtime context middleware and platform logger |

There is no active database access point. No runtime file imports `backend/database`, `backend/migrations`, or `infra/database`. The in-memory repositories are executable test foundations, not production persistence.

### Current dependency shape

The runtime primarily follows `Controller → Service → Repository`, but services also directly coordinate authentication/session infrastructure, validation functions, logging, request context, and domain-shaped runtime types. Domain rules are therefore embedded in application/framework source rather than delegated to canonical domain modules.

## 4. Canonical Domain Inventory and Readiness

### Reusable foundations

- `backend/core`: framework-neutral base errors, logging redaction, security placeholder, and reusable validation composition.
- `backend/shared`: common lifecycle and visibility values intended to remain domain-neutral.
- `backend/config`: framework-neutral application/environment configuration.
- `backend/modules`: twelve canonical domain boundaries—identity, users, profiles, professional profiles, business profiles, organizations, service catalog, locations, trust verification, relationships, audit, and analytics.

Canonical modules consistently provide domain constants/types, lifecycle rules, visibility rules, ownership rules, security policies, safe errors, audit-event references, and validation foundations. Cross-module direction is controlled: users build on identity; profile extensions and other governed entities build on profiles; domain modules consume core/shared rather than NestJS.

### Readiness limits

- Application folders remain documentation placeholders; canonical use-case ports do not yet exist.
- Most repository folders remain placeholders. Only the users module has a repository foundation, and it is not a live persistence adapter.
- Canonical files are JavaScript ESM (`.mjs`) while the Nest runtime is TypeScript compiled with its own module settings; a supported typed import/package boundary is not defined.
- Canonical errors are framework-neutral and are not mapped by the runtime exception filter.
- Canonical audit rules do not yet have a runtime audit port.
- Contact is an application runtime concern without a corresponding canonical `backend/modules/contact` module. Its business-profile dependency must be routed through an approved port rather than creating an ungoverned domain module.
- Migration 001 exists, but profiles and later persistence dependencies do not.

**Canonical readiness:** strong domain-policy foundation, incomplete application and adapter contract surface.

## 5. Duplication Analysis

| Concept | Runtime version | Canonical version | Recommended authority | Migration risk |
| --- | --- | --- | --- | --- |
| Identity | Runtime account types, registration/login validation, password/session logic, identity errors | Identity types, lifecycle, validation, security policy, audit names, framework-neutral errors | Canonical identity owns account/lifecycle/security rules; runtime adapter owns hashing, cookies, sessions, and Nest transport | **Critical:** status/type identifiers and errors can diverge; changing auth paths can invalidate sessions |
| Users | Runtime `UserAccount`, `UserProfile`, update-profile behavior, in-memory repository | Users account types/privacy/lifecycle/validation/repository foundation | Canonical users owns account/profile-independent user rules; runtime application coordinates use cases | **Critical:** runtime combines user and profile concerns; governed persistence uses different identifiers |
| Profiles | Runtime identity repository stores a minimal user profile | Canonical profiles owns profile identity/type/visibility/ownership/lifecycle | Canonical profiles exclusively owns profile rules | **Critical:** runtime profile is keyed by user and does not implement canonical profile identity boundaries |
| Organizations | Runtime types, validation, ownership/member authorization, services, in-memory repository | Canonical organization type/lifecycle/ownership/membership/visibility/security/validation rules | Canonical organizations owns all domain decisions; Nest controllers/services become adapters/application coordinators | **Critical:** runtime membership roles/statuses and canonical references are structurally different |
| Analytics | Runtime event DTOs, validation, service, in-memory records | Canonical metric definitions, privacy/security/visibility validation and audit references | Canonical analytics owns privacy and allowed analytic semantics; runtime owns event transport only | **High:** runtime event collection can bypass canonical anti-tracking rules |
| Audit | Runtime identity audit array plus logging/event writes in services | Canonical audit event/type/metadata/security/visibility rules | Canonical audit port and metadata rules | **High:** fragmented audit stores and event naming can lose traceability or expose metadata |
| Contact | Runtime-only controllers, abuse/rate limit, service, repository, validation | No canonical contact module; business/profile/privacy contracts exist elsewhere | Keep as runtime application capability using business-profile, identity, audit, and privacy ports; do not create a domain module without governance | **High:** shadow business-profile snapshots and contact data can bypass ownership/privacy rules |
| Health/config/logging | Runtime Nest health/config/logger | Canonical core/config/logging foundations | Runtime owns framework adapters; canonical foundations own generic configuration and redaction rules | **Medium:** defaults/redaction can diverge |
| Professional/business/service/location/trust/relationships | No direct runtime implementation beyond contact snapshots/references | Canonical module foundations | Canonical modules | **Medium:** future runtime work could accidentally recreate rules if integration ports are absent |

There is no duplicate executable server, but there are duplicated domain decisions. The danger is behavioral divergence, not process duplication.

## 6. Integration Options

### Option A — Move runtime logic into canonical modules

**Model:** relocate Nest services/controllers or all use-case logic from `apps/backend` into `backend/modules`.

**Benefits**

- Physical colocation could make ownership obvious.
- Removes some same-concept files from the application tree.
- May simplify discovery if canonical modules become full Nest modules.

**Risks**

- Pollutes framework-neutral domain modules with NestJS decorators, HTTP DTOs, cookies, request context, and exception types.
- Contradicts the canonical dependency rule that API/framework adapters sit above application/domain layers.
- Encourages a second bootstrap/package boundary under `backend` or turns domain modules into transport modules.
- High-risk “big move” with import churn and behavior regression.

**Migration effort:** High. **Decision:** Rejected.

### Option B — `apps/backend` consumes canonical modules through adapters

**Model:** retain NestJS composition/controllers in `apps/backend`; define canonical application ports/use cases and repository interfaces; implement Nest/persistence adapters in the executable host or a clearly governed adapter area.

**Benefits**

- Preserves a single executable backend and framework-neutral domain rules.
- Supports incremental strangler-style replacement with parity tests.
- Keeps controllers, cookies, Nest exceptions, configuration loading, and infrastructure at the edge.
- Makes repositories replaceable while keeping migration authority separate.
- Best matches the documented `API → Application → Domain → Repository → Database` intent when interpreted as dependency boundaries rather than folder call order.

**Risks**

- Requires an explicit ESM/TypeScript typing and package/import strategy.
- Temporary adapters can coexist with old rules and become permanent duplication unless governed by removal criteria.
- Runtime error and DTO mappings require careful compatibility tests.

**Migration effort:** Medium to high, incremental. **Decision:** Selected.

### Option C — Keep separation with explicit boundaries only

**Model:** document that both trees remain independent and manually synchronize rules.

**Benefits**

- Lowest immediate code movement.
- Avoids module-format work in the short term.

**Risks**

- Preserves duplicate identity, profile, organization, validation, error, audit, and analytics rules indefinitely.
- Relies on human synchronization with no compiler-enforced dependency.
- Creates competing sources of truth and makes database integration unsafe.

**Migration effort:** Low initially, unbounded maintenance cost. **Decision:** Rejected.

## 7. Recommended Target Architecture

### Responsibility decisions

| Layer | Official location/responsibility |
| --- | --- |
| Bootstrap and Nest composition | `apps/backend/src/main.ts`, `app.ts`, and `app.module.ts` |
| HTTP controllers, cookies, request extraction, response mapping | `apps/backend` API adapters |
| Framework exception mapping | `apps/backend` global filter/adapters mapping canonical errors to HTTP |
| Application use cases and ports | Canonical module `application/` layers after explicit authorization |
| Domain rules, lifecycle, ownership, visibility, privacy, validation invariants | Canonical `backend/modules/*/domain` and governed schemas |
| Repository interfaces | Canonical module repository/application ports; no database implementation details |
| Repository adapters | Runtime infrastructure adapters implementing canonical interfaces |
| Database connection/query infrastructure | `backend/database` adapters invoked only behind repository adapters |
| Schema history | `backend/migrations/versions` only |
| Shared technical primitives | `backend/core`, `backend/shared`, and `backend/config` |

Business logic must leave controllers entirely. Nest services may remain thin application adapters during transition but must not retain alternative lifecycle, ownership, permission, visibility, or privacy rules once a canonical use case is integrated.

### Approved dependency direction

```text
apps/backend bootstrap and API adapters
                ↓
canonical application use cases and ports
                ↓
canonical domain modules + core/shared
                ↑
runtime repository/infrastructure adapters
                ↓
backend/database connection/query boundary
                ↓
schema governed by backend/migrations
```

The upward repository-adapter arrow represents dependency inversion: domain/application code owns the interface; infrastructure implements it. Domain code must never import NestJS, HTTP DTOs, database clients, migration SQL, or application bootstrap code.

### Prohibited future dependencies

- Controllers must not access repositories or databases directly.
- Canonical modules must not import `apps/backend`.
- Domain modules must not import other modules' repositories or infrastructure.
- Repository adapters must not make authorization or lifecycle decisions.
- Runtime validators must not independently redefine canonical allowed values.
- No circular adapter/application imports.
- No second set of canonical account, profile, organization, or analytics types in `apps/backend` after integration.

## 8. Database Integration Strategy

`backend/migrations/versions` remains the only migration authority. Runtime startup must not create, alter, or infer schema. Migration execution is an operational step separate from application bootstrap.

Future database integration must follow these ownership rules:

1. Canonical application/domain layers define repository ports in domain language.
2. Persistence adapters implement those ports and translate between canonical identifiers/value objects and database rows.
3. `backend/database` supplies connection, transaction, query, and error adapters without business logic.
4. Controllers and canonical domain modules never import a database client.
5. Migration schema and repository mappings are verified together in integration tests.
6. Legacy `infra/database` SQL is never imported, executed, or used as an implicit model.
7. In-memory runtime repositories remain test doubles only after persistence adapters exist.

Migration risk is currently critical: only governed Migration 001 exists, its field model differs from current runtime identity types, and profile/organization migrations are absent. No persistence adapter implementation should begin before an identity/profile mapping decision and database-lineage reconciliation.

## 9. Incremental Integration and Testing Strategy

### Required sequence

1. Freeze new runtime domain behavior.
2. Define a typed import/package strategy for canonical ESM modules consumed by the TypeScript workspace.
3. Produce field/value/error parity matrices for identity, users/profiles, organizations, audit, and analytics.
4. Add canonical application ports and use cases one bounded module at a time.
5. Wrap current in-memory repositories as temporary adapters instead of rewriting persistence simultaneously.
6. Point Nest controllers/services to canonical use cases and delete replaced duplicate rules only after parity tests pass.
7. Add database adapters only after the governed migration dependency chain exists.

### Test layers

- **Domain unit tests:** lifecycle, ownership, membership, privacy, visibility, validation, and transition rules with no NestJS/database dependencies.
- **Application unit tests:** use cases with fake repository, audit, clock, identifier, and authentication-subject ports.
- **Adapter contract tests:** the in-memory and future PostgreSQL adapters must pass the same repository contract suite.
- **Integration tests:** execute governed migrations in an isolated PostgreSQL environment, instantiate adapters, verify constraints/transactions, then verify rollback in a disposable database.
- **API tests:** boot the Nest application and assert routes, localization-safe error mapping, authorization, private-field exclusion, and request context without asserting internal implementation.
- **Regression/parity tests:** run old runtime behavior and canonical use cases against approved fixtures during each transition; explicitly compare identifiers, statuses, error codes, public projections, and audit events.
- **Architecture tests:** reject Nest imports in canonical domain code, controller-to-database imports, legacy SQL references, circular dependencies, and duplicate canonical types.
- **Canonical command:** `npm test` / `npm run test:all` must run root, backend, and frontend targets and pass before an integration slice is complete.

Tests must not preserve incorrect legacy behavior merely for parity. Where canonical contracts intentionally differ, an approved compatibility decision and explicit expected change are required before implementation.

## 10. Security Review

The adapter model improves security only if identity and authorization decisions remain singular:

- Canonical identity/users rules own lifecycle and account eligibility; runtime security adapters own password hashing, token generation/hashing, and secure cookie transport.
- A single authenticated-subject port must supply actor identity to application use cases. Individual feature modules must not parse or validate sessions independently.
- Authorization, ownership, membership, visibility, and private-field decisions occur in canonical application/domain rules, not controllers or repository adapters.
- HTTP error adapters expose stable safe codes/messages and never serialize internal database errors or canonical metadata indiscriminately.
- Audit is invoked through one canonical port with metadata allowlists; logging is not a substitute for audit.
- Repository adapters return domain-safe records and must not leak password hashes, token hashes, private contacts, or internal row details.
- Contact and analytics adapters require minimization and retention decisions before durable persistence.

Primary transition threats are double authorization (old and new rules disagree), bypass paths left in old services, duplicate session validation, DTO-to-domain over-posting, and temporary adapters that expose raw persistence objects. Each integration slice requires negative authorization and private-field regression tests.

## 11. KILL CRITICAL Review

The selected integration model authorizes no marketplace, payment, order, commission, advertising, ranking, social graph, AI recommendation, or tracking module/system. It introduces only architectural boundaries and future adapter responsibilities.

Analytics integration remains restricted to approved privacy-aware metrics/events. Session, device, personal activity, or cross-context identifiers must not enter canonical analytics under the guise of adapter metadata.

**KILL CRITICAL result: PASS.**

## 12. Exact Reconciliation Missions Required

1. **Canonical Module Consumption Boundary:** decide ESM/TypeScript typing, package exports, import paths, build ownership, and architecture enforcement without moving business behavior.
2. **Identity/User/Profile Parity Contract:** reconcile runtime and canonical identifiers, statuses, public projections, profile separation, errors, session subject, and Migration 001 fields.
3. **Organization Parity Contract:** reconcile organization identity, ownership, membership roles/statuses, lifecycle, error codes, and public projections; do not implement Migration 005.
4. **Canonical Application Port Foundation:** authorize framework-neutral use-case and repository/audit/authentication-subject interfaces for the first integration slice only.
5. **Audit and Error Mapping Contract:** define one audit port and deterministic canonical-error-to-HTTP mapping with private metadata rules.
6. **Analytics and Contact Privacy Reconciliation:** decide allowed event/contact persistence fields, actor references, minimization, consent, retention, deletion, and abuse boundaries.
7. **Workspace Health Repair:** fix existing backend/frontend test failures and require a green canonical command before integration implementation planning.
8. **Database Lineage and Field Mapping ADR:** quarantine `infra/database`, reconcile the governed schema with canonical domain fields, and keep 002–005 blocked.

After these decisions are approved, a bounded identity integration plan may be proposed. Until then, the repository is **not ready to migrate runtime code**.
