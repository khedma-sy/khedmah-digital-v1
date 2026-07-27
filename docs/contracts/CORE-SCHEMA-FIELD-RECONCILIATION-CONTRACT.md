# Core Schema Field Reconciliation Contract

## 1. Mission 069O Decision

This contract resolves the physical field conflicts identified by Missions 069I, 069M, and 069N for the governed account, base Profile, Professional Profile, and Business Profile lineage. It supersedes the provisional field choices in the Mission 069N reconstruction plan where explicitly stated.

**CORE SCHEMA STATUS: READY FOR MIGRATION IMPLEMENTATION.**

“Ready” means the field contract for future Migrations 002–004 is complete enough for separate, explicitly authorized implementation missions. Mission 069O creates no SQL, table, index, migration, database connection, adapter, or runtime behavior. Migration 005 remains outside this decision.

## 2. Repository Identity

```text
pwd
/workspace/khedmah-digital-v1

git rev-parse --show-toplevel
/workspace/khedmah-digital-v1

basename "$(git rev-parse --show-toplevel)"
khedmah-digital-v1

git branch --show-current
work

git remote -v
(no remotes configured in this checkout)

git status --short
(clean)
```

Repository identity is confirmed as `khedmah-digital-v1`. No separate legacy repository was detected. `infra/database` remains non-authoritative legacy SQL inside the official repository.

## 3. Canonical Identifier Contract

All canonical identifiers are opaque, immutable TEXT values. Prefix checks provide type safety at persistence boundaries; they do not encode personal data or ownership.

| Identifier | Purpose | Authority/owner | Uniqueness | Visibility | Mutable? | Migration usage |
| --- | --- | --- | --- | --- | --- | --- |
| `identity_reference` | Links the account record to one authentication identity subject without storing credentials | Identity module | Globally unique in `core_user_accounts` | Internal | No | Existing required unique field in 001; referenced through account resolution, not by profile tables |
| `user_identifier` | Durable canonical User Account identifier and owner reference | Users module | Globally unique primary key | Internal | No | Existing 001 primary key; required FK target for 002–004 ownership |
| `profile_identifier` | Durable Base Profile identifier | Profiles module | Globally unique primary key | Internal | No | 002 primary key; required unique extension FK target for 003/004 |
| `professional_profile_identifier` | Durable Professional Profile identity | Professional Profiles module | Globally unique primary key | Internal | No | 003 primary key only |
| `business_profile_identifier` | Durable Business Profile identity | Business Profiles module | Globally unique primary key | Internal | No | 004 primary key only |

Required formats:

- `identity_reference`: existing `identity_` prefix contract;
- `user_identifier`: existing safe 001 identifier format, with no new derivation rule;
- `profile_identifier`: `profile_` plus a safe opaque suffix;
- `professional_profile_identifier`: `professional_profile_` plus a safe opaque suffix;
- `business_profile_identifier`: `business_profile_` plus a safe opaque suffix.

Email, phone, display name, slug, runtime UUID, credential subject, session id, and one entity's identifier must never be used as another entity's identifier. Runtime UUIDs may exist behind a future mapping adapter but do not become canonical merely because the runtime generated them first.

## 4. `core_user_accounts` Final Direction

### Existing 001 fields

| Field | Final decision |
| --- | --- |
| `user_identifier` | **Approve.** TEXT primary key and canonical account identifier. UUID migration is rejected for the 001–004 reconstruction lineage. |
| `identity_reference` | **Approve.** Required unique internal reference; separate from `user_identifier`. |
| `account_type` | **Approve.** Keep the five existing checked reference values. It classifies account compatibility and does not create a Profile automatically. |
| `account_status` | **Compatibility-only.** Existing 001 column is retained unchanged because applied state is unknown; it must equal `lifecycle_status` at all future write boundaries. No new table copies this pattern. |
| `lifecycle_status` | **Approve as canonical lifecycle authority.** Uses created/pending/active/suspended/archived. |
| `visibility_classification` | **Compatibility-only naming.** Retain in 001; semantics equal the canonical visibility vocabulary. New tables use `visibility`. |
| `created_at` | **Approve.** Required `TIMESTAMPTZ`. |
| `updated_at` | **Approve.** Required `TIMESTAMPTZ`, never earlier than creation. |
| `archived_at` | **Approve.** Nullable unless lifecycle is archived, then required. |

### Duplicate-state resolution

There is one lifecycle authority: `lifecycle_status`. `account_status` is not a second independent state machine. Because Mission 069O may not rewrite Migration 001, repositories for 001 must write the same value to both columns and reject contradictions. A later corrective migration may add an equality check and eventually remove `account_status` only after applied-state and compatibility review.

Future Profiles, Professional Profiles, and Business Profiles store **only `lifecycle_status`**. The provisional `profile_status`, `professional_status`, and `business_status` columns from Mission 069N are rejected as duplicate lifecycle columns.

### Naming resolution

`core_user_accounts`, TEXT canonical identifiers, `lifecycle_status`, and the existing 001 timestamps are the physical baseline for 002–004. The Mission 046 `users.user_id` UUID vocabulary is superseded for this governed lineage. No edit to 001 is required before implementing 002.

