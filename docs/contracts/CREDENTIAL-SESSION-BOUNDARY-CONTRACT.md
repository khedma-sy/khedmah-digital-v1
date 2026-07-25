# Credential & Session Boundary Contract

## 1. Mission 069J Decision

This contract separates authentication credentials, sessions, HTTP security, canonical identity, user accounts, and profiles according to Missions 069F–069I.

**CREDENTIAL BOUNDARY STATUS: READY FOR ADAPTER IMPLEMENTATION.**

This status authorizes only a future bounded adapter implementation against the existing in-memory runtime after typed-consumption and workspace-health gates pass. It does not authorize authentication behavior changes, durable credential/session storage, tables, migrations, login changes, new identity providers, or API changes.

## 2. Current Authentication Runtime Findings

### Runtime composition

The executable NestJS runtime registers `AuthController`, `UsersController`, `IdentityService`, `IdentityRepository`, and `SessionTokenService`. Authentication is service-driven; no NestJS guard, Passport strategy, or authentication middleware establishes a request subject globally.

Protected operations currently parse the `khedmah_session` cookie and call `IdentityService.getCurrentUser` or `getSession`. Organizations and Contact also call identity services directly. Request context contains request id, correlation id, and start time, but no authenticated subject.

### Credential processing

| Concern | Current behavior |
| --- | --- |
| Login identifier | Email is trimmed, lowercased, format-checked, and limited to 254 characters |
| Password input | Required string, 12–128 characters |
| Password hashing | Random 16-byte salt, PBKDF2-SHA512, 120,000 iterations, 64-byte derived key |
| Password verification | Stored format is parsed, candidate is derived, lengths are compared, then timing-safe comparison is used |
| Duplicate lookup | In-memory account lookup by normalized email |
| Authentication failure | Generic `Invalid credentials.` for absent account, inactive account, or wrong password |

The current password policy does not enforce the canonical non-common-password requirement. Changing it is outside this contract and requires a compatibility mission.

### Session and token processing

| Concern | Current behavior |
| --- | --- |
| Token generation | 32 random bytes encoded as base64url |
| Stored token representation | SHA-256 token hash only |
| Session lifetime | One hour |
| Session validation | Hash presented token, locate unrevoked and unexpired session, then load active account/profile |
| Revocation | Set `revokedAt` on the in-memory session |
| Cookie | HTTP-only, SameSite Strict, secure in production, `/api/v1` path, one-hour max age |
| Refresh token | Not implemented |
| Durable session store | Not implemented |

Raw session tokens exist only at generation and transport boundaries. The in-memory repository mixes account, profile, credential hash, session, and audit storage and is not an approved production credential store.

## 3. Credential Ownership Boundary

### Runtime authentication owns

- login/register/logout/session transport behavior;
- private login-identifier normalization and lookup;
- password-input policy enforcement approved for the runtime version;
- password hashing, verification, algorithm/parameter upgrades, and constant-time comparison;
- authentication failure ambiguity and rate/abuse controls;
- session creation, token generation/hash, validation, expiration, revocation, and rotation if later authorized;
- cookie creation, parsing, clearing, flags, path, and transport;
- mapping a verified credential/session to a minimal authenticated subject;
- request authentication context and framework-specific guards/adapters if separately authorized.

### Canonical Identity, Users, and Profiles own

- `identity_reference`, `user_identifier`, and `profile_identifier` authority;
- account type, lifecycle/status, lifecycle transitions, and authentication eligibility;
- user-account and profile ownership boundaries;
- user/profile visibility and privacy classifications;
- duplicate identity/account/profile invariants;
- framework-neutral identity/user/profile validation and safe errors;
- canonical identity/user/profile audit semantics.

### Prohibited responsibility mixing

1. Credential verification must not decide canonical lifecycle transitions or profile visibility.
2. Canonical modules must not hash passwords, generate tokens, parse cookies, validate HTTP headers, or manage sessions.
3. Session validity alone never authorizes a use case; canonical account eligibility and use-case authorization still apply.
4. Profile visibility never controls credential validity or session creation.
5. Runtime adapters translate identifiers and safe results; they do not redefine canonical allowed states, ownership, or privacy rules.

## 4. Credential Data Separation

The following governed records must **never** store password hashes, plaintext passwords, raw tokens, token hashes, session records, cookie values, refresh tokens, recovery secrets, credential secrets, or hashing salts/parameters:

- `core_user_accounts`;
- `profiles`;
- `professional_profiles`;
- `business_profiles`;
- `organizations`.

These records may contain only their approved opaque reference to the identity/user owner. A foreign or logical identity reference is not credential material.

### Logical future credential record

A future private Authentication Credential Store may logically own:

