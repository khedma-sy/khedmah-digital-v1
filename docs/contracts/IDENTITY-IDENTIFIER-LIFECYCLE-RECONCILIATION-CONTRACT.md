# Identity Identifier & Lifecycle Reconciliation Contract

## 1. Mission 069I Decision

This contract reconciles identifiers, account/profile separation, lifecycle, status, visibility, credentials, errors, audit events, persistence impact, and future adapters discovered by Mission 069H.

**IDENTITY RECONCILIATION STATUS: REQUIRES FURTHER RECONCILIATION.**

Identifier and lifecycle authority are now decided, but adapter implementation remains blocked by the credential/session persistence contract, Profile Migration 002 physical contract, legacy-record backfill policy, typed canonical-module consumption boundary, and existing red workspace tests.

This mission changes no runtime code, authentication behavior, API, database table, or migration.

## 2. Identifier Authority

### Canonical identifiers

| Identifier | Authority | Meaning | Required properties |
| --- | --- | --- | --- |
| `identity_reference` | Identity module | Opaque reference to the private authentication identity/credential subject | Unique, stable, non-email, non-phone, non-token, never derived from personal data |
| `user_identifier` | Users module | Opaque durable identifier for the platform user account | Primary account key, stable across email/credential/profile changes |
| `profile_identifier` | Profiles module and future Profile Migration 002 | Opaque durable identifier for one governed base profile | Distinct from user/account/identity identifiers; explicit ownership reference required |
| Runtime UUID `id`/`userId` | Executable runtime only | Legacy in-memory key currently reused for account, profile owner, session subject, and audit actor | Transitional implementation detail; not canonical authority |
| Email | Credential/login boundary | Normalized private login identifier | Private, mutable under future governed verification, never a canonical primary key |
| Session id/token/hash | Session boundary | Ephemeral authentication-session material | Private/internal, revocable, expiring, never a canonical identity/account/profile identifier |

### Identifier decisions

1. Canonical identifiers are opaque strings following their governed patterns. They are not emails, phones, credential hashes, session ids, or raw database row addresses.
2. `identity_reference`, `user_identifier`, and `profile_identifier` are always distinct values even when their records have a one-to-one relationship.
3. A session resolves to a minimal authenticated subject containing canonical `identityReference` and `userIdentifier`; it does not use email as authority and does not expose token/password hashes.
4. Profile ownership references `userIdentifier`; a profile does not own its user account or authentication identity.
5. Runtime UUIDs may be retained behind a transitional adapter only with an explicit one-to-one mapping. They must not be copied into every canonical identifier or transformed by prefixing alone.
6. Mapping records must enforce uniqueness in both directions and must never be inferred from display name, email, or other personal data.
7. New canonical records receive identifiers from an approved identifier generator port. Adapters translate; they do not invent identifiers from runtime DTOs.

### Transitional mapping shape

The future mapping contract requires the following logical values; this is not a table definition:

```text
runtimeLegacyUserId ↔ identityReference (one-to-one)
runtimeLegacyUserId ↔ userIdentifier     (one-to-one)
userIdentifier      → profileIdentifier  (one-to-zero-or-one base profile in the first integration slice)
```

The mapping must be established atomically for a registration cutover. Existing in-memory records are disposable development state unless a later approved migration declares them durable; no production data migration is authorized here.

### Identifier migration risks

- treating email as a permanent identity key;
- aliasing identity, user, and profile identifiers;
- losing session-to-account resolution during cutover;
- creating duplicate mappings during retry;
- exposing mappings in public payloads or logs;
- assuming a runtime UUID satisfies canonical reference patterns;
- backfilling identifiers without deterministic idempotency and audit evidence.

## 3. Identity → User Account → Profile Separation

```text
Private authentication identity
            ↓ identity_reference
Canonical user account
            ↓ owner user_identifier
Canonical base profile (optional until explicitly created)
```

### Ownership and responsibility rules

| Layer | Owns | Must not own |
| --- | --- | --- |
| Identity | Authentication subject reference, identity lifecycle eligibility rules, credential-security policy references | Public profile fields, business/professional identity, HTTP cookies |
| User Account | Account type, status/lifecycle, visibility classification, durable account identifier | Password/token material, public profile data, authentication transport |
| Profile | Profile identifier/type/status/visibility and explicit Users ownership reference | Credentials, sessions, user-account lifecycle, business/org/professional entity data |
| Runtime credential adapter | Email normalization/lookup and password verification | Account/profile status authority or public projections |
| Runtime session adapter | Token generation/hash/revocation/expiry and subject resolution | Lifecycle transitions, profile ownership, credentials in canonical records |

