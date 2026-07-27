# Mission 069H — Identity & Profile Runtime Parity Audit

## 1. Final Decision

**IDENTITY PARITY STATUS: REQUIRES RECONCILIATION.**

The executable identity runtime is functional as an in-memory foundation, but it is not structurally compatible with the canonical Identity, Users, Profiles, or governed Migration 001 models. Adapter migration must not begin until identifiers, account/profile separation, lifecycle semantics, visibility, ownership, credentials, sessions, errors, audit events, and persistence mappings have approved parity contracts.

This audit changes no code, API, schema, migration, authentication behavior, or security behavior.

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

## 3. Runtime Identity Inventory

### NestJS module and providers

`apps/backend/src/identity/identity.module.ts` registers `AuthController`, `UsersController`, `IdentityRepository`, `IdentityService`, and `SessionTokenService`. It exports both the service and concrete repository to Organizations, Contact, and Analytics consumers. There is no guard or strategy abstraction; authentication is performed by reading a cookie and asking `IdentityService` for a session/current user.

### Controllers and transport

| Controller | Current operations | Responsibility |
| --- | --- | --- |
| `AuthController` | register, login, logout, session | HTTP bodies, cookie attachment/clearing, session-token extraction, auth response mapping |
| `UsersController` | current user, update current profile | Cookie extraction, body forwarding, user response mapping |

Routes and response shapes are runtime contracts and must remain unchanged during future internal adapter migration unless separately versioned.

### Service responsibilities

`IdentityService` currently combines:

- registration and duplicate-email decisions;
- account/profile creation and identifier generation;
- immediate account activation;
- login eligibility and credential verification;
- session creation, lookup, revocation, and current-user resolution;
- profile update behavior;
- public/authenticated response projection;
- audit event creation and request/correlation context attachment.

This is transport-adjacent application logic plus domain rules, security orchestration, projection logic, and audit coordination in one NestJS service.

### Runtime storage

`IdentityRepository` contains four in-memory stores:

- accounts keyed by generated UUID;
- profiles keyed by account/user UUID;
- sessions keyed by session UUID and searched by token hash;
- audit logs as an array.

It performs no database access and implements no canonical repository port. Other runtime modules receive the concrete repository, increasing coupling to runtime account/session/audit shapes.

### Runtime fields

| Model | Fields |
| --- | --- |
| `UserAccount` | `id`, `email`, `passwordHash`, `status`, `createdAt`, `updatedAt` |
| `UserProfile` | `userId`, `displayName`, fixed Arabic `locale`, `createdAt`, `updatedAt` |
| `UserSession` | `id`, `userId`, `tokenHash`, `expiresAt`, `createdAt`, optional `revokedAt` |
| `PublicUserProfile` | account `id`, `email`, `status`, nested display name and locale |
| `AuditLog` | id, optional actor user id, dotted event type, timestamp, request/correlation ids |

### Runtime validation and security

- Email is trimmed, lowercased, format-checked, and capped at 254 characters.
- Password length is 12–128; no common-password check exists.
- Display name is trimmed and limited to 2–80 characters.
- Passwords are salted and PBKDF2-SHA512 hashed with 120,000 iterations.
- Session tokens use 32 random bytes and only SHA-256 hashes are stored.
- Sessions expire after one hour and can be revoked.
- Cookies are HTTP-only, strict same-site, production-secure, scoped to `/api/v1`, and limited to one hour.
- Authentication errors avoid distinguishing an absent account from a wrong password.
- Request/correlation context is attached to audit records.

No real guard exists, so every consuming service/controller is responsible for invoking current-user/session resolution correctly.

## 4. Canonical Identity, Users, and Profiles Inventory

### Identity authority

`backend/modules/identity` owns account types, five lifecycle/status values, lifecycle transitions, safe identity identifier format, identity validation, framework-neutral error codes/categories, audit event names, and credential/security principles.

Approved account types are individual, professional, business, organization, and partner accounts. Approved lifecycle/status values are Created, Pending, Active, Suspended, and Archived. Identity defines no login controller, cookie, session store, hashing implementation, or runtime authentication flow.

### Users authority

`backend/modules/users` owns the user-account identity reference, account type/status/lifecycle compatibility, visibility classification, privacy boundaries, account validation, user error codes, audit compatibility, and the `core_user_accounts` persistence foundation.

The canonical user repository explicitly stores no password, token, secret, profile data, or business data. It validates a persistence record but does not authenticate users or execute database queries.

### Profiles authority