- opaque credential identifier;
- canonical `identity_reference`;
- normalized private login-identifier lookup value;
- password hash and algorithm/parameter metadata;
- credential status and verified/changed timestamps;
- rotation/revocation metadata required by security policy.

This list is a boundary contract, not a table, model, migration, or storage authorization. Plaintext passwords, recovery answers, raw tokens, and public profile fields are forbidden.

### Logical future session record

A future private Session Store may logically own:

- opaque session identifier;
- canonical identity/user subject references;
- token hash, never raw token;
- created, expires, revoked, and optional last-validated timestamps;
- safe revocation reason classification;
- narrowly scoped internal security metadata approved by a later retention contract.

It must not store passwords, public profile payloads, arbitrary request bodies, analytics metadata, cross-service tracking identifiers, or authorization snapshots that can outlive canonical policy changes.

## 5. Future Credential Boundary Model

```text
Private Authentication Credential Store
                  ↓ verified identity_reference
Executable Authentication Runtime
                  ↓ minimal subject
Authenticated Subject Adapter
                  ↓ identityReference + userIdentifier
Canonical User Account eligibility and domain authorization
```

### Boundary contracts

| Boundary | Input | Output | Forbidden output/decision |
| --- | --- | --- | --- |
| Credential lookup/verifier | Private normalized login identifier and password at the runtime edge | Verified `identityReference` or generic failure | Password/hash, account/profile object, existence detail, lifecycle decision |
| Session manager | Verified identity/user subject or presented raw token at transport edge | Raw token only to secure transport; stored hash; minimal resolved subject | Token hash to canonical code, profile payload, cached authorization decision |
| Authenticated Subject Adapter | Verified runtime session subject | Immutable `identityReference` and `userIdentifier` plus safe correlation context | Email, password/hash, token/hash, cookie, profile/private fields |
| Canonical eligibility port | Minimal subject and canonical account record | Eligible/ineligible safe result | Credential verification, cookie/session mutation |

The authenticated subject is a request-scoped security principal reference, not a user profile, session record, or authorization role cache.

## 6. Session Boundary Decisions

### Runtime responsibility

- create high-entropy session tokens;
- return raw tokens only through secure cookie transport;
- hash tokens before storage;
- validate token hash, expiry, and revocation;
- revoke sessions on logout or security action;
- establish one request-scoped authenticated subject;
- reject malformed, absent, expired, or revoked sessions generically;
- apply approved session retention and concurrent-session policy when later defined.

### Canonical responsibility

- determine whether the mapped user account is Active and otherwise eligible;
- reject Created, Pending, Suspended, or Archived accounts for ordinary authenticated access;
- enforce domain ownership and authorization for each use case;
- enforce visibility/private-field rules on outputs;
- provide safe canonical lifecycle/authorization errors to the runtime mapper.

### Validation sequence

```text
cookie/token transport validation
        ↓
session hash/expiry/revocation validation
        ↓
authenticated subject mapping
        ↓
canonical account lifecycle eligibility
        ↓
use-case ownership/authorization
        ↓
visibility-safe response mapping
```

No step may be skipped or duplicated by a feature module. A session resolver must not cache lifecycle eligibility beyond the canonical account read used for the request.

## 7. Error Mapping Contract

### Required compatibility mapping

| Contract-facing code | Canonical source compatibility | Runtime handling | Public exposure |
| --- | --- | --- | --- |
| `IDENTITY_INVALID` | Canonical `INVALID_IDENTITY_DATA` | Validation adapter; 400 only for non-credential identity commands | Safe code/message without private values |
| `USER_ACCOUNT_INVALID` | Users `USER_ACCOUNT_INVALID` | Account command validation; 400 | Safe field/code metadata only |
| `USER_ACCOUNT_LIFECYCLE_INVALID` | Users `USER_ACCOUNT_LIFECYCLE_INVALID` | Domain lifecycle conflict; normally 409 outside authentication | No internal transition/reason metadata |
| `FORBIDDEN_ACTION` | Canonical `FORBIDDEN_IDENTITY_ACTION` or `USER_ACCOUNT_FORBIDDEN` by resource | Authorization mapper; 403 | No owner/resource-existence disclosure |

### Authentication failure preservation

Login and session endpoints must continue to use a generic authentication failure response for:

- unknown login identifier;
- wrong password;
- malformed credential hash;
- expired or revoked session;
- missing mapped subject;
- account not eligible for authentication where a specific reason would enable enumeration.

Canonical error detail is recorded only in protected audit/operational channels using safe references. It must not change the public generic 401 response. An adapter must not expose `USER_ACCOUNT_LIFECYCLE_INVALID` from login in a way that reveals a registered account's state.

## 8. Authentication Audit Boundary

### Future event names