The current runtime combines all three layers under one UUID and returns a nested profile from the account service. Future adapters must separate the records without changing current HTTP envelopes until a separately approved API version changes them.

### Cardinality for the first adapter slice

- One authentication identity reference maps to exactly one canonical user account.
- One user account maps to zero or one base personal profile during the first slice.
- A base profile has exactly one Users ownership reference.
- Professional and business profiles extend a base profile through their own future governed records; they are not inferred from account type.
- Organization identity is not a user account and is outside this reconciliation.

## 4. Lifecycle Reconciliation

### Canonical lifecycle authority

The only approved account lifecycle values are:

1. `created`
2. `pending`
3. `active`
4. `suspended`
5. `archived`

Canonical Identity lifecycle transitions remain authoritative:

| From | Allowed to | Forbidden examples |
| --- | --- | --- |
| Created | Pending, Archived | Created → Active; Created → Suspended |
| Pending | Active, Suspended, Archived | Pending → Created |
| Active | Suspended, Archived | Active → Created; Active → Pending |
| Suspended | Active, Archived | Suspended → Created; Suspended → Pending |
| Archived | None | Any transition out of Archived |

No adapter, controller, repository, credential verifier, or session resolver may bypass this transition table.

### Runtime state mapping

| Runtime state/behavior | Canonical result | Decision |
| --- | --- | --- |
| New registration immediately returns active | Created → Pending → Active within one future application transaction, with distinct canonical audit transitions | Preserves external registration behavior without authorizing Created → Active |
| `active` | Active | Exact mapping only after canonical mapping/record validation succeeds |
| `disabled` with temporary restriction reason | Suspended | Requires explicit classified reason; adapter cannot infer it |
| `disabled` with terminal closure/retention reason | Archived | Requires explicit classified reason and `archived_at`; adapter cannot infer it |
| `disabled` without governed reason | Unresolved | Quarantine/review; never default to Suspended or Archived |
| Missing runtime profile | No profile record | Must not block an otherwise valid account unless the use case explicitly requires a profile |

The runtime continues to use `active`/`disabled` until a later implementation mission. This contract defines future translation only.

### Status compatibility

For V1 `core_user_accounts`, `account_status` and `lifecycle_status` use the same five-value vocabulary and **must be equal at persistence boundaries**. `account_status` is the current operational classification; `lifecycle_status` is the lifecycle-governed state. A later contract may separate them only through an explicit compatibility matrix and migration.

Authentication eligibility is not equivalent to visibility:

- Active is eligible for session establishment, subject to valid credentials/session policy.
- Created and Pending are not eligible for ordinary authenticated access.
- Suspended and Archived are not eligible for session establishment or continued current-user resolution.
- Visibility never grants authentication or authorization.

### Profile lifecycle

Profile status uses the canonical Created, Pending, Active, Suspended, and Archived lifecycle independently of account lifecycle. Account Active does not automatically make a profile Active. Suspending a profile does not automatically suspend authentication. Cross-entity effects require explicit future application rules and audit events.

## 5. Visibility Reconciliation

| Concept | Authority | Values | Mapping rule |
| --- | --- | --- | --- |
| User account visibility classification | Users | public, private, internal | Required canonical value; default decisions must be made by an application contract, not a DTO adapter |
| Profile visibility | Profiles | public, private, internal | Independent of account status and authentication |
| Runtime current-user response | Authenticated private projection | Contains private email plus profile display values | Must not be treated as a public profile merely because its type is named `PublicUserProfile` |
| Public profile response | Profiles future API contract | Only fields approved by profile visibility policy | Not implemented by this mission |

Email is always private account/credential data. Display name may be public only through an active profile and approved visibility policy. Locale is private preference by default unless a future profile contract explicitly publishes it.

## 6. Credential and Session Boundary

### Runtime authority retained

- login/register/logout/session HTTP transport;
- email normalization for credential lookup;
- password validation at the credential-input boundary;
- password hashing and constant-time verification;
- session token generation, hashing, expiration, revocation, and cookie transport;
- HTTP-only, same-site, secure-in-production cookie policy;
- request/correlation context extraction;
- generic invalid-credential behavior.

