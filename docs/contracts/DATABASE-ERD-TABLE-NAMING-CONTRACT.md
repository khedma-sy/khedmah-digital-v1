# Database Entity Relationship Diagram & Table Naming Contract

## Mission Boundary

This contract is documentation and architecture preparation only. It does not implement database tables, collections, migrations, database connections, APIs, backend code, frontend code, UI screens, authentication, authorization middleware, or production infrastructure.

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

Repository identity confirmation: this is the correct `khedmah-digital-v1` repository. No legacy repository was detected.

## 2. Database Naming Convention Contract

Official naming rules:

| Rule | Contract |
| --- | --- |
| Table naming | Use lowercase plural snake_case names, such as `users`, `profiles`, `business_profiles`, and `audit_records`. |
| Column naming (`column naming`) | Use lowercase snake_case names, such as `user_id`, `profile_id`, `created_at`, and `updated_at`. |
| Primary key naming (`primary key naming`) | Use singular table concept plus `_id`, such as `user_id`, `profile_id`, `organization_id`, and `audit_record_id`. |
| Foreign key naming (`foreign key naming`) | Use referenced entity concept plus `_id`, such as `owner_user_id`, `profile_id`, `organization_id`, `service_id`, and `location_id`. |
| Timestamp naming (`timestamp naming`) | Use `created_at`, `updated_at`, `archived_at`, `verified_at`, `reviewed_at`, `starts_at`, and `ends_at`. |
| Status field naming (`status field naming`) | Use explicit status fields such as `status`, `lifecycle_state`, `verification_status`, `relationship_status`, and `trust_level`. |
| Boolean naming | Use affirmative names such as `is_platform_owned`, `is_public`, `is_active`, and `requires_audit`. |
| Reference naming | Use `_id` for direct entity references and `_ref` only in documentation when the storage strategy is not finalized. |

Examples:

```text
users
user_id
created_at
updated_at
```

Naming decisions:

- Prefer `users` over `user_accounts` for the primary account table if implementation needs shorter auth identity naming; preserve `user_accounts` as the architecture concept.
- Use `profiles`, `professional_profiles`, and `business_profiles` as separate names to prevent profile ambiguity.
- Use `provider_services` to represent provider-to-service relationships and keep `services` as catalog data.
- Use `representative_assignments` to represent scoped authority and avoid treating representatives as owners.
- Use `platform_owned_organizations` or `organizations.is_platform_owned` as a final design decision in implementation planning.

## 3. Core ERD Design

Official relationship model:

```text
User Accounts
↓
Profiles
↓
Professional Profiles
↓
Business Profiles
↓
Organizations
```

### Core Cardinality

| Relationship | Cardinality | Notes |
| --- | --- | --- |
| users → profiles | One-to-many | A user may own/manage multiple profile contexts. |
| profiles → professional_profiles | One-to-zero-or-one | A profile may become a professional profile when professional identity is required. |
| profiles → business_profiles | One-to-zero-or-one | A profile may represent a business profile, separate from professional identity. |
| organizations → business_profiles | One-to-many | An organization may own or manage multiple business profiles/branches. |
| users → organizations | Many-to-many through organization_members | Users join organizations through explicit membership and roles. |
| business_profiles → provider_services | One-to-many | A business profile may offer multiple catalog services. |
| professional_profiles → provider_services | One-to-many | A professional profile may offer multiple catalog services. |
| entities → trust_records | One-to-zero-or-one active trust record | Trust is attached to eligible entities and protected from self-edit. |
| entities → audit_records | One-to-many | Sensitive actions create audit records. |

Core ERD decision: relationships must be explicit, typed, scoped, status-aware, and audit-compatible before implementation.

## 4. Identity Relationship Design

Tables/concepts:

- users.
- profiles.
- roles.
- permissions.
- role_assignments.
- permission_assignments.

Identity ERD:

```text
users
↓ owns/manages
profiles
↓ receives scoped access through
role_assignments
↓ references
roles
↓ grants
permission_assignments
↓ references
permissions
```

### Identity Table Contract

| Table | Primary key | Key references | Lifecycle / access boundary |
| --- | --- | --- | --- |
| users | user_id | none or profile owner references | Created, pending, active, suspended, archived. Private account data. |
| profiles | profile_id | owner_user_id | Public-safe identity layer; profile type must be explicit. |
| roles | role_id | none | Platform-governed role catalog. |
| permissions | permission_id | none | Platform-governed permission catalog. |
| role_assignments | role_assignment_id | user_id, role_id, entity_type, entity_id | Scoped assignment; must include status and audit references. |
| permission_assignments | permission_assignment_id | role_id, permission_id | Role-to-permission mapping; platform-governed. |

