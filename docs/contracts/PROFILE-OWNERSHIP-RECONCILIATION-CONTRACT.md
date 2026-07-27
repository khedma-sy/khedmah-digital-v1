# Profile Ownership Reconciliation Contract

## 1. Mission 069K Decision

This contract reconciles runtime user/profile and organization ownership assumptions with the canonical Profile, Professional Profile, Business Profile, Organization, and Relationship foundations.

**PROFILE OWNERSHIP STATUS: REQUIRES FURTHER RECONCILIATION.**

The authority model and safe mapping rules are decided, but adapter implementation remains blocked by missing physical profile migrations, unresolved organization-managed business ownership, runtime owner/member conflation, typed canonical-module consumption, and red workspace tests.

This mission changes no runtime code, API, database schema, migration, authentication, authorization, or ownership behavior.

## 2. Runtime Profile Inventory

### User and profile model

The executable runtime has no independent Profile NestJS module, profile service, profile repository, or profile controller. Profile behavior is embedded in the Identity module:

- `UserAccount` stores one UUID id, private email, password hash, active/disabled status, and timestamps.
- `UserProfile` is keyed by the same `userId` and stores only display name, fixed Arabic locale, and timestamps.
- `IdentityRepository` stores accounts and profiles in separate in-memory Maps but uses the account id as the profile key.
- registration creates the account and profile together;
- `IdentityService.updateProfile` updates display name only;
- `UsersController PATCH /users/me/profile` exposes that operation;
- `PublicUserProfile` combines account id, private email, account status, display name, and locale.

### Runtime ownership assumptions

1. Account UUID, profile owner id, session subject, and audit actor id are the same value.
2. Profile ownership is implicit from the Map key; there is no explicit owner reference or ownership validation.
3. There is exactly one runtime profile record per account because it is keyed by `userId`.
4. The runtime profile has no identifier of its own, profile type, lifecycle/status, visibility, archive state, duplicate rule, or ownership-transfer rule.
5. The object called `PublicUserProfile` includes private email and is actually an authenticated current-user projection, not a canonical public profile.

### Runtime organization model

The Organizations runtime is separate from `UserProfile`, but it also uses the same runtime account UUID:

- `Organization.ownerUserId` records an owner directly;
- creation also creates an active organization member with role `owner`;
- ownership checks use the owner membership role;
- removal of the member matching `ownerUserId` is forbidden;
- member existence is checked by directly importing the concrete `IdentityRepository`;
- public organization/member projections expose owner and member user ids.

The runtime therefore duplicates owner-of-record and membership-role authority. It has no organization profile reference, organization type, lifecycle, visibility, or canonical organization identity reference.

### Runtime professional and business concepts

- No professional profile runtime model exists.
- No business profile runtime model or owner record exists.
- Contact keeps a `ContactBusinessProfileSnapshot` for its use case; that snapshot is not canonical business identity or ownership authority.
- Runtime account/profile records contain no profession, business type, organization type, professional credentials, or business ownership fields.

These absences are safer than fabricating mappings, but they mean canonical extension adapters cannot yet be implemented.

## 3. Canonical Profile Inventory

### Base Profile

The Profile module owns:

- independent profile identity reference;
- profile type: Personal, Professional, Business, Organization, Partner, or Representative;
- Created, Pending, Active, Suspended, and Archived lifecycle/status;
- Public, Private, and Internal visibility;
- explicit Users ownership reference;
- public identity representation and field classification;
- duplicate, invalid ownership, unauthorized transfer, lifecycle, and visibility rules.

A base profile represents public-facing identity. It does not become a business, professional credential, organization, authentication identity, or user account.

### Professional Profile

The Professional Profiles module owns:

- a distinct professional identity reference;
- required base profile reference;
- profession type;
- independent lifecycle and visibility using canonical profile vocabulary;
- explicit user-account and base-profile ownership references;
- professional duplicate and unauthorized-transfer prevention.

It must not own a business entity, organization, service, certificate store, or credential store.

### Business Profile

The Business Profiles module owns business identity, business type, lifecycle, visibility, and business-specific public/private fields. The current module foundation accepts a Users owner and base profile reference and forbids silently becoming an organization, supplier, marketplace seller, payment account, or service owner.

The database field dictionary anticipates a future conditional organization-owned business relationship. That future case conflicts with the current Users-only module foundation and is **not resolved or authorized** by Mission 069K.

### Organization

The Organizations module owns organizational identity, organization type, lifecycle, visibility, ownership reference, and membership references. It requires a Users owner reference and base profile reference while keeping membership separate from account identity and ownership.