### Canonical authority

- identity/user identifiers and references;
- account type, lifecycle/status, transition eligibility, and visibility;
- profile type, status, visibility, and ownership;
- duplicate account and ownership invariants;
- framework-neutral validation/error/audit semantics.

### Separation rules

1. `core_user_accounts` and profiles store no email, password hash, token hash, cookie, credential secret, or session payload.
2. Credential and session persistence require separate private contracts and migrations; none are authorized here.
3. The credential adapter returns only a verified identity reference/subject or a generic failure.
4. The session adapter stores/resolves only private token hashes and returns a minimal canonical subject.
5. Canonical domain code never imports crypto, cookies, Express, NestJS, or session repositories.
6. Authentication does not duplicate lifecycle decisions: after credential/session verification, the canonical account eligibility check is authoritative.

## 7. Error Mapping Contract

### Canonical-to-runtime mapping

| Canonical error | Future runtime category | HTTP intent | Exposure rule |
| --- | --- | --- | --- |
| `USER_ACCOUNT_INVALID` | Identity validation error | 400 | Safe field/error code only; never echo email/password/private values |
| `USER_ACCOUNT_DUPLICATE` | Conflict error | 409 | Registration may retain the current generic account-exists response; lookup details remain private |
| `USER_ACCOUNT_LIFECYCLE_INVALID` | Lifecycle conflict | 409 | Stable safe code; internal transition/reason metadata is not public |
| `PROFILE_INVALID` | Profile validation error | 400 | Safe profile field codes only |
| `PROFILE_OWNERSHIP_INVALID` | Ownership/authorization error | 403 | Do not reveal another owner's identifier or profile existence |

Runtime `SafeAuthenticationError` remains the generic 401 response for absent account, wrong password, invalid/revoked/expired session, or an ineligible account where disclosure would enable enumeration. It must not be replaced with a more specific public canonical error.

Runtime validation must classify whether a command targets credentials, user accounts, or profiles before choosing a canonical error. Adapters must not convert every invalid request into `USER_ACCOUNT_INVALID`.

## 8. Audit Mapping Contract

| Runtime event | Canonical event(s) | Decision |
| --- | --- | --- |
| `auth.register` | `USER_ACCOUNT_CREATED`, then lifecycle/status transition event(s), and `PROFILE_CREATED` only if a profile is actually created | One runtime event may map to multiple canonical events in the future transaction |
| `auth.login_success` | Runtime security authentication-success event | Remains security audit; no account lifecycle mutation |
| `auth.login_failed` | Runtime security authentication-failure event | Must omit email, password, token, and account-existence detail |
| `auth.logout` | Runtime security session-revoked event | Session event only |
| `profile.update` | `PROFILE_UPDATED` | Requires canonical profile identifier and actor user identifier |
| Future account status change | `USER_ACCOUNT_STATUS_CHANGED` plus lifecycle-compatible event metadata | Requires actor, reason, previous/new states, timestamp |

Canonical audit metadata may contain actor reference, resource reference, safe action/result, timestamp, request/correlation references, and a governed reason. It must never contain email, password, password hash, session token/hash, cookie, private profile data, or raw database errors.

## 9. Database Impact

### `core_user_accounts`

Required governed fields remain:

- `user_identifier` primary key;
- unique `identity_reference`;
- `account_type`;
- `account_status`;
- `lifecycle_status`;
- `visibility_classification`;
- created, updated, and optional archived timestamps.

This reconciliation adds the contract rule that account status and lifecycle status are equal at persistence boundaries. The current migration does not physically enforce that rule; whether to add a check constraint requires a separately approved forward/rollback migration review and must not rewrite Migration 001 after application.

### `profiles`

The future physical profile requires, at minimum, a distinct profile identifier, required user-account ownership reference, profile type, status/lifecycle-compatible value, visibility, and timestamps consistent with the approved field and profile contracts. Exact column names/types and archive handling remain a Migration 002 physical-schema decision.

### Conflicts and unresolved physical decisions