Ownership and lifecycle:

- `owner_user_id` identifies owner-of-record where applicable.
- Membership/role assignment does not equal ownership.
- Account lifecycle states must not delete owned records automatically.
- Suspended users must not imply deleted profiles.
- Access boundaries must be role/permission based, but no authorization middleware is implemented here.

## 5. Business & Organization ERD

Business relationship model:

```text
Organizations
↓
Organization Members
↓
Business Profiles
↓
Services
```

### Business Tables

| Table | Primary key | Relationships (`relationships`) | Cardinality |
| --- | --- | --- | --- |
| organizations | organization_id | owner_user_id, headquarters_location_id | One organization has many members, branches, profiles, supplier capabilities. |
| organization_members | organization_member_id | organization_id, user_id, role_id | Many-to-many between users and organizations. |
| business_profiles | business_profile_id | profile_id, organization_id, owner_user_id | One profile to zero/one business profile; organization to many business profiles. |
| supplier_capabilities | supplier_capability_id | organization_id or business_profile_id | One organization/business may have zero/many supplier capability records. |
| provider_services | provider_service_id | provider_entity_type, provider_entity_id, service_id | Many-to-many provider-to-service bridge. |
| business_locations | business_location_id | business_profile_id, location_id | One business profile can have multiple physical/branch locations. |

Roles in business/organization context:

- owners control governance and ownership references.
- members are organization-linked users.
- managers receive scoped role assignments.
- representatives act through representative assignments only.

Prevention rules:

- Prevent duplicate ownership by requiring one owner-of-record per active owned entity.
- Prevent invalid membership by requiring valid user, organization, role, status, and lifecycle state.
- Prevent role conflicts by disallowing representative/member records from overwriting ownership fields.

## 6. Professional Profile ERD

Professional profile relationships:

```text
users
↓
profiles
↓
professional_profiles
↓
provider_services
↓
services / categories
↓
locations
↓
trust_records
```

Professional examples supported:

- Doctor.
- Engineer.
- Lawyer.
- Consultant.

### Professional Tables

| Table | Primary key | Relationships (`relationships`) | Cardinality |
| --- | --- | --- | --- |
| professional_profiles | professional_profile_id | profile_id, owner_user_id, trust_record_id | One profile to zero/one professional profile. |
| provider_services | provider_service_id | professional_profile_id or provider_entity_id, service_id | One professional can reference many services. |
| professional_locations | professional_location_id | professional_profile_id, location_id | One professional can have many public/coverage-safe locations. |
| trust_records | trust_record_id | entity_type, entity_id | One active trust record per professional entity. |

Professional ERD decisions:

- Professional identity is separate from business identity.
- A doctor, engineer, lawyer, or consultant may be an individual professional or organization member.
- Professional verification evidence must remain separate from public profile fields.
- Professional duplicate prevention must use owner, profession, credential, contact, and location signals without exposing private evidence.

## 7. Service Catalog ERD

Service catalog relationship:

```text
Categories
↓
Subcategories
↓
Services
↓
Workflow Types
```

### Service Tables

| Table | Primary key | Relationships (`relationships`) | Cardinality |
| --- | --- | --- | --- |
| categories | category_id | business_type_id | One business type to many categories. |
| subcategories | subcategory_id | category_id | One category to many subcategories. |
| services | service_id | category_id, subcategory_id, workflow_type_id | One subcategory to many services. |
| workflow_types | workflow_type_id | none | One workflow type can classify many services. |
| provider_services | provider_service_id | service_id, provider_entity_type, provider_entity_id | Many-to-many bridge from providers to catalog services. |

Service ownership, visibility, and status:

- Catalog records are platform-governed.
- Provider-service records are provider/entity relationship records, not catalog ownership.
- Active catalog records may be public in discovery.
- Inactive/deprecated records remain internal or future-only.
- No ordering, marketplace, price, cart, checkout, payment, commission, or delivery references are included.

## 8. Location ERD

Location relationship:

```text
Countries
↓
Cities
↓
Areas
↓
Service Coverage
```

### Location Tables

| Table | Primary key | Relationships (`relationships`) | Cardinality |
| --- | --- | --- | --- |
| countries | country_id | none | One country has many cities. |
| cities | city_id | country_id | One city belongs to one country and has many areas. |
| areas | area_id | city_id | One area belongs to one city and may be used for locations/coverage. |
| locations | location_id | country_id, city_id, area_id | Governed location reference. |
| business_locations | business_location_id | business_profile_id, location_id | Business physical or branch locations. |
| professional_locations | professional_location_id | professional_profile_id, location_id | Professional location/coverage-safe records. |
| service_coverages | service_coverage_id | provider_service_id, location_id | Service coverage locations. |
| partner_coverages | partner_coverage_id | partner_id, location_id | Partner regional/area coverage. |

