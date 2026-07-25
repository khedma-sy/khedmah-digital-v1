# Error and Audit Runtime Mapping Contract

## 1. Mission 069L Decision

This contract defines the future translation boundary between the executable NestJS runtime and the canonical error and Audit foundations. It does not change runtime behavior, register adapters, add endpoints, or create persistence.

**ERROR & AUDIT MAPPING STATUS: REQUIRES FURTHER RECONCILIATION.**

The mapping vocabulary is decided, but implementation is blocked because the runtime error model discards domain codes, the canonical category vocabulary lacks explicit Identity, Visibility, and Database categories, authentication audit events are not in the canonical Audit event registry, runtime audit records lack required resource/result/metadata fields, and existing contact-click recording conflicts with the no-tracking boundary.

## 2. Runtime Error Inventory

### Error ownership today

The executable runtime defines errors inside feature folders and makes them inherit NestJS HTTP exceptions:

| Runtime area | Current errors | Current owner/meaning |
| --- | --- | --- |
| Identity | `IdentityValidationError`, `SafeAuthenticationError`, direct `ConflictException` and `UnauthorizedException` | Validation, generic invalid credentials, duplicate account, and session failures are decided by runtime services |
| Organizations | `OrganizationValidationError`, `OrganizationAccessError`, `OrganizationNotFoundError` | Request validation, access denial, and absence are already coupled to HTTP 400/403/404 |
| Contact | `ContactValidationError`, `ContactBusinessUnavailableError`, `ContactAccessError`, `ContactRateLimitError` | Request, availability, authorization, and throttling are HTTP exception classes |
| Analytics | `AnalyticsValidationError` | Runtime request validation coupled to HTTP 400 |
| Global filter | status-derived `validation_error`, `not_found`, `request_error`, `internal_error` | Public code and safe message are derived only from HTTP status |

Consequences:

1. Runtime exception classes currently own HTTP status and often appear to own business meaning as well.
2. Services throw framework exceptions directly for duplicate, authentication, and missing-session cases.
3. The global filter does not preserve a canonical domain code or category.
4. Forbidden, unauthorized, conflict, and rate-limit responses collapse to `request_error` even though their meanings differ.
5. The filter safely replaces exception messages and does not serialize stack traces or exception objects.
6. `PlatformLogger` records request/correlation ids, status, and its derived code, but not exception messages, stacks, request bodies, passwords, or tokens.

Runtime validation of transport shape may continue to produce runtime validation failures. A decision made by a canonical invariant must originate as a canonical error and only be translated at the runtime boundary.

## 3. Canonical Error Inventory

`backend/core/errors/base-error.mjs` supplies `KhedmahCoreError` with `code`, `message`, `category`, and metadata. Its current categories are Validation, Authorization, Ownership, Duplicate, Relationship, Lifecycle, Trust, and System.

Canonical modules own stable domain codes in their `domain/errors.mjs` files. Identity, Profiles, Professional Profiles, Business Profiles, Organizations, Locations, Service Catalog, Relationships, Trust Verification, and Analytics map their codes to core categories without importing NestJS or HTTP.

### Reconciliation gaps

- `IDENTITY_ERROR`, `VISIBILITY_ERROR`, and `DATABASE_ERROR` are required mapping families but are not current `ErrorCategory` values.
- Visibility errors are inconsistently represented as Validation or Authorization depending on the module.
- Persistence/database failures have no canonical public domain code and must never reuse raw driver messages.
- Users has no independent `domain/errors.mjs`; user-account failures currently span Identity and shared contract terminology.
- `KhedmahCoreError.toJSON()` includes metadata. It must not be passed directly to HTTP responses or logs because metadata is internal and has no universal redaction guarantee.

This contract does not add or rename categories. Until a dedicated canonical error-vocabulary mission resolves these gaps, the future adapter must use the mapping families below as a closed translation policy rather than pretend they are existing core constants.

## 4. Error Mapping Contract

### Mapping families