## 5. Base Profile Field Contract — Future 002

### Approved fields

| Field | Required | Physical meaning |
| --- | --- | --- |
| `profile_identifier` | Yes | TEXT primary key; immutable canonical Profile identity |
| `user_identifier` | Yes | Owner FK to `core_user_accounts(user_identifier)`; unique for the initial one-account/one-base-profile relationship |
| `profile_type` | Yes | `personal_profile`, `professional_profile`, `business_profile`, `organization_profile`, `partner_profile`, or `representative_profile` |
| `display_name` | Yes | Public-safe identity label; non-empty normalized safe text with a bounded length; Arabic content is fully supported and preferred by product policy |
| `lifecycle_status` | Yes | Sole lifecycle field |
| `visibility` | Yes | Public/private/internal classification, not authorization |
| `created_at` | Yes | Creation timestamp |
| `updated_at` | Yes | Last-change timestamp |
| `archived_at` | Conditional | Required only when archived |

### Unresolved Mission 046 public fields disposition

| Candidate | Decision | Reason |
| --- | --- | --- |
| `public_name` | **Reject as a separate column.** | Canonical physical name is `display_name`; two public-name fields would drift. Mission 046's required public-name intent is satisfied by required `display_name`. |
| `arabic_name` | **Defer.** | Arabic is supported directly in `display_name`. A separate localized-name model requires multilingual fallback/search rules and must be additive later. |
| `short_description` | **Defer.** | Profile Foundation defines a public-description reference boundary, not approved free-text persistence. Content moderation, length, and projection need a separate contract. |
| `public_slug` | **Defer.** | Slug namespace, normalization, reservation, renaming, redirects, and archive reuse require a discovery/URL contract. |
| generic `public_fields`/JSON | **Reject.** | Unbounded public data bypasses field classification, migrations, validation, and privacy review. |

Deferred fields are not required for identity persistence and do not block Migration 002. They may be added only by later additive migrations.

## 6. Professional Profile Field Contract — Future 003

### Approved fields

| Field | Required | Physical meaning |
| --- | --- | --- |
| `professional_profile_identifier` | Yes | TEXT primary key; immutable Professional Profile identity |
| `profile_identifier` | Yes | Unique Base Profile reference |
| `user_identifier` | Yes | Owner reference; paired with `profile_identifier` to prevent owner mismatch |
| `profession_type` | Yes | Doctor, dentist, engineer, lawyer, consultant, freelancer, technical specialist, or other professional stored using foundation reference values |
| `lifecycle_status` | Yes | Sole five-state lifecycle field |
| `visibility` | Yes | Public/private/internal classification |
| `created_at`, `updated_at` | Yes | Standard timestamps |
| `archived_at` | Conditional | Required when archived |

`professional_status` is rejected because it duplicates `lifecycle_status`. Specialty, summaries, service/location references, and trust references are deferred to their owning contracts.

Certificates, licenses, documents, verification evidence, credential material, booking, scheduling, payments, and financial data are explicitly excluded from Migration 003.

## 7. Business Profile Field Contract — Future 004

### Approved fields

| Field | Required | Physical meaning |
| --- | --- | --- |
| `business_profile_identifier` | Yes | TEXT primary key; immutable Business Profile identity |
| `profile_identifier` | Yes | Unique Base Profile reference |
| `user_identifier` | Yes | Owner reference for the initial user-owned slice; paired with `profile_identifier` |
| `business_type` | Yes | Restaurant, shop, workshop, service business, retail business, factory, supplier business, or company using foundation values |
| `display_name` | Yes | Public-safe business identity label; satisfies Mission 046's required business-name intent without duplicating base naming terminology |
| `lifecycle_status` | Yes | Sole five-state lifecycle field |
| `visibility` | Yes | Public/private/internal classification |
| `created_at`, `updated_at` | Yes | Standard timestamps |
| `archived_at` | Conditional | Required when archived |

`business_status` is rejected because it duplicates `lifecycle_status`. `business_name` is standardized to `display_name`. `category_id`, service/location/contact/media/trust references are deferred until their referenced tables and privacy/ownership contracts exist.

Organization ownership is deferred and is not represented by a nullable or polymorphic owner field in 004. The initial record is user-owned only. A later additive relationship/ownership migration may support organization management after Migration 005 without creating a circular reference.

Products, catalogs, inventory, orders, carts, payments, financial data, commissions, prices, and marketplace seller fields are explicitly excluded.

## 8. Lifecycle Standardization

The only official lifecycle column for new core identity tables is `lifecycle_status` with stored lowercase values:

1. `created`
2. `pending`
3. `active`
4. `suspended`
5. `archived`

Allowed transitions remain canonical application/domain rules: created to pending/archived; pending to active/suspended/archived; active to suspended/archived; suspended to active/archived; archived is terminal.

Database constraints validate vocabulary and require `archived_at` for archived rows. They do not implement workflows. Entity lifecycles are independent, so an active account does not automatically activate its Profile or specialized extension.