Separation rules:

- business location = physical or branch record.
- branch location = business/organization child location.
- professional location = professional public/coverage-safe location.
- coverage location = service/provider operating area.
- partner coverage = partner relationship territory, not physical address.

## 9. Trust & Verification ERD

Trust Records
Verification Records
Audit References

Trust and verification tables:

- trust_records.
- verification_records.
- audit_records.

Trust ERD:

```text
eligible entity
↓
trust_records
↓
verification_records
↓
audit_records
```

### Trust Tables

| Table | Primary key | Required references | Decision fields |
| --- | --- | --- | --- |
| trust_records | trust_record_id | entity_type, entity_id | verification_status, trust_level, public_indicator, status, timestamps. |
| verification_records | verification_record_id | trust_record_id, reviewed_by_user_id, audit_record_id | decision, decision_reason, reviewed_at, evidence_visibility_class. |
| audit_records | audit_record_id | actor_user_id, entity_type, entity_id | action, previous_state, new_state, reason, occurred_at. |

Prevention rules:

- Prevent self verification by requiring reviewer and entity owner separation.
- Prevent trust manipulation by excluding owner/representative/member direct edits to trust decision fields.
- Private verification evidence must not be exposed in public profile, discovery, sharing, or analytics surfaces.

## 10. Partner & Representative ERD

Partner and representative relationship:

```text
Partners
↓
Representative Assignments
↓
Coverage Areas
↓
Organizations / Businesses
```

### Partner and Representative Tables

| Table | Primary key | Relationships (`relationships`) | Lifecycle/scope |
| --- | --- | --- | --- |
| partners | partner_id | profile_id, organization_id, trust_record_id | status, partner_type, lifecycle_state. |
| partner_relationships | partner_relationship_id | partner_id, related_entity_type, related_entity_id | relationship_type, scope, status, starts_at, ends_at. |
| partner_coverages | partner_coverage_id | partner_id, location_id | coverage status and timestamps. |
| representative_assignments | representative_assignment_id | representative_profile_id, represented_entity_type, represented_entity_id | scope_type, scope_id, status, starts_at, ends_at. |
| representative_coverages | representative_coverage_id | representative_assignment_id, location_id | scoped coverage and lifecycle. |

Scope and lifecycle:

- Partner coverage does not imply ownership.
- Representative assignment does not imply ownership.
- Representatives cannot change trust, verification, ownership, or platform governance fields.
- Assignment status must support pending, active, suspended, ended, and archived.

## 11. Audit ERD

Audit records include:

- actor reference.
- action.
- entity reference.
- old value reference.
- new value reference.
- timestamp.
- reason.

Audit table contract:

| Column | Purpose |
| --- | --- |
| audit_record_id | Primary key. |
| actor_user_id | User who performed the action when available. |
| actor_type | User, platform, system-future, or governance actor type. |
| action | Stable audit action name. |
| entity_type | Entity type affected. |
| entity_id | Entity identifier affected. |
| previous_state | Safe snapshot/reference of old state. |
| new_state | Safe snapshot/reference of new state. |
| reason | Required reason for sensitive actions. |
| occurred_at | Timestamp of action. |
| request_context_id | Optional future request context reference. |

Audit ERD rules:

- Audit records are internal operational data.
- Sensitive lifecycle, ownership, permission, trust, verification, and official profile changes require audit references.
- Audit snapshots must not leak secrets, credentials, private verification evidence, or production values.

## 12. Database Integrity Rules

### Unique Constraints (`unique constraints`)

- users.normalized_email should be unique when present.
- users.normalized_phone should be unique when present and verified.
- profiles.public_slug should be unique within active profile namespace.
- categories.slug, subcategories.slug, services.slug, and workflow_types.slug should be unique within catalog scope.
- organization_members should be unique by organization_id + user_id + active role scope.
- representative_assignments should prevent duplicate active assignment for same representative, entity, and scope.
- partner_coverages should prevent duplicate active coverage for same partner and location.

### Relationship Constraints (`relationship constraints`)

- Foreign-key-style references must point to existing active or allowed lifecycle records.
- organization_members require valid organization, user, and role references.
- provider_services require valid provider entity and service references.
- trust_records require a valid entity_type and entity_id pair.
- audit_records require actor/action/entity fields for sensitive actions.

### Deletion Rules (`deletion rules`)

- Prefer soft deletion or archival for user/profile/business/organization/trust/audit data.
- Audit records should not be hard-deleted during normal operations.
- Catalog records should be deprecated/inactive rather than deleted if referenced.
- Location records should be deactivated only with reference-impact review.