An organization is not a user account, does not own authentication identity, and does not become the owner of its representing base profile. Organization membership is a relationship/role reference, not proof of credential identity or profile ownership.

### Relationship layer

The Relationships module connects governed subject and target references. It does not own either entity, assign permissions, replace owner-of-record rules, transfer ownership, or create lifecycle state. Relationship existence cannot be used as an implicit ownership grant.

## 4. Official Authority and Ownership Model

```text
Authentication Identity
        ↓ references
User Account (owner of record for user-owned identity relationships)
        ↓ explicit ownership reference
Base Profile (public identity representation)
        ↓ extension reference, never inheritance of credentials
Professional Profile OR Business Profile OR Organization identity

Relationship records connect references only; they own none of the identities.
```

### Authority decisions

| Entity | Owns | Owner-of-record/reference | Must not own |
| --- | --- | --- | --- |
| Identity | Private authentication identity reference | Runtime credential subject maps to canonical identity/user | Public profile, business/professional/org identity |
| User Account | Durable account identity, account lifecycle and visibility | Canonical Users | Password/session data, public profile representation |
| Base Profile | Public identity representation, profile type/status/visibility | Exactly one explicit Users ownership reference in the first adapter slice | Authentication, account lifecycle, extension-specific entity data |
| Professional Profile | Professional identity and profession-specific representation | Explicit Users owner plus required base profile reference | Business/org/service/credential ownership |
| Business Profile | Business identity and business-specific representation | Explicit Users owner plus required base profile reference in the currently approved adapter slice | Organization conversion, seller/payment/marketplace identity |
| Organization | Organizational identity, organization type, lifecycle, visibility, memberships | Explicit Users owner plus representing base profile reference | User account, profile owner, credential identity, payment/marketplace ownership |
| Relationship | Typed connection between references | Its governed creator/manager only; never entity ownership | Identity, permission, lifecycle, or ownership authority |

“Owns identity” means the module is authoritative for that entity's rules and fields. It does not mean the entity is a legal owner, credential owner, or owner of other records.

## 5. Runtime Ownership Conflicts

| Conflict | Current runtime behavior | Canonical rule | Required resolution |
| --- | --- | --- | --- |
| User owns profile fields implicitly | Profile keyed by account UUID; no explicit owner | Base profile has distinct id and explicit Users ownership reference | Profile adapter maps runtime owner to canonical `userIdentifier` and a distinct `profileIdentifier`; never reuse one id for both |
| Account/profile projection | One response merges email/status/display/locale | Account private data and profile public/private projections are separate | Preserve current authenticated route envelope through transport mapping; never treat it as public profile output |
| Runtime profile type | No type field | Every canonical profile has an approved type | Existing runtime display profile can be proposed as Personal only through explicit creation/backfill policy; adapter cannot infer other types |
| Runtime profile lifecycle | No profile state | Profile lifecycle is independent | No automatic Account Active → Profile Active mapping; creation/activation policy requires a future application contract |
| Runtime profile visibility | None | Profile visibility is explicit | Adapter cannot default silently; defaults require an approved creation policy and audit |
| Business data in profile | None in `UserProfile`; Contact has a shadow business snapshot | Business identity belongs only to Business Profiles | Do not promote Contact snapshots into business ownership or canonical profiles |
| Professional data in account | None | Professional identity belongs only to Professional Profiles | Keep absent; never infer profession from account type or route usage |
| Organization owner/member duplication | Direct `ownerUserId` plus owner membership role | Owner-of-record and membership are distinct references | Define owner reference as authority; membership role grants scoped management only and cannot silently transfer owner-of-record |
| Organization uses account id directly | UUID used for owner/member lookup | Canonical user reference required; organization is not a user | Use authenticated-subject/user reference adapter; remove direct concrete identity repository dependency in a later mission |
| Organization public projection | Exposes owner/member user ids | Ownership/membership references are private/internal unless explicitly public | Public adapter must omit private owner/member identifiers; authenticated management projection is separate |
| Organization profile | None | Organization identity requires its own rules and representing base profile reference | Do not fabricate a profile from organization name; define creation/link policy before adapter implementation |

## 6. Profile Type Reconciliation