No future table may add a generic `status` or entity-prefixed status column that mirrors lifecycle. Non-lifecycle classifications must have precise names and separate contracts.

## 9. Visibility Standardization

New tables use one column named `visibility`, with stored values `public`, `private`, or `internal`.

Visibility classifies the maximum permitted projection of an entity. It is not a permission, role, authentication result, ownership proof, row-level access policy, or authorization decision. A public entity may still contain fields that are never public; adapters construct allowlisted projections.

The existing 001 `visibility_classification` is a naming compatibility exception only. No new table repeats that name.

## 10. Timestamp Standardization

| Field | Rule |
| --- | --- |
| `created_at` | Required `TIMESTAMPTZ`; set once at insert; immutable afterward |
| `updated_at` | Required `TIMESTAMPTZ`; set at insert and on every persisted change; must be greater than or equal to `created_at` |
| `archived_at` | Nullable for non-archived rows; required for archived rows; must not precede `created_at`; cleared only by a separately authorized restoration transition |

No `deleted_at` is approved. Identity records use archive semantics and non-cascading references.

## 11. Constraint and Index Strategy

### Unique and ownership constraints

- Primary keys uniquely constrain every entity identifier.
- `identity_reference` remains unique in 001.
- 002 uniquely constrains `user_identifier` for the initial one-account/one-base-profile relationship.
- 003 and 004 each uniquely constrain `profile_identifier`, allowing at most one corresponding specialized extension.
- 002 provides unique `(profile_identifier, user_identifier)`; 003/004 use composite FKs to that pair, preventing owner mismatch.
- Display names are not globally unique. Duplicate identity detection must not force unrelated people/businesses to have unique names.

### Foreign references and deletion

- 002 owner references existing `core_user_accounts(user_identifier)`.
- 003/004 reference the base Profile and preserve its owner.
- Foreign-key deletion uses `RESTRICT`/`NO ACTION`; `CASCADE` is forbidden for these identity records.
- Profiles cannot reference specialized profiles, preventing circular foreign keys.
- 004 does not reference future organizations, preventing 004↔005 circular dependency.
- Orphan specialized profiles and duplicate ownership relationships are rejected.

### Indexes

Plan indexes only for owner references, profile type, profession/business type, lifecycle status, visibility, and timestamp/archive filtering where a documented query requires them. Unique constraints already provide indexes and must not be redundantly indexed.

## 12. Mission 046 Compatibility Ledger

### Compatible or normalized

- Account/profile ownership references, lifecycle intent, visibility classification, timestamps, archive behavior, professional profession, business type, and public identity naming remain represented.
- Mission 046 `profile_id`, `professional_profile_id`, and `business_profile_id` are normalized to typed `*_identifier` TEXT fields.
- Mission 046 `public_name` and `business_name` intent is normalized to required `display_name`.
- Mission 046 `status`/`lifecycle_state` intent is normalized to sole `lifecycle_status` for new tables.

### Changed decisions

- TEXT opaque identifiers replace UUID physical keys for the governed 001–004 lineage.
- `core_user_accounts` replaces the proposed `users` physical table name.
- New tables use `visibility`, while 001 retains `visibility_classification` for compatibility.
- User-owned base profiles are one per account in the initial slice rather than conditionally ownerless.
- Professional and Business records preserve `user_identifier` directly to enforce ownership equality.

### Deferred decisions

- Arabic/localized alternate names, descriptions, slugs, professional specialty/summaries, category, services, locations, contact, media, trust, and organization ownership.
- Every deferred field requires an additive migration after its domain, privacy, reference, and lifecycle contract exists.

### Rejected decisions

- Duplicate entity status columns, generic JSON public fields, UUID reuse from runtime, cascade deletion, polymorphic organization ownership in 004, and credentials/private operational data in identity tables.

## 13. Security and KILL CRITICAL Review

Approved 001–004 schema direction stores no password or password hash, token or token hash, credential, cookie, session or session reference, private document, license/certificate evidence, email/private contact, IP/device/anonymous/tracking identifier, arbitrary analytics metadata, payment/financial field, or authentication secret.

It introduces no marketplace, payment, order, commission, advertising, ranking, social graph, tracking, or AI scoring field. Professional and Business Profile types are identity classifications only and do not authorize commerce or discovery manipulation.

**KILL CRITICAL result: PASS.**

## 14. Implementation Readiness and Residual Work

There are no unresolved field blockers for separately authorized Migrations 002, 003, and 004. Implementation must follow dependency order, paired rollback requirements, PostgreSQL integration tests, and the exact approved/deferred/rejected decisions above.

Residual work that does not block 002–004:

1. Determine Migration 001 applied state before any future correction to its compatibility columns.
2. Add lifecycle equality enforcement to 001 only through a separately numbered, approved corrective migration if needed.
3. Govern additive localized name, description, slug, professional detail, business category/reference, and organization-owner fields later.
4. Complete Migration framework checksum/ledger/transaction execution hardening before production execution.
5. Repair existing backend/frontend workspace tests before treating the repository-wide test command as green.

The next permitted database work is a dedicated Migration 002 implementation mission. Mission 069O itself authorizes no SQL.
