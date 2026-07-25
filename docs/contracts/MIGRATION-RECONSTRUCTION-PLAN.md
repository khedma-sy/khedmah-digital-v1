# Migration Reconstruction Plan

## 1. Mission 069N Decision

This contract defines the governed reconstruction sequence for future Profile, Professional Profile, and Business Profile migrations after the Mission 069M lineage audit. It creates no SQL, table, index, foreign key, runtime adapter, or persistence behavior.

**MIGRATION RECONSTRUCTION STATUS: REQUIRES FURTHER RECONCILIATION.**

The dependency, identifier, lifecycle, visibility, constraint, index, rollback, security, and testing plans are fixed below. SQL implementation is blocked because the referenced Mission 068 Profile Database Contract and Mission 069 Specialized Profile Decisions are not present in repository history, Migration 001 applied-state is unknown, and Mission 046 public-field/organization-ownership requirements conflict with the newer minimal identity foundations.

## 2. Repository Identity

Pre-analysis commands confirmed:

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
origin https://github.com/khedma-sy/khedmah-digital-v1.git (fetch)
origin https://github.com/khedma-sy/khedmah-digital-v1.git (push)

git status --short
(clean)
```

This is the official `khedmah-digital-v1` repository. No separate legacy repository was detected. `infra/database` remains quarantined legacy SQL inside this repository.

## 3. Migration Authority

| Concern | Decision |
| --- | --- |
| Official migration source | `backend/migrations/versions` only |
| Legacy SQL | `infra/database` is not a migration source, schema authority, seed source, or reconstruction template |
| Numbering | Preserve the governed sequence 001, 002, 003, 004; never reuse a version for a different concept |
| Forward naming | `NNN_lowercase_snake_case.sql` |
| Rollback naming | Same forward stem plus `_rollback.sql` |
| Reversibility | Every forward file requires a reviewed rollback before merge |
| Execution | Repository inclusion does not authorize automatic or production execution |

Legacy `user_profiles`, organizations, contact, audit, and analytics SQL must not be copied, renamed, or used to infer missing fields.

## 4. Existing Migration 001 Review

### Keep unchanged in this mission

- Table `core_user_accounts` remains the current governed account identity anchor.
- `user_identifier` is its TEXT primary key.
- `identity_reference` is required and unique.
- `account_type`, `account_status`, `lifecycle_status`, and `visibility_classification` use constrained values.
- `created_at`, `updated_at`, and `archived_at` establish timestamp/archive compatibility.
- Identifier format, archive timestamp, and timestamp-order checks remain.
- Its rollback drops only its three indexes and table.
- It stores no password, token, credential, profile, business, organization, payment, marketplace, or tracking data.

### Modify only through a future governed migration

- Add or otherwise enforce the V1 rule that `account_status` and `lifecycle_status` remain compatible/equal if the applied-state review confirms that rule.
- Any identifier type or table-name conversion must be additive and compatibility-safe when 001 has been applied.
- Index or constraint corrections must use a new approved version; an applied 001 must never be edited in place.

### Requires decision before 002 SQL

1. Whether 001 has been applied in any environment.
2. Whether the physical lineage permanently standardizes on TEXT `*_identifier` fields or requires a future UUID compatibility path.
3. Whether `core_user_accounts` is the final physical name or a later compatibility view/rename is required by Mission 046's `users` vocabulary.
4. Whether duplicate account status/lifecycle fields remain or are normalized later.

For reconstruction planning, future 002–004 references use the existing `core_user_accounts(user_identifier)` contract. This is a planning baseline, not permission to conceal the unresolved 001 decisions.

## 5. Shared Physical Conventions for 002–004

These conventions are mandatory if implementation is later authorized:

- PostgreSQL-compatible plain SQL.
- TEXT opaque identifiers with entity prefixes, matching the current governed 001 direction.
- Identifiers are generated outside SQL; no email, name, slug, account id, or profile id is reused to derive another identifier.
- Every owner reference targets `core_user_accounts(user_identifier)`.
- Every specialized profile references a valid base `profiles(profile_identifier)` row.
- Status and lifecycle values are `created`, `pending`, `active`, `suspended`, `archived`.
- Visibility values are `public`, `private`, `internal`.
- Status equals lifecycle status in the initial physical slice unless a later approved contract replaces this compatibility rule before implementation.
- Archived lifecycle requires `archived_at`; non-archived records may leave it null.
- `updated_at >= created_at`.
- Foreign-key deletion is `RESTRICT`/`NO ACTION`; identity records are archived, not cascade-deleted.
- No database trigger implements domain workflow or ownership transfer.
- Indexes exist only for validated ownership, relationship, type, status, lifecycle, and visibility queries.
- Each migration operates transactionally when the future runner supports it.

## 6. Migration 002 Reconstruction Plan

### Future filename and purpose

`002_create_profiles.sql` creates the base public-identity representation owned by a valid user account. It must not create authentication, professional, business, organization, service, trust, contact, or marketplace behavior.

### Planned minimal columns

| Column | Physical plan | Decision state |
| --- | --- | --- |
| `profile_identifier` | TEXT primary key; `profile_`-prefixed safe format | Fixed |
| `user_identifier` | TEXT required owner FK to `core_user_accounts`; unique in the first reconstruction slice | Fixed for first slice |
| `profile_type` | Required check: `personal_profile`, `professional_profile`, `business_profile`, `organization_profile`, `partner_profile`, `representative_profile` | Fixed from Mission 055 |
| `profile_status` | Required five-state lifecycle-compatible value | Fixed |
| `visibility` | Required `public`, `private`, or `internal` | Fixed |
| `lifecycle_status` | Required five-state value equal to `profile_status` initially | Fixed |
| `created_at` | Required `TIMESTAMPTZ`, safe creation default | Fixed |
| `updated_at` | Required `TIMESTAMPTZ`, safe creation default | Fixed |
| `archived_at` | Nullable `TIMESTAMPTZ`; required when archived | Fixed |

### Deferred Mission 046 fields

`public_name`, `arabic_name`, `short_description`, and `public_slug` are not silently rejected, but they are not authorized for the minimal identity migration until the missing Mission 068 contract is recovered or replaced. Mission 046 says `public_name` is required while Mission 055 defines only display-name/description references and stores no private user data. Their physical nullability, normalization, uniqueness, Arabic-first behavior, and privacy projection must be decided before 002 is implementation-ready.

### Constraints and indexes

- Primary-key and prefix-format checks for `profile_identifier`.
- Required FK from `user_identifier` to `core_user_accounts` with non-cascading deletion.
- Unique owner relationship for the first slice, preventing duplicate base-profile ownership.
- Allowed-value checks for type, status, lifecycle, and visibility.
- Status/lifecycle compatibility, archive timestamp, and timestamp-order checks.
- Composite uniqueness on `(profile_identifier, user_identifier)` to support ownership-preserving specialized-profile foreign keys.
- Indexes planned for `user_identifier`, `profile_type`, `profile_status`, `lifecycle_status`, and `visibility`; redundant indexes must be removed during physical review if already covered by a unique constraint.

### Rollback

`002_create_profiles_rollback.sql` may run only after 004 and 003 have been rolled back. It drops only 002-owned indexes/constraints as required by PostgreSQL object ownership and then `profiles`. It must not drop or modify `core_user_accounts` or legacy tables.

## 7. Migration 003 Reconstruction Plan

### Future filename and purpose

`003_create_professional_profiles.sql` creates professional identity extensions for valid Professional base profiles. It does not store credentials, certificates, verification evidence, services, booking, payments, or organization ownership.

### Planned minimal columns

| Column | Physical plan |
| --- | --- |
| `professional_profile_identifier` | TEXT primary key with `professional_profile_` prefix |
| `profile_identifier` | TEXT required and unique; references the base profile |
| `user_identifier` | TEXT required; must be the same owner recorded by the base profile |
| `profession_type` | Required: `doctor`, `dentist`, `engineer`, `lawyer`, `consultant`, `freelancer`, `technical_specialist`, `other_professional` |
| `professional_status` | Required five-state value |
| `visibility` | Required public/private/internal value |
| `lifecycle_status` | Required five-state value equal to `professional_status` initially |
| `created_at`, `updated_at`, `archived_at` | Shared timestamp/archive contract |

### Ownership, relationship, and constraints

- One professional identity per base profile through unique `profile_identifier`.
- Composite FK `(profile_identifier, user_identifier)` to the base-profile ownership pair prevents owner mismatch.
- Base `profile_type` must be `professional_profile`; because a normal FK cannot validate a non-key type safely, the repository/application boundary validates it transactionally before insert. A later physical review may approve a composite type FK only if it does not duplicate mutable domain logic.
- Prefix, allowed-value, lifecycle compatibility, archive timestamp, and timestamp-order checks are required.
- Indexes: owner, profession type, status, lifecycle, and visibility; do not duplicate the unique profile index.

Mission 046 specialty, qualification/experience summary, service, location, and trust fields are deferred. They require their owning modules and privacy/reference contracts and must not be smuggled into the identity reconstruction.

### Rollback

`003_create_professional_profiles_rollback.sql` drops only 003-owned indexes and `professional_profiles`. It does not touch `profiles`, `core_user_accounts`, business profiles, credentials, services, trust, or locations. It can be rolled back independently of 004 because neither specialized table depends on the other.

## 8. Migration 004 Reconstruction Plan

### Future filename and purpose

`004_create_business_profiles.sql` creates user-owned business identity extensions for valid Business base profiles. It does not create organizations, suppliers, product catalogs, inventory, transactions, marketplace sellers, payments, services, contacts, locations, media, or trust records.

### Planned minimal columns

| Column | Physical plan |
| --- | --- |
| `business_profile_identifier` | TEXT primary key with `business_profile_` prefix |
| `profile_identifier` | TEXT required and unique; references the base profile |
| `user_identifier` | TEXT required owner for the initial user-owned slice; must match the base profile owner |
| `business_type` | Required: `restaurant`, `shop`, `workshop`, `service_business`, `retail_business`, `factory`, `supplier_business`, `company` |
| `business_status` | Required five-state value |
| `visibility` | Required public/private/internal value |
| `lifecycle_status` | Required five-state value equal to `business_status` initially |
| `created_at`, `updated_at`, `archived_at` | Shared timestamp/archive contract |

### Ownership, relationship, and constraints

- One business identity per base profile through unique `profile_identifier`.
- Composite FK `(profile_identifier, user_identifier)` prevents mismatch with base-profile ownership.
- Base `profile_type` must be `business_profile`, validated before insert through canonical/repository rules unless a safe composite physical constraint is separately approved.
- Organization ownership is **not** included. Mission 057 currently requires Users ownership, while Mission 046 anticipates conditional organization ownership. Adding a nullable organization FK before 005 would create a forward/circular dependency and violate the current foundation.
- Prefix, type, status, lifecycle, visibility, archive timestamp, and timestamp-order checks are required.
- Indexes: owner, business type, status, lifecycle, and visibility; do not duplicate the unique profile index.

Mission 046 business name, category, service, location, contact, media, trust, and organization fields are deferred pending explicit physical contracts. Because Mission 046 marks business name/category as required, this conflict is a blocker rather than permission to omit them silently.

### Rollback

`004_create_business_profiles_rollback.sql` drops only 004-owned indexes and `business_profiles`. It preserves 003, 002, 001, organizations, and all unrelated concepts. It can be rolled back independently of 003.

## 9. Dependency Order

```text
001_core_identity_accounts
            ↓ owner FK