`backend/modules/profiles` owns profile identity separately from accounts, profile types, lifecycle, visibility, ownership reference rules, security boundaries, validation, errors, and audit names.

A canonical profile requires a profile identity reference, profile type, visibility, status, and ownership reference pointing to Users. Professional, business, organization, partner, and representative identities are profile types or extensions, not account fields embedded in the base runtime user projection.

## 5. Concept-by-Concept Parity

| Concept | Runtime authority today | Canonical authority | Conflict | Recommended resolution |
| --- | --- | --- | --- | --- |
| User | `IdentityService`/repository use one UUID as user, account, and profile owner key | Users is a separate account boundary referencing Identity; Profiles is separately owned | Runtime collapses user/account/profile concepts | Define stable subject, user identifier, identity reference, and profile identifier mapping before adapters |
| Identity | Email/password registration and session behavior | Account identity/type/status/lifecycle rules | Runtime treats email as identity lookup; canonical identity requires an explicit identifier and type | Keep credentials private in auth adapter/storage; map authenticated subject to canonical identity reference |
| Account | `UserAccount` with UUID, email, password hash, active/disabled | `userIdentifier`, `identityReference`, account type, five-state status/lifecycle, visibility | Fields, identifiers, status vocabulary, privacy, and credential placement conflict | Split credential record from canonical account record; create translation/parity contract, not a lossy adapter |
| Profile | `UserProfile` keyed by user id with name and locale | Independent profile identity/type/status/visibility/ownership | Runtime has no profile id/type/status/visibility/ownership | Migration 002 and a Profile parity contract must precede profile adapter implementation |
| Lifecycle | Registration writes `active`; disabled blocks login | Created → Pending → Active/Suspended/Archived governed transitions | Runtime has two states and bypasses canonical transitions | Decide approved registration activation policy and compatibility mapping; never infer transitions in an adapter |
| Status | `active` or `disabled` | created, pending, active, suspended, archived | `disabled` is ambiguous between suspended and archived | Prohibit automatic mapping; require explicit migration decision and reason/audit handling |
| Visibility | Not represented; response always includes email to authenticated caller | User and profile visibility are public/private/internal | Runtime projection named “Public” contains private email and has no visibility decision | Rename/classify projections in future internal contract; canonical field policy controls each output without changing route until approved |
| Validation | Email/password/display-name runtime validators throw Nest exceptions | Canonical validators cover identifiers, account type/status/lifecycle/visibility and profile ownership/type/status | Complementary checks are mixed with duplicated identity decisions | Runtime adapter retains credential/transport validation; canonical ports validate domain commands and return canonical errors |
| Ownership | Profile is implicitly keyed by user UUID | Explicit Users ownership reference; profile cannot become business/org/professional entity | Ownership is implicit and cannot validate transfers or duplicate relationships | Create explicit owner reference mapping; keep transfer behavior unsupported until a governed use case exists |
| Errors | Nest validation/auth/conflict/unauthorized exceptions and English messages | Stable framework-neutral identity/user/profile codes and categories | HTTP status and domain error semantics are coupled and incomplete | Add a future error adapter mapping canonical codes to unchanged HTTP contracts; preserve safe auth ambiguity |
| Audit | Dotted runtime event strings stored in identity repository | Uppercase canonical identity/user/profile audit names and protected metadata | Event names/stores differ; feature modules append to identity audit repository | Define one audit port and explicit event compatibility table before cutover |

## 6. Authentication Boundary

### Responsibilities that remain in the executable runtime

- NestJS controller transport and request/response behavior.
- Login/register/logout/session route compatibility.
- Cookie parsing, attachment, clearing, flags, path, and lifetime.
- Password hashing/verification implementation behind a credential port.
- Session token generation, hashing, expiration, revocation, and transport.
- Request/correlation context extraction.
- Mapping safe canonical errors to current HTTP behavior.

### Responsibilities that become canonical authority

- Account type, identifier, status, and lifecycle invariants.
- Account eligibility rules used by authentication, including suspended/archived behavior.
- User-account privacy and visibility classification.
- Profile identity, type, lifecycle, visibility, and ownership invariants.
- Stable identity/user/profile error codes and audit event semantics.
- Duplicate identity/ownership decisions at the domain/application boundary.

Authentication mechanics must not move into canonical domain files. Conversely, runtime authentication must not invent alternative lifecycle or ownership rules. A future authenticated-subject port should return a minimal canonical subject reference after the runtime validates a session; it must not expose token hashes, password hashes, or raw repository records.

## 7. User Account Field and Behavior Parity