| Mapping family | Internal meaning | Representative canonical source | Safe external rule | Suggested HTTP status owned by runtime |
| --- | --- | --- | --- | --- |
| `VALIDATION_ERROR` | Input or invariant is malformed/unsupported | `*_INVALID`, invalid type/category | Generic request validation message; optional allowlisted field name only | 400 |
| `IDENTITY_ERROR` | Authentication identity is absent, invalid, or ineligible | Identity invalid/forbidden codes | Generic authentication failure; never disclose account existence | 401, or 403 after authenticated eligibility check |
| `OWNERSHIP_ERROR` | Actor is not the owner or transfer is invalid | `*_OWNERSHIP_INVALID` | Generic action-not-allowed message; omit owner reference | 403 |
| `LIFECYCLE_ERROR` | Requested state transition or current state is incompatible | `*_LIFECYCLE_INVALID`, status invalid | Generic state-conflict message; expose no internal state history | 409 |
| `VISIBILITY_ERROR` | Projection/access conflicts with visibility policy | `*_VISIBILITY_INVALID` | Return absence (404) when existence is private, otherwise generic forbidden response | 404 or 403 according to disclosure policy |
| `DUPLICATE_ERROR` | A governed uniqueness invariant would be violated | `*_DUPLICATE`, duplicate identity conflict | Generic conflict; never reveal the existing record or private lookup value | 409 |
| `DATABASE_ERROR` | Persistence, constraint, timeout, or availability failure | Future persistence adapter only; never a domain decision | Stable generic platform failure; no SQL, table, constraint, host, driver, or query data | 500, or 503 for classified transient availability |

### Translation rules

1. Domain modules create canonical errors and never choose HTTP status, response envelope, localization, or transport headers.
2. Runtime Error Adapter matches explicit canonical `code` and category; it must not parse message text.
3. Runtime owns HTTP status, response formatting, localization, and safe public messages.
4. A controller forwards errors to the boundary; it must not define business error codes or reinterpret invariants.
5. Unknown canonical errors fail closed as a generic internal error and are recorded only through sanitized operational logging.
6. Canonical `message`, `metadata`, stack, cause, and persistence details are internal by default.
7. Runtime-generated request ids and correlation ids may be returned, but they are opaque and grant no access.
8. Authentication failure remains generic for unknown identity, wrong password, disabled account, invalid token, and expired session where disclosure would enable enumeration.

### HTTP boundary

```text
Canonical module error (meaning/code/category)
                ↓
Runtime Error Adapter (closed mapping and redaction)
                ↓
NestJS exception/filter (status and safe envelope)
                ↓
HTTP client
```

Canonical modules must not import NestJS exceptions, controllers, HTTP status constants, filters, Express objects, or runtime providers. Controllers must not define domain errors or import database drivers/repositories to translate persistence failures.

## 5. Runtime Audit Inventory

The runtime keeps an in-memory `AuditLog` array inside `IdentityRepository`. Each record contains an id, dot-delimited `eventType`, timestamp, and optional actor user id, request id, and correlation id.

Current producers are Identity, Organizations, Contact, and Analytics services. They import or depend on the concrete `IdentityRepository` and append audit events directly. The current union includes authentication, profile, organization membership, contact inquiry/click, and analytics recording events.

### Gaps against canonical Audit

- Runtime event names use lower-case dot notation instead of governed `UPPERCASE_SNAKE_CASE`.
- Records lack explicit action, resource reference, result, and governed metadata.
- Actor and resource references are untyped UUID/string values rather than canonical typed references.
- `LOGIN_FAILED` has no actor, resource, failure reason classification, or result field.
- Contact click events record user behavior; `contact.click.tracked` is tracking terminology and is not authorized by the canonical Audit foundation.
- `analytics.event.recorded` mixes Analytics activity with Audit authority.
- Audit storage is owned by Identity even though canonical Audit must remain separate from Identity, logging, Analytics, authorization, and persistence.
- The runtime currently stores no password, token, email, request body, or arbitrary metadata in `AuditLog`, which is a useful privacy property to preserve.

## 6. Canonical Audit Record Contract

A future mapped audit record contains only:

| Field | Rule |
| --- | --- |
| Audit Event | Approved `UPPERCASE_SNAKE_CASE` event name |
| Actor | Typed opaque actor reference, or `system:anonymous` when no authenticated actor exists |
| Action | Approved canonical action such as create/update/status_change/archive/verify/link; authentication actions require governance extension |
| Resource | Typed opaque resource reference, never email, token, session id, or raw URL |
| Result | `success`, `failure`, or `rejected` |
| Metadata | Minimal allowlisted references, timestamp, and sanitized reason code; no payload snapshot |

Audit is an accountability record for governed state-changing or security-relevant decisions. It is not request logging, analytics, product telemetry, click tracking, surveillance, or an authorization mechanism.

## 7. Audit Event Mapping