| Canonical profile type | Runtime equivalent | Mapping decision | Unknown/risk |
| --- | --- | --- | --- |
| Personal Profile | Display-name/locale `UserProfile` | Candidate only after explicit distinct profile id, owner reference, lifecycle, and visibility are assigned by policy | Existing record alone is insufficient |
| Professional Profile | None | No automatic mapping | Profession, base profile, lifecycle, visibility, ownership, evidence boundaries missing |
| Business Profile | Contact business snapshot only | Snapshot is not an equivalent and must not map | Owner, base profile, business type, lifecycle, visibility missing |
| Organization Profile | Runtime Organization is an entity, not a profile | No direct conversion; future organization profile must be a distinct base profile representation linked by reference | Organization owner/member semantics unresolved |
| Partner Profile | None | No mapping | Future-only |
| Representative Profile | None | No mapping | Future-only |

Profile type is immutable for the first adapter slice. Changing type is not a generic update; it requires a separately governed conversion/new-extension decision. Account type does not automatically select or create a profile type.

## 7. Visibility and Projection Reconciliation

### Canonical classes

- **Public:** approved discovery-safe identity fields only.
- **Private:** authenticated owner/manager fields such as private contact references and account preferences.
- **Internal:** security, moderation, duplicate detection, audit, and operational metadata.

### Projection rules

| Projection | Allowed | Forbidden |
| --- | --- | --- |
| Public base profile | Active/public display identity and approved public description/reference fields | Email, phone, account status, owner id, credentials, internal metadata |
| Authenticated current-user view | Private email/preferences and owned profile values required by the existing route | Password/hash, token/hash, internal security metadata, unrelated profiles |
| Public professional profile | Approved professional display identity and profession category | Private contact, verification evidence, certificates, owner account id |
| Public business profile | Approved business identity/type/public contact reference if governed | Private owner/contact, payment/seller data, internal metadata |
| Public organization | Approved organization name/type/description | `ownerUserId`, member user ids/roles, private contact, operational metadata |
| Management view | Minimal owner/member references and allowed management fields after authorization | Credentials, unrelated account/profile data, raw audit/security metadata |

Runtime types prefixed `Public` do not establish canonical public safety. Every adapter must construct a projection from an allowlist after lifecycle, ownership/authorization, and visibility checks. Private email/contact and internal metadata are deny-by-default.

## 8. Lifecycle Reconciliation

Base Profile, Professional Profile, Business Profile, and Organization each use the same vocabulary but maintain independent state:

1. Created
2. Pending
3. Active
4. Suspended
5. Archived

### Allowed transitions

| From | Allowed to |
| --- | --- |
| Created | Pending, Archived |
| Pending | Active, Suspended, Archived |
| Active | Suspended, Archived |
| Suspended | Active, Archived |
| Archived | None |

All other transitions are forbidden. Adapters, memberships, relationships, owner account status, and extension status may not bypass these transitions.

### Cross-entity lifecycle rules

1. Active User Account does not automatically activate a base profile.
2. Active base profile does not automatically activate a professional/business/organization identity.
3. Suspending an extension does not automatically suspend its base profile or owner account.
4. Archived base profile prevents public extension projection but does not automatically delete/archive extension records; a future application policy must coordinate them.
5. Archived owner account blocks management actions but does not transfer ownership or delete profiles.
6. Relationship or membership lifecycle never replaces entity lifecycle.

The runtime currently has no profile lifecycle and a separate active/removed membership status. Neither can be used as an implicit canonical profile/organization lifecycle mapping.

## 9. Database Impact and Migration Order

### Required future physical fields

| Record | Minimum governed fields for physical design review |
| --- | --- |
| `profiles` | distinct profile identifier, required user-account owner reference, profile type, status/lifecycle-compatible value, visibility, created/updated timestamps, optional archive timestamp if approved |
| `professional_profiles` | distinct professional identifier, required base profile reference, required user owner reference, profession type, status, visibility, timestamps |
| `business_profiles` | distinct business identifier, required base profile reference, approved user owner reference for current slice, business type, status/lifecycle, visibility, timestamps |
| `organizations` | distinct organization identifier, required owner user reference, required representing profile reference if retained by final physical contract, organization type, status/lifecycle, visibility, timestamps |

Exact column names, UUID/text choices, foreign-key targets, archive rules, indexes, uniqueness, and deletion behavior require dedicated physical-schema contracts. This document creates no migration.

### Missing fields in runtime models

- separate profile/professional/business/organization identity references;
- explicit canonical user owner references;
- base profile references for extensions;
- profile/extension types;
- canonical lifecycle/status and visibility;
- archive metadata;
- duplicate and ownership-transfer metadata/audit;
- safe public/private/internal projection classification.

### Required migration order

```text
001 core_user_accounts (existing governed pair)
        ↓
002 profiles
        ↓
003 professional_profiles
        ↓
004 business_profiles
        ↓
005 organizations only after final organization/profile ownership review
```