| Area | Runtime | Canonical/Migration 001 | Severity |
| --- | --- | --- | --- |
| Primary identifier | generated UUID `id` | text `user_identifier` with safe pattern | Critical |
| Identity link | email lookup only | unique `identity_reference` | Critical |
| Account type | absent | required five-value `account_type` | High |
| Status | active/disabled | created/pending/active/suspended/archived | Critical |
| Lifecycle | implicit in status | separate required `lifecycle_status` with transitions | Critical |
| Visibility | absent | required public/private/internal classification | High |
| Credentials | password hash embedded in account | explicitly excluded from `core_user_accounts` | Critical |
| Contact | normalized email embedded in account and authenticated projection | no email in governed table; canonical privacy treats email as private | High |
| Timestamps | created/updated | created/updated/optional archived | Medium |
| Errors | Nest exceptions | identity/user stable codes/categories | High |
| Audit | dotted runtime strings | uppercase canonical events | High |

### Missing canonical concepts in runtime

Account type, identity reference, separate lifecycle state, visibility classification, archived timestamp, lifecycle transition validation, canonical errors, and explicit ownership references are missing.

### Runtime concepts without governed persistence

Normalized email, password hash, credential algorithm metadata, sessions, token hashes, expiration/revocation, and runtime audit logs have no approved governed migration/storage path. Migration 001 intentionally excludes them. They require separate private credential/session/audit contracts and must never be added to `core_user_accounts` by convenience.

## 8. Profile Parity

The runtime profile is a one-to-one display-name record implicitly owned by the account UUID. It has no independent identity, profile type, lifecycle, status, visibility, public/private field classification, ownership reference, duplicate prevention, or transfer rule.

The canonical Profile module requires all those identity/governance values and separates personal, professional, business, organization, partner, and representative profile identities. A runtime `UserProfile` therefore cannot be relabeled as a canonical profile without adding governed information.

### Required resolution

1. Define whether every registered individual receives a personal profile and at what lifecycle point.
2. Define stable account-to-profile ownership references and one-to-zero/one constraints.
3. Define how runtime `displayName` and Arabic locale map to approved public/private profile fields.
4. Define the authenticated “me” projection separately from a public profile projection; email must remain private.
5. Implement and verify Migration 002 only after its contract is approved.
6. Keep professional and business extensions dependent on the base profile identifier; do not infer them from account type alone.

## 9. Future Adapter Migration Strategy

```text
AuthController / UsersController
              ↓
Nest transport adapters
              ↓
Identity / User / Profile Application Ports
              ↓
Canonical identity, users, and profiles rules
              ↑
credential, session, account, profile, audit adapters
```

### Planned adapter boundaries

| Adapter/port | Permitted role | Forbidden role |
| --- | --- | --- |
| Auth transport adapter | Map existing DTOs/cookies and unchanged response envelopes | Define account lifecycle or profile ownership |
| Credential port/adapter | Normalize private login identifier, hash/verify password, return credential subject reference | Store credentials in canonical account/profile records |
| Session port/adapter | Generate/hash/revoke tokens and resolve minimal authenticated subject | Decide account eligibility without canonical lifecycle check |
| Identity application port | Coordinate identity creation/eligibility using canonical rules | Parse HTTP/cookies or return Nest exceptions |
| User account port | Create/read governed account state and visibility | Expose email/password/token material |
| Profile application port | Create/update canonical profile with explicit ownership and visibility | Collapse professional/business/org identity into account |
| Error adapter | Map canonical safe codes to existing HTTP status/messages | Leak metadata or alter invalid-credential ambiguity |
| Audit adapter | Map approved event semantics and safe actor/request references | Treat application logging as audit persistence |

### Safe migration order

1. Freeze runtime identity/profile behavior and capture API regression fixtures.
2. Approve identifier, field, status, error, projection, and audit parity matrices.
3. Define credential, session, authenticated-subject, account, profile, and audit ports with no persistence implementation.
4. Wrap current in-memory stores as adapters so behavior and persistence changes are not combined.
5. Route current-user resolution through one authenticated-subject boundary; remove direct concrete repository exports only after all consumers migrate.
6. Introduce canonical account eligibility/lifecycle rules behind the unchanged auth transport.
7. Introduce canonical profile rules only after Migration 002 and repository mappings are verified.
8. Add durable credential/session/account/profile adapters in separately approved missions with parity, integration, rollback, and security tests.
9. Remove duplicated runtime domain rules only after each canonical slice is proven.

No adapter should silently translate `disabled` to suspended/archived, fabricate account/profile types, or generate missing ownership/visibility values.