| Event | When emitted | Minimum safe references |
| --- | --- | --- |
| `LOGIN_SUCCESS` | Credentials verified, session created, account eligible | actor/identity reference, session reference, timestamp, request/correlation references |
| `LOGIN_FAILED` | Authentication attempt rejected | anonymous attempt reference, safe reason classification, timestamp, request/correlation references |
| `LOGOUT` | Valid session logout requested | actor reference, session reference, timestamp |
| `SESSION_CREATED` | Token created and hash persisted | actor/identity reference, opaque session reference, expiry, timestamp |
| `SESSION_REVOKED` | Logout/security action revokes session | actor/subject reference when known, opaque session reference, safe reason, timestamp |

Authentication audit events must never contain:

- plaintext passwords or password hashes;
- raw tokens or token hashes;
- cookies or authorization headers;
- normalized email/phone login identifiers;
- credential algorithm salts/derived values;
- full session objects;
- private profile/account payloads;
- raw request bodies or database errors.

`LOGIN_FAILED` must not create a stable cross-context tracking identity for an unauthenticated person. Rate-limit/abuse mechanisms may use short-lived private security keys under a separate retention policy, not canonical audit identity.

## 9. Dependency Rules

### Allowed

```text
NestJS auth controllers/guards
           ↓
runtime credential/session adapters
           ↓
authenticated-subject + canonical application ports
           ↓
canonical identity/users/profile domain rules
```

Runtime authentication may depend on adapter interfaces, canonical application ports, cryptographic runtime libraries, private credential/session repositories, and HTTP framework adapters.

### Forbidden

Canonical Identity, Users, Profiles, core, and shared modules must not import or reference:

- NestJS authentication services, decorators, guards, providers, or exceptions;
- Express requests/responses;
- cookies, headers, or HTTP sessions;
- password hashing or token libraries;
- runtime credential/session repositories;
- `apps/backend` services or DTOs;
- raw database clients.

Controllers and guards must not access credential/session databases directly; they call runtime ports. Credential/session adapters must not import controllers or decide canonical ownership/lifecycle transitions.

## 10. Security Review

### Prevented risks

- **Password leakage:** password material is confined to the credential input/verifier boundary and excluded from canonical records, outputs, errors, logs, and audits.
- **Token/session leakage:** raw tokens exist only at transport creation/presentation; stored and compared values are hashes; canonical code receives no token material.
- **Duplicate authentication:** one runtime credential/session mechanism produces one authenticated subject; canonical modules do not implement another login/session system.
- **Inconsistent identity checks:** canonical account lifecycle is evaluated after session verification for every protected request.
- **Private-data leakage:** authenticated subject and audit records contain opaque references, not email/profile/credential payloads.

### Remaining risks

1. The current concrete Identity service/repository is exported to feature modules instead of one authenticated-subject port.
2. No central NestJS guard currently establishes the subject; protected services repeat cookie/session resolution.
3. Credential/session persistence schema, encryption-at-rest controls, retention, concurrent-session policy, rotation, compromise response, and deletion are not approved.
4. The runtime common-password policy differs from canonical security guidance.
5. Workspace tests/build are still red, preventing safe adapter integration.
6. Typed ESM/TypeScript canonical-module consumption remains unresolved.

These risks do not invalidate the ownership boundary, but they block durable storage and production cutover.

## 11. KILL CRITICAL Review

This contract introduces no marketplace account, payment credential, seller authentication, commission account, social login graph, tracking identity, AI identity scoring, or capability derived from authentication state.

Authentication proves a platform subject only. It does not grant seller, payment, commercial, ranking, social, tracking, or automated-decision authority. Those concepts cannot be embedded in credentials, sessions, cookies, or authenticated-subject metadata.

**KILL CRITICAL result: PASS.**

## 12. Implementation Gate and Next Missions

The boundary itself is ready for a future adapter implementation, subject to these gates:

1. **Canonical Typed Consumption Repair:** finalize TypeScript/ESM types, exports, import paths, and build enforcement.
2. **Workspace Health Repair:** fix the current NestJS exception import and frontend assertion so `npm run test:all` passes.
3. **Authenticated Subject Port Foundation:** define type-only subject/session/credential interfaces and architecture tests without wiring behavior.
4. **Credential & Session Storage Contract:** define database technology, private fields, indexes, encryption, retention, rotation, revocation, cleanup, rollback, and migration order before any table implementation.
5. **Authentication Error/Audit Implementation Plan:** define exact mapper tests and audit adapter tests while preserving current routes and generic failures.
6. **Bounded In-Memory Adapter Implementation:** only after gates 1–3, adapt existing in-memory behavior without database or API changes.

**Durable credential/session persistence and production authentication remain unauthorized.**