Organization-managed Business Profile ownership, if approved later, requires an additive relationship/owner strategy after both organizations and business profiles exist. It must not be smuggled into 002–004 or inferred from legacy SQL.

### Migration risks

- reusing runtime user UUID as profile/extension identifiers;
- creating multiple base profiles for the same first-slice owner relationship;
- promoting Contact snapshots to canonical business records;
- conflating organization owner-of-record with owner member role;
- cascading account/profile/archive operations destructively;
- leaking owner/member identifiers through public query models;
- creating extension records before a valid base profile;
- circular foreign keys between organizations and business profiles;
- using the quarantined `infra/database` schema as authority.

## 10. Future Adapter Requirements

| Adapter | Required role | Must not do |
| --- | --- | --- |
| Profile Adapter | Map runtime authenticated profile input/output to distinct canonical base-profile commands/projections | Invent profile type/visibility/lifecycle or expose private email publicly |
| Professional Profile Adapter | Map future professional DTOs to canonical professional ports after base profile validation | Store credentials/evidence, infer profession, or own business/org/service entities |
| Business Profile Adapter | Map future business DTOs to canonical business ports after base profile and owner validation | Promote Contact snapshots, create seller/payment identity, or infer organization ownership |
| Organization Adapter | Map runtime organization values to canonical organization ports and separate owner/member references | Treat organization as user/profile owner, expose member ids publicly, or decide ownership transfer in mapping |
| Ownership Reference Adapter | Resolve authenticated `userIdentifier`, base `profileIdentifier`, and entity references | Accept raw DTO owner ids, email, session id, or membership as owner proof |
| Visibility Projection Adapter | Build explicit public/private/internal allowlisted outputs | Serialize domain/persistence objects directly |
| Lifecycle Adapter | Submit requested transitions and map safe results/errors | Infer or bypass transitions based on account/membership state |
| Relationship Adapter | Connect validated subject/target references | Assign ownership, permission, role, or entity lifecycle |

No adapter implementation, provider registration, API wiring, database query, or behavior replacement is authorized here.

## 11. Security and Ownership Integrity

The reconciled model prevents private exposure and ownership escalation through these gates:

- every base/extension/organization record uses an explicit canonical owner/reference, never email or session id;
- authenticated subject resolution precedes ownership checks;
- owner-of-record, manager role, membership, and relationship are distinct concepts;
- ownership transfer requires a future explicit use case, authorization, reason, lifecycle compatibility, and audit event;
- duplicate active ownership/profile relationships are rejected by canonical rules and future unique constraints;
- public projections use allowlists and exclude email, private contact, owner/member ids, credentials, verification evidence, and internal metadata;
- persistence adapters never decide ownership, lifecycle, visibility, or authorization;
- profile and organization records store no password, token, cookie, session, credential secret, or financial/payment data.

The current runtime remains unchanged, including its direct Identity dependencies and public type names. Those are migration risks, not authority for future design.

## 12. KILL CRITICAL Review

This contract introduces no marketplace ownership, seller profile, payment ownership, commission ownership, social profile, tracking profile, AI identity scoring, or related authority.

Professional, Business, Organization, Partner, and Representative are governed identity representations only. They do not imply selling, transactions, payments, commissions, ranking, followers, tracking, or automated scoring. Relationship adapters cannot create those capabilities.

**KILL CRITICAL result: PASS.**

## 13. Required Next Missions

1. **Profile Physical Schema Contract:** finalize Migration 002 fields, identifiers, owner foreign key, lifecycle, visibility, uniqueness, indexes, archival, and rollback behavior.
2. **Professional & Business Physical Schema Reconciliation:** finalize 003/004 ownership and base-profile references without implementation.
3. **Organization Ownership & Membership Contract:** separate owner-of-record, owner role, manager/member roles, transfer, public projection, and organization-profile relationship before Migration 005.
4. **Organization-Managed Business Decision:** reconcile the field dictionary's conditional organization ownership with the current Users-only Business Profile foundation.
5. **Profile Creation/Default Policy:** decide when registration creates a personal profile and approve type/status/visibility defaults and audit events.
6. **Authenticated Projection Contract:** reconcile current `/users/me` and organization management responses with canonical private/public/internal projections without changing APIs yet.
7. **Typed Module Consumption and Workspace Health Repair:** finalize imports/types and make the canonical test command green.
8. **Bounded Profile Adapter Plan:** only after missions 1, 5, 6, and 7, plan an in-memory Profile adapter without database migration or route change.

Profile ownership must be re-evaluated after missions 1–7. It is not ready for adapter implementation today.