## 10. Database Impact

### `core_user_accounts`

The governed table cannot store the current runtime account directly. It lacks email and password hash by design and requires identity reference, account type, lifecycle, and visibility values that runtime accounts do not contain. A credential lookup store and mapping from login identifier to canonical user/identity references are required before persistence integration.

### `profiles`

Migration 002 is absent. The runtime profile lacks the canonical identifier, type, status, visibility, and ownership fields expected by the Profile module. Its existence does not authorize a physical profile schema.

### `professional_profiles` and `business_profiles`

Migrations 003 and 004 are absent. These extensions must reference a governed base profile and must not be synthesized from runtime account type or nested runtime profile data. Their absence blocks any profile extension adapter.

### Migration risks

- UUID runtime ids versus patterned text identifiers.
- Email-based identity lookup versus canonical identity reference.
- Ambiguous `disabled` conversion.
- Registration-created active records bypassing canonical lifecycle history.
- Credential/session records accidentally added to the public/governed account table.
- Runtime display profile migrated without explicit type/visibility/ownership.
- Public/authenticated projections leaking private email.
- Audit event history losing semantic continuity.
- Partial cutover leaving two sources of account/profile truth.

No database migration or adapter implementation is ready until these are resolved.

## 11. Security Review

### Strengths

- Password plaintext is not stored; hashes are salted.
- Token plaintext is returned only for cookie transport; stored sessions contain token hashes.
- Cookie flags are HTTP-only and strict same-site, with secure mode in production.
- Login failure does not reveal whether an account exists.
- Password/display/email validation has explicit bounds.
- Request and correlation identifiers support safe audit traceability.

### Risks

| Risk | Severity | Required control |
| --- | --- | --- |
| Concrete identity repository exported to feature modules | High | Replace with authenticated-subject and audit ports before adapter cutover |
| No central Nest guard | High | Ensure every protected route uses one approved session/subject boundary; decide guard adoption separately without changing behavior here |
| Duplicate lifecycle eligibility | Critical | Canonical lifecycle is the sole eligibility authority after reconciliation |
| Email in `PublicUserProfile` | High | Treat current response as authenticated-private; define separate public projection and field tests |
| Common-password canonical requirement absent at runtime | Medium | Reconcile password policy before changing registration validation |
| In-memory sessions/audit/accounts | High for production | Keep non-production; approve private persistence and retention contracts |
| Feature services parse cookie and resolve identity independently | High | Centralize through runtime auth adapter/authenticated-subject port |
| Dual old/new paths during migration | Critical | Use one slice at a time, negative auth tests, kill switches/rollback plan, and remove bypasses |

No authentication or authorization implementation is modified by this audit.

## 12. KILL CRITICAL Review

The parity and adapter plan introduces no marketplace account, seller account, payment account, commission account, social profile, tracking profile, or AI identity scoring concept. Canonical account types remain limited to the approved identity references and do not confer marketplace/payment capabilities.

Business, professional, organization, partner, and representative profile/account references remain identity taxonomy only; they must not become seller, transaction, ranking, social, or tracking identities through adapter mapping.

**KILL CRITICAL result: PASS.**

## 13. Exact Next Missions

1. **Identity Identifier and Field Parity Contract:** decide UUID/text identifiers, identity references, login identifier privacy, account type defaults, timestamps, and Migration 001 mapping.
2. **Identity Lifecycle Compatibility Contract:** resolve registration activation, active/disabled compatibility, suspended/archived semantics, transition auditing, and login eligibility.
3. **Credential and Session Boundary Contract:** define private credential/session stores, hashing metadata, retention, revocation, subject resolution, and separation from `core_user_accounts`.
4. **Profile Identity and Ownership Parity Contract:** define personal-profile creation, identifiers, type, visibility, status, ownership, projections, and Migration 002 prerequisites.
5. **Identity/Profile Error and Audit Mapping Contract:** map canonical codes/events to current HTTP responses and audit continuity without metadata leakage.
6. **Authenticated Subject Consumption Foundation:** replace direct feature-module dependency on concrete identity repository/service with a type-only subject/audit boundary; no behavior migration yet.
7. **Workspace Health Repair:** fix existing backend/frontend failures and require the canonical test command to pass.
8. **Database Lineage and Migration Recovery:** finalize the governed lineage and only then plan Migrations 002–004 sequentially.

After missions 1–7 are approved and green, a bounded in-memory Identity adapter migration may be planned. Database-backed migration remains blocked until mission 8 and the required physical migrations are complete.