| Conflict | Decision/status |
| --- | --- |
| Runtime UUID versus canonical string identifiers | Canonical opaque identifiers win; storage/mapping implementation unresolved |
| Runtime email/password fields versus credential-free account table | Credentials remain separate; credential schema unresolved |
| Runtime active/disabled versus five states | Mapping decided; legacy disabled reason/backfill unresolved |
| Account status versus lifecycle status | Must be equal in V1; physical constraint requires future review |
| Runtime profile keyed by user id | Canonical distinct profile identifier and explicit owner win |
| Profile Migration 002 | Not present; exact physical schema unresolved and blocked |
| Credential/session persistence | Separate private migrations/contracts required; not authorized |
| Legacy `infra/database` identity tables | Not authoritative and must not supply schema defaults |

No migration is created or authorized by this contract.

## 10. Mission 069G Adapter Contract Requirements

The generic Mission 069G types remain scaffolding. Future identity integration requires these bounded adapters/ports:

| Boundary | Required responsibility | Required input/output restrictions |
| --- | --- | --- |
| Identity transport adapter | Map unchanged register/login/logout/session DTOs and responses | No lifecycle constants, credentials in canonical commands, or Nest objects past the adapter |
| Identifier generator/mapping port | Allocate and resolve identity/user/profile identifiers atomically | Opaque identifiers only; no email-derived ids |
| Credential verifier port | Verify private login input and return identity reference or generic failure | Never return password hash or account record |
| Session port | Create/revoke/resolve a minimal authenticated subject | Never expose token hash to canonical code |
| User Account application port | Create/read/check eligibility/change lifecycle through canonical rules | Requires canonical identifiers/type/status/lifecycle/visibility |
| Profile application port | Create/read/update profile with explicit owner/type/status/visibility | No implicit user-id-as-profile-id mapping |
| Error adapter | Map canonical safe errors to unchanged runtime HTTP behavior | Preserve authentication ambiguity and strip private metadata |
| Audit port | Emit canonical and runtime-security events with allowlisted metadata | No credential/contact/token payloads |

Dependency direction remains:

```text
Nest controllers → runtime adapters → canonical application ports → domain rules
                                      ↑
                    credential/session/account/profile/audit adapters
```

No adapter implementation, provider registration, controller wiring, or use case is introduced here.

## 11. Security Review

This reconciliation prevents duplicate authentication by preserving one runtime credential/session mechanism and making canonical code responsible only for account/domain eligibility. It prevents password/token exposure by excluding credential material from canonical identifiers, ports, accounts, profiles, errors, audit events, and public projections.

Security gates for future implementation:

- one authenticated-subject resolution path for all protected use cases;
- constant-time password verification and hashed session-token storage remain mandatory;
- account lifecycle is checked after credential/session verification and before use-case access;
- private email is never emitted by a public profile adapter;
- mapping and audit logs contain opaque references, not personal login identifiers;
- errors preserve generic invalid-credential behavior;
- dual runtime/canonical paths cannot both authorize the same request independently.

No secret, credential, token, password, private record, or production value is added by this contract.

## 12. KILL CRITICAL Review

Canonical account types remain identity taxonomy only. This contract creates no marketplace account, seller identity, payment identity, commission identity, social identity, tracking identity, AI scoring identity, or related capability.

Profile types do not grant selling, transaction, ranking, following, tracking, or automated-decision authority. Adapters may not translate business/professional/organization references into prohibited account capabilities.

**KILL CRITICAL result: PASS.**

## 13. Required Next Missions

1. **Credential & Session Persistence Boundary Contract:** finalize private fields, retention, revocation, hashing metadata, subject resolution, errors, audit, and separate migration ordering.
2. **Profile Physical Schema Contract:** finalize Migration 002 identifier/type/status/visibility/ownership/timestamp columns and rollback behavior without implementation.
3. **Legacy Identity Backfill Policy:** decide whether any runtime data is durable; if so, define disabled-reason classification, idempotent identifier mapping, audit, and rollback.
4. **Canonical Module Typed Consumption Boundary:** finalize TypeScript/ESM imports, declarations, package exports, and build enforcement.
5. **Workspace Health Repair:** fix existing backend/frontend failures and require `npm run test:all` to pass.
6. **Identity Adapter Implementation Plan:** only after missions 1–5, define a bounded in-memory adapter cutover with parity and rollback tests; do not combine it with database migration.

After missions 1–5 are approved, identity reconciliation may be re-evaluated as **READY FOR ADAPTER IMPLEMENTATION**. It is not ready today.