| Runtime source/current state | Canonical target | Mapping decision |
| --- | --- | --- |
| `auth.register` | `USER_ACCOUNT_CREATED` | Success; actor/resource are the created account reference; never include email or password |
| No distinct runtime event | `USER_ACCOUNT_UPDATED` | Future only; emit only after a governed account update succeeds |
| `auth.login_success` | `LOGIN_SUCCESS` | Security event reserved by this contract; requires canonical registry/action extension before use; actor/resource use opaque user-account reference |
| `auth.login_failed` | `LOGIN_FAILED` | Security event reserved by this contract; use anonymous/system actor and sanitized reason class; never email, identity lookup value, password, token, IP, or fingerprint |
| `auth.logout` | `LOGOUT` | Security event reserved by this contract; emit after session revocation; no session/token identifier |
| `profile.update` | `PROFILE_UPDATED` | Success; map to canonical profile resource, not the account id masquerading as profile id |
| No canonical runtime business creation | `BUSINESS_PROFILE_CREATED` | Future only; Contact snapshots cannot emit this event |
| `organization.create` | `ORGANIZATION_CREATED` | Success; future adapter must use canonical organization resource reference |

`LOGIN_SUCCESS`, `LOGIN_FAILED`, and `LOGOUT` are not currently present in the canonical Audit event registry or action vocabulary. This contract defines their intended names and privacy semantics but does not authorize emission until the registry is reconciled. Organization member events also require a dedicated canonical event/action decision rather than an automatic string conversion.

Runtime event names are compatibility inputs only. New canonical code must not emit the dot-delimited aliases.

## 8. Privacy and Security Rules

Error responses, logs, and audit records must never contain:

- passwords, password hashes, passcodes, credentials, or credential verification details;
- session tokens, token hashes, refresh tokens, cookies, authorization headers, or session ids;
- email addresses or private contact values unless a separately authorized internal operational process requires them—and never in public errors;
- private owner/member identifiers, raw identity lookup values, IP addresses, device fingerprints, or user-agent histories;
- request/response bodies, database queries, connection strings, table/column/constraint names, stack traces, exception causes, or raw canonical metadata;
- documents, financial data, payment information, or sensitive personal information.

Public error envelopes use stable safe codes/messages and opaque request/correlation ids only. Sanitized internal logging may record category, canonical code, status, request/correlation ids, service, and timestamp. Access control, retention, deletion, tamper evidence, and incident review require later operational governance.

## 9. Future Adapter Boundaries

### Runtime Error Adapter

Accepts a canonical error, resolves a closed code/category mapping, chooses a runtime-owned status and safe message key, and returns a sanitized transport descriptor. It does not serialize domain metadata, inspect database exceptions in controllers, localize domain messages, or catch programming errors as validation failures.

### Runtime Audit Adapter

Accepts an approved canonical event request after the governed operation completes, validates event/action/actor/resource/result/metadata, redacts forbidden fields, and passes it to a future Audit port. It does not persist records, grant authorization, collect telemetry, infer events from HTTP requests, or import `IdentityRepository`.

No adapter, provider, filter modification, controller wiring, storage, or runtime behavior is implemented by Mission 069L.

## 10. Database and Operations Impact

This contract creates no audit table, error table, logging table, migration, database model, or persistence repository. Raw database errors remain inside a future persistence boundary and are converted to a sanitized `DATABASE_ERROR` descriptor before crossing into runtime transport or operational logs.

Before any audit persistence is approved, a separate mission must decide identifiers, retention, access, redaction, append/tamper semantics, rollback behavior, data minimization, and deletion/legal requirements. Error logging remains operational logging and must not be stored as canonical Audit merely because an exception occurred.

## 11. KILL CRITICAL Review

This contract introduces no tracking audit system, surveillance log, payment audit system, advertising analytics, ranking manipulation log, or social activity tracking.

The existing runtime `contact.click.tracked` and related click/analytics recording are explicitly **not approved as canonical Audit events**. Their continued product/runtime status requires a separate V1 scope and privacy review; Mission 069L neither expands nor legitimizes them.

**KILL CRITICAL result: RECONCILIATION REQUIRED; NO NEW KILL CRITICAL CAPABILITY INTRODUCED.**

## 12. Required Next Missions

1. **Canonical Error Vocabulary Reconciliation:** decide Identity, Visibility, Database, Not Found, Rate Limit, and user-account category/code ownership without weakening existing module codes.
2. **Canonical Authentication Audit Events:** govern `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, authentication actions, anonymous actor semantics, and sanitized reason codes.
3. **Audit Record Shape Reconciliation:** resolve required metadata behavior for create/no-previous-state and failure/no-new-state events and define typed actor/resource references.
4. **Runtime Tracking and Analytics Scope Review:** classify or remove the canonical-audit candidacy of contact click and analytics events; establish consent, minimization, and V1 boundaries without changing behavior in this mission.
5. **Operational Logging and Retention Contract:** define safe internal fields, access, retention, deletion, incident handling, and correlation-id treatment.
6. **Error/Audit Adapter Implementation Plan:** only after missions 1–5 and workspace test repair, define a bounded implementation slice with no direct controller/database coupling.

The Error and Audit mapping boundary must be reviewed again after these missions. It is not ready for adapter implementation today.