002_create_profiles
       ┌────┴────┐
       ↓         ↓
003_create_   004_create_
professional business_
profiles      profiles
```

Professional and Business Profiles depend on 002 because each is a typed identity extension, not a replacement for the base public identity. They require the base profile's durable identifier and validated owner pair. Neither 003 nor 004 depends on the other, so after 002 they may be applied in numeric order and rolled back independently before 002.

005 remains outside this plan and cannot be introduced until 002–004 are present and organization ownership/profile decisions are approved.

## 10. Identifier Reconciliation

| Identifier | Authority and uniqueness | Mapping rule |
| --- | --- | --- |
| `identity_reference` | Identity authority; unique in `core_user_accounts` | Credential/session subject resolves to this opaque reference; never email/token derived |
| `user_identifier` | User Account authority; primary key and unique | Owner FK only; distinct from identity and every profile identifier |
| `profile_identifier` | Profiles authority; primary key and unique | Represents one base profile; never reuse `user_identifier` |
| `professional_profile_identifier` | Professional Profiles authority; primary key and unique | Distinct extension id linked to exactly one professional base profile |
| `business_profile_identifier` | Business Profiles authority; primary key and unique | Distinct extension id linked to exactly one business base profile |

All five identifiers are opaque and immutable. Relationships use explicit foreign references; equality between identifiers is forbidden. Runtime UUIDs and emails require a future mapping adapter and are not database defaults.

## 11. Lifecycle and Visibility

All three future tables support Created, Pending, Active, Suspended, and Archived as lowercase stored reference values. Allowed transitions remain domain/application rules:

- Created → Pending or Archived;
- Pending → Active, Suspended, or Archived;
- Active → Suspended or Archived;
- Suspended → Active or Archived;
- Archived → none.

Database checks constrain valid values and archive compatibility but do not implement transitions. Base and specialized lifecycles remain independent; activating an account or base profile does not automatically activate an extension.

All three support Public, Private, and Internal visibility. Persistence stores classification only. Public projection is allowlist-based outside the database; visibility does not grant authorization and private/internal records are never serialized directly.

## 12. Rollback Strategy

1. Each forward migration has one same-version paired rollback.
2. Rollback removes only objects created by that forward migration.
3. Rollback never drops `core_user_accounts`, legacy SQL objects, credentials, sessions, or unrelated schemas.
4. Dependency-safe full reversal is 004 and 003 in either order, then 002; 001 is not part of this reconstruction rollback.
5. Rollback must fail safely when a later governed dependency still references the target; `CASCADE` is forbidden.
6. Forward and rollback tests run against an isolated PostgreSQL-compatible database and compare pre/post schema inventory.
7. Production execution, data backup, applied-migration ledger, and destructive data rollback require separate operational authorization.

## 13. Legacy and Security Protection

Reconstructed 002–004 must not contain password/password hash, credential, token/token hash, cookie, session/session reference, email/private contact, IP/device identifier, tracking/anonymous identifier, arbitrary analytics metadata, payment/financial data, seller/marketplace field, inventory, order, commission, advertising, ranking, social graph, or AI scoring data.

They must not copy legacy `user_profiles`, organization ownership, contact inquiry, audit-log, or analytics-event definitions. No seed data is planned. Identifiers and timestamps are not tracking permission.

## 14. Future Test Plan

### Static migration tests

- exact forward/rollback filenames and one pair per version;
- unique sequential versions and no legacy path inclusion;
- no forbidden table/field vocabulary;
- expected table/column/check/index/FK declarations only;
- no `CASCADE`, unrelated `DROP`, secrets, seed data, or production values.

### PostgreSQL integration tests

- apply 001 → 002 → 003 → 004 in order;
- reject 003/004 before 002 and reject missing owners/profiles;
- reject duplicate owner/base-extension relationships and mismatched owner pairs;
- reject invalid identifiers, types, lifecycle/status, visibility, archive timestamps, and timestamp order;
- accept every approved lifecycle/visibility reference value;
- prove 003 and 004 rollback independence, then rollback 002;
- verify rollback restores the prior schema inventory and preserves 001/unrelated objects.

### Contract and security tests

- compare every implemented field against the final approved physical contract and Mission 046 disposition ledger;
- verify identifier separation and ownership-reference rules;
- verify credentials, sessions, private contact, tracking, analytics, payments, and marketplace fields are absent;
- verify runtime repositories/controllers remain unchanged and no migration auto-executes.

## 15. Implementation Blockers and Next Decision

Before SQL implementation, governance must complete:

1. Migration 001 applied-state and final TEXT/UUID/table-name compatibility decision.
2. A replacement or recovery decision for the absent Mission 068 Profile Database Contract.
3. A replacement or recovery decision for the absent Mission 069 Specialized Profile Decisions.
4. Mission 046 disposition for required Profile public fields, including Arabic-first naming and slug behavior.
5. Mission 046 disposition for required Business name/category and later organization ownership.
6. Approval of the minimal identity-only 002–004 slice or an explicitly expanded, privacy-reviewed alternative.
7. Migration framework pair/dependency/checksum/ledger/transaction verification plan.

Until these blockers are resolved, this document is the official reconstruction plan but not implementation authorization. No SQL migration may be created from provisional/deferred decisions.
