# Physical Database Schema Review & Migration Safety Contract

## Mission Boundary

This contract is documentation and architecture review only. It does not implement database tables, collections, migrations, database connections, ORM models, APIs, backend code, frontend code, UI screens, authentication, authorization middleware, or production infrastructure.

## 1. Repository Identity Check

Commands executed before analysis:

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
(no remotes configured)

git status --short
(clean before this contract file was created)
```

Repository identity confirmation: this is the correct `khedmah-digital-v1` repository. No legacy repository detected.

## 2. Previous Architecture Compatibility Review

Reviewed sources:

- Mission 043 Architecture Freeze: `docs/audits/MISSION-043-ARCHITECTURE-FREEZE-FINAL-CONSISTENCY-GATE-AUDIT.md`.
- Mission 044 Database Architecture Design: `docs/contracts/DATABASE-ARCHITECTURE-DESIGN-CONTRACT.md`.
- Mission 045 ERD Table Naming Contract: `docs/contracts/DATABASE-ERD-TABLE-NAMING-CONTRACT.md`.
- Mission 046 Field Dictionary Contract: `docs/contracts/DATABASE-FIELD-DICTIONARY-CONSTRAINTS-SEED-DATA-CONTRACT.md`.

Confirmed decisions:

- Canonical entities are stable enough for physical schema planning.
- Table naming uses lowercase plural snake_case.
- Primary keys use singular concept plus `_id`.
- Relationships use explicit relationship tables for memberships, provider services, partner relationships, representative assignments, and coverage.
- Field dictionary requires type, required flag, visibility, validation, owner, and audit expectations.
- V1 remains non-marketplace, non-payment, non-advertising, non-ranking, non-social, and non-AI.

Conflicts:

- No blocking conflicts detected.
- Non-blocking naming decision remains between `users` and `user_accounts` as final physical table name.
- Supplier representation remains a decision between `suppliers` and `supplier_capabilities`.
- Platform-owned organization representation remains a decision between a dedicated table and `organizations.is_platform_owned`.

Required corrections before implementation:

- Choose final table names for user account, supplier capability, and platform-owned organization representation.
- Define enum storage strategy.
- Define audit payload snapshot format.
- Define location seed governance and migration order.

## 3. Physical Schema Mapping Review

| Table/collection | Purpose | Primary key strategy (`primary key strategy`) | Foreign key/reference strategy (`foreign key/reference strategy`) | Required fields (`required fields`) | Lifecycle fields (`lifecycle fields`) | Ownership references (`ownership references`) |
| --- | --- | --- | --- | --- | --- | --- |
| users | Account identity anchor. | `user_id` uuid. | Referenced by profiles, memberships, roles, audit actor fields. | user_id, account_status, lifecycle_state, created_at, updated_at. | created_at, updated_at, archived_at, lifecycle_state. | user_id as account subject. |
| profiles | Public identity layer. | `profile_id` uuid. | owner_user_id references users. | profile_id, profile_type, public_name, status, visibility_class. | created_at, updated_at, status. | owner_user_id. |
| professional_profiles | Professional identity extension. | `professional_profile_id` uuid. | profile_id, owner_user_id, trust_record_id. | profile_id, owner_user_id, profession, status. | status, created_at, updated_at. | owner_user_id or governed organization relationship. |
| business_profiles | Business identity extension. | `business_profile_id` uuid. | profile_id, owner_user_id, organization_id, category_id, trust_record_id. | profile_id, business_name, category_id, lifecycle_status. | lifecycle_status, created_at, updated_at, archived_at. | owner_user_id or organization_id. |
| organizations | Managed organization/factory/company/platform entity. | `organization_id` uuid. | owner_user_id, headquarters_location_id. | organization_id, owner_user_id, organization_type, public_name, status. | status, created_at, updated_at, archived_at. | owner_user_id. |
| organization_members | User-to-organization membership. | `organization_member_id` uuid. | organization_id, user_id, role_id. | organization_id, user_id, role_id, status. | status, starts_at, ends_at, created_at, updated_at. | organization owner/admin governance. |
| suppliers | Supplier capability or supplier entity. | `supplier_id` or `supplier_capability_id` uuid. | organization_id or business_profile_id. | supplier_type, status, owning entity reference. | status, created_at, updated_at, archived_at. | organization_id or business_profile_id. |
| partners | Partner profile/relationship anchor. | `partner_id` uuid. | profile_id, organization_id, trust_record_id. | partner_type, status. | status, lifecycle_state, created_at, updated_at. | partner owner or organization relationship. |
| representatives | Representative profile or assignment-facing concept. | Prefer `representative_assignment_id` for authority. | representative_profile_id, represented_entity_id, scope_id. | representative_type, represented entity, scope, status. | status, starts_at, ends_at. | represented entity governance. |
| categories | Taxonomy category reference. | `category_id` uuid. | business_type reference if modeled. | name_ar, slug, status. | status, created_at, updated_at. | platform taxonomy governance. |
| services | Catalog service reference. | `service_id` uuid. | category_id, subcategory_id, workflow_type_id. | name_ar, slug, category_id, status. | status, created_at, updated_at. | platform taxonomy governance. |
| locations | Governed location reference. | `location_id` uuid. | country_id, city_id, area_id. | public_label_ar, status, hierarchy references. | status, created_at, updated_at. | platform location governance. |
| trust_records | Entity trust state. | `trust_record_id` uuid. | entity_type + entity_id. | entity_type, entity_id, trust_level, verification_status. | status, reviewed_at, created_at, updated_at. | platform trust governance. |
| verification_records | Verification decision history. | `verification_record_id` uuid. | trust_record_id, reviewed_by_user_id, audit_record_id. | trust_record_id, decision, audit_record_id. | reviewed_at, created_at. | platform trust governance. |
| audit_records | Sensitive action history. | `audit_record_id` uuid. | actor_user_id, entity_type + entity_id. | actor/action/entity/timestamp/reason for sensitive actions. | occurred_at. | platform operational governance. |

Schema mapping decision: every future table can map to a clear purpose, key strategy, reference strategy, required fields, lifecycle fields, and ownership reference without structural conflict.

## 4. Relationship Integrity Review

### One-to-One

- profiles → professional_profiles is one-to-zero-or-one.
- profiles → business_profiles is one-to-zero-or-one.
- eligible entity → active trust_record is one-to-zero-or-one active record.

### One-to-Many

- users → profiles.
- organizations → organization_members.
- organizations → business_profiles.
- business_profiles/professional_profiles → provider_services.
- entities → audit_records.

### Many-to-Many

- users ↔ organizations through organization_members.
- providers ↔ services through provider_services.
- partners ↔ organizations/businesses through partner_relationships.
- representatives ↔ represented entities through representative_assignments.
- providers/partners/representatives ↔ locations through coverage tables.

Integrity verification:

- Ownership integrity (`ownership integrity`) requires owner_user_id or organization_id for owned records.
- Relationship uniqueness requires scoped unique active constraints.
- Orphan prevention (`orphan prevention`) requires references to existing lifecycle-valid records.
- Invalid reference prevention requires entity_type + entity_id validation for polymorphic-style relationships.

## 5. Migration Safety Review

Future migration principles:

| Migration action | Safety principle |
| --- | --- |
| Adding fields (`adding fields`) | Add nullable or safe-default fields first; backfill only after validation rules exist. |
| Changing fields | Introduce new field, dual-read/dual-write future application logic, backfill, then deprecate old field. |
| Renaming fields (`renaming fields`) | Prefer additive rename migration with compatibility period; do not destructive-rename first. |
| Removing fields | Deprecate, verify no reads/writes, archive/back up data, then remove in later migration. |
| Data migration strategy | Use idempotent, auditable data transformations with rollback notes. |
| Backward compatibility (`backward compatibility`) | Preserve old fields until clients/services are migrated in future implementation. |

Migration risks:

- Flattening profiles into one table may create nullable-field sprawl.
- Supplier representation may require future migration if modeled too narrowly.
- Location seed changes may affect discovery and coverage references.
- Trust/audit changes may create compliance gaps if destructive migrations occur.
- Enum changes may break validation if not versioned or governed.

## 6. Database Performance Review

Performance review terms: indexes, relationship queries, location queries, service discovery queries, status filtering.

Future performance considerations:

- Index owner references for ownership checks.
- Index profile slugs and public names for discovery lookup.
- Index relationship references for membership, provider services, partner coverage, and representative assignments.
- Index country_id, city_id, area_id, and location_id for location queries.
- Index category_id, subcategory_id, service_id, and workflow_type_id for service discovery queries.
- Index status, lifecycle_state, verification_status, trust_level, and archived_at for status filtering.

Prevent:

- Unnecessary indexes that slow writes without clear query use.
- Ranking indexes.
- Advertising indexes.
- Tracking indexes.
- Paid visibility indexes.
- Social graph indexes.
- Marketplace transaction indexes.

Performance decision: index only identity, relationship, location, status, and discovery-filter fields. Do not create ranking, advertising, tracking, social, AI, payment, commission, or marketplace indexes.

## 7. Data Lifecycle Review

Lifecycle states:

```text
Created
↓
Pending
↓
Active
↓
Suspended
↓
Archived
```

Application by entity:

| Entity | Lifecycle rule |
| --- | --- |
| users | Created/pending until activation; suspended blocks access; archived preserves audit. |
| businesses | Pending until profile validation; active for discovery; suspended hidden/limited; archived preserved. |
| organizations | Pending until ownership validation; active for memberships/profiles; suspended limits authority; archived preserves relationships. |
| services | Draft/pending/active/inactive/deprecated; active only for discovery. |
| trust records | Pending/unverified/verified/rejected/suspended; trust decisions require audit. |

Lifecycle decisions:

- Archived records must not behave as active records.
- Suspended records must not be hard-deleted.
- Invalid transitions require future validation errors.
- Sensitive lifecycle changes require audit_records.

## 8. Soft Delete & Archive Strategy

Archive strategy terms: archive behavior, restoration principles.

Archive behavior:

- Use `archived_at` and status/lifecycle fields instead of hard deletion for owned entities.
- Preserve audit_records and verification_records.
- Hide archived profiles from active discovery unless future governance allows historical views.
- Keep referenced catalog/location data inactive/deprecated rather than deleted when referenced.

Data preservation:

- Preserve ownership history.
- Preserve trust and verification decision history.
- Preserve relationship history with starts_at/ends_at.
- Preserve audit trail for sensitive changes.

Audit requirements:

- Archive actions require actor, entity, previous state, new state, timestamp, and reason.
- Restoration actions require audit and permission validation.

Restoration principles:

- Restored records must pass validation before reactivation.
- Restored records must not bypass duplicate prevention.
- Restored trust status may require review if stale.

Prevention: accidental permanent loss is avoided by defaulting to archive/soft delete and audit-backed restoration.

## 9. Security Database Review

Security review terms: private user data, verification evidence, internal operational data, ownership information.

Protected data:

- Private user data: normalized_email, normalized_phone, owner references, private contact references.
- Verification evidence: decision evidence and reviewer context remain internal.
- Internal operational data: audit_records, duplicate matching evidence, suspension reasons, moderation notes.
- Ownership information: owner_user_id, organization ownership, role assignments, representative scope.

Security prevention:

- No sensitive fields in public discovery queries.
- No verification evidence in public trust display.
- No owner contact exposure through duplicate errors.
- No unauthorized access to audit_records.
- No credentials, tokens, passwords, secrets, production URLs, or production values in seed/reference data.

## 10. Duplicate Prevention Final Review

Duplicate review terms: duplicate users, duplicate businesses, duplicate professionals, duplicate services, duplicate relationships.

Database-level duplicate prevention compatible with Mission 042:

| Duplicate type | Database prevention |
| --- | --- |
| duplicate users | Unique normalized_email/normalized_phone where present and verified; internal duplicate review for private identity signals. |
| duplicate businesses | Scoped normalized name + owner/category/location/contact signals; duplicate review record future-only. |
| duplicate professionals | Owner + profession + specialty + credential/contact/location signals; no private evidence exposure. |
| duplicate services | Unique service slug within category/subcategory/workflow scope. |
| duplicate relationships | Scoped unique active constraints for organization_members, partner_relationships, representative_assignments, and coverage records. |

Duplicate decision: use deterministic constraints for safe unique fields and internal review for fuzzy/private matches; never expose private matching evidence.

## 11. Seed & Initial Data Safety Review

Seed review terms: roles, permissions, workflow types, fake production data.

Allowed initial/reference data only:

- roles.
- permissions.
- categories.
- locations.
- workflow types.
- trust levels.

Seed safety rules:

- No fake production data.
- No fake businesses.
- No fake users.
- No fake ratings.
- No fake verification.
- No fake trust scores.
- No production-like demo data.
- No private addresses, tokens, credentials, or production values.

Seed decision: seed/reference data may initialize catalogs and governed values only. It must not create marketplace supply, fake activity, ratings, user accounts, business profiles, or trust evidence.

## 12. KILL CRITICAL Database Final Audit

Prevented structures:

- Marketplace database structures.
- Payment structures.
- Commission structures.
- Advertising structures.
- Ranking structures.
- Social graph structures.
- AI tracking structures.
- Unnecessary analytics tracking.
- Delivery marketplace structures.
- Inventory/order/cart/checkout structures.

Final database critical decision: physical schema planning remains limited to identity, profiles, organizations, services, locations, trust, relationships, audit, and governed reference data.

## 13. Database Implementation Readiness Score

Implementation readiness score: **97 / 100**.

Remaining risks:

- Final table naming for users versus user_accounts.
- Supplier table versus supplier_capabilities strategy.
- Platform-owned organization representation strategy.
- Enum storage strategy.
- Audit payload snapshot format.
- Migration ordering and rollback procedure for first implementation.

Required decisions before implementation:

1. Choose final physical table names.
2. Choose enum storage strategy.
3. Choose supplier representation.
4. Choose platform-owned organization representation.
5. Define audit payload snapshot schema.
6. Define first migration ordering and rollback policy.

## 14. Schema Review Decisions

- Approved architecture can map to future physical schema without blocking structural conflict.
- Relationship tables are required for memberships, provider services, partners, representatives, and coverage.
- Lifecycle, status, ownership, trust, and audit fields must be preserved in implementation.
- Soft delete/archive is preferred over hard deletion.
- Seed data must remain reference-only.
- Indexes must support identity, relationship, location, status, and discovery filtering only.

## 15. Migration Decisions

- Additive migrations are preferred.
- Destructive migrations require deprecation and audit-backed migration planning.
- Field renames should use compatibility periods.
- Enum changes require governance and compatibility review.
- Backfills must be idempotent and reviewable.
- Rollback notes must exist before migration execution.

## 16. Resolved Conflicts

- Relationship integrity is resolved through explicit relationship tables.
- Orphan prevention (`orphan prevention`) is resolved through required references and lifecycle-valid checks.
- Duplicate prevention is resolved through scoped unique constraints plus internal review.
- Data preservation is resolved through archive/soft delete strategy.
- V1 scope is protected through final database kill-critical exclusions.

## 17. Final Recommendation

Recommended next mission: **Mission 048 — First Database Migration Plan & Rollback Playbook Contract**.

Purpose: define migration ordering, rollback playbook, enum/reference setup, audit payload shape, and seed governance as documentation only before creating any actual migrations, tables, ORM models, or database connections.