### Update Rules (`update rules`)

- Ownership changes require audit and permission validation.
- Trust/verification updates require reviewer authority and audit reference.
- Role/permission changes require audit reference.
- Public profile changes require validation and may require audit depending on sensitivity.

### Status Transition Rules (`status transition rules`)

- Status fields must use governed allowed values.
- Lifecycle transitions must follow created → pending → active → suspended → archived patterns where applicable.
- Invalid state transitions must be rejected by future validation rules.

## 13. Indexing Relationship Review

Index principles:

| Index area | Future index targets |
| --- | --- |
| Unique identifiers (`unique identifiers`) | Primary keys, slugs, normalized email, normalized phone, scoped active relationships. |
| Relationships (`relationships`) | owner_user_id, profile_id, organization_id, business_profile_id, professional_profile_id, service_id, role_id, permission_id. |
| Locations (`locations`) | country_id, city_id, area_id, location_id, service_coverage_id, partner_coverage_id. |
| Statuses (`statuses`) | status, lifecycle_state, verification_status, trust_level, relationship_status, archived_at. |
| Search foundations (`search foundations`) | public_name, arabic_name, category_id, subcategory_id, service_id, location_id, public_slug. |

Do not create ranking indexes, advertising indexes, paid visibility indexes, social graph indexes, AI tracking indexes, or marketplace transaction indexes.

## 14. Migration Risk Review

| Risk | Analysis | Prevention |
| --- | --- | --- |
| Future schema changes (`future schema changes`) | New entity types and sectors may require extra fields. | Use canonical base tables and extension/capability tables. |
| Entity expansion (`entity expansion`) | Supplier, partner, representative, and platform-owned organization may evolve. | Keep each role distinct and relationship-scoped. |
| Multi-region support (`multi-region support`) | Country/city/area growth may require seed updates and localization. | Use governed location tables and no free-text dependency. |
| Data migration risks (`data migration risks`) | Ambiguous names or flattened tables can force breaking migrations. | Freeze table naming, relationship tables, and status fields before migrations. |
| Trust/audit growth | Verification and audit records may grow quickly. | Use indexed append-only audit and separate public trust indicators from private evidence. |
| Official profile seed risk | Platform-owned organization may need special creation rules. | Define seed/governance process before implementation. |

## 15. KILL CRITICAL Database Audit

Prevented database drift:

- No marketplace tables.
- No payment tables.
- No commission tables.
- No advertising tables.
- No social graph tables.
- No AI tracking tables.
- No unnecessary personal tracking.
- No ranking indexes.
- No hidden promotion structures.
- No delivery marketplace tables.

Critical decision: the ERD contract supports identity, profiles, organizations, services, locations, trust, relationships, and audit only. It does not support transaction, payment, ad, social, AI, or marketplace runtime domains.

## 16. ERD Decisions

1. Use explicit table names for profiles, professional profiles, business profiles, organizations, partners, representatives, services, locations, trust, and audit.
2. Use relationship tables for memberships, provider services, partner relationships, representative assignments, and coverage.
3. Use primary keys named as singular entity plus `_id`.
4. Use foreign keys named after referenced entities or owner scope.
5. Use timestamps consistently: `created_at`, `updated_at`, `archived_at`, `starts_at`, `ends_at`, `reviewed_at`, and `occurred_at`.
6. Use status and lifecycle fields consistently.
7. Keep audit records internal and append-only where possible.
8. Keep discovery indexes separate from ranking or advertising.

## 17. Remaining Risks

- Final decision needed between `users` and `user_accounts` as implementation table name.
- Final decision needed for `supplier_capabilities` versus `suppliers` table strategy.
- Official platform-owned organization may be a table or an `organizations.is_platform_owned` flag.
- Exact audit snapshot storage format still needs a payload contract.
- Location seed governance still needs operational approval.
- Future migrations must preserve Arabic-first fields and RTL-safe public labels.

## 18. Database Readiness Score

Database ERD and table naming readiness score after Mission 045: **95 / 100**.

Rationale: table naming conventions, ERD relationships, cardinality, ownership references, lifecycle fields, audit references, integrity rules, index strategy, migration risks, and kill-critical exclusions are now documented. Remaining readiness depends on final table-name selections, supplier strategy, platform-owned organization representation, audit payload format, and location seed governance.

## 19. Recommended Next Mission

Recommended next mission: **Mission 046 — Database Field Dictionary, Constraints & Seed Data Boundary Contract**.

Purpose: define field-by-field dictionary, allowed values, constraints, seed data boundaries, and audit payload shapes without creating database tables, migrations, or runtime code.
