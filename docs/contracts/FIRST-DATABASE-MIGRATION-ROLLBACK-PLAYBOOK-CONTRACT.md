# First Database Migration Plan & Rollback Playbook Contract

## Mission Boundary

This contract is documentation and architecture preparation only. It does not implement database migrations, database tables, database collections, ORM models, database connections, deployment scripts, APIs, backend code, frontend code, UI screens, authentication, authorization middleware, or production infrastructure.

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

## 2. Migration Strategy Principles

Compatibility baseline:

- Mission 043 Architecture Freeze.
- Mission 044 Database Architecture Design.
- Mission 045 ERD Table Naming Contract.
- Mission 046 Field Dictionary Contract.
- Mission 047 Physical Schema Review & Migration Safety Contract.

### Migration Versioning Rules (`migration versioning rules`)

- Use ordered numeric prefixes such as `001_`, `002_`, and `003_`.
- Each future migration must have a unique immutable version identifier.
- Never rewrite an already-applied migration in shared environments.
- Record migration version, checksum/fingerprint future-only, applied timestamp, actor, purpose, result, and rollback information.

### Migration Naming Conventions (`migration naming conventions`)

- Use lowercase snake_case names.
- Use descriptive names such as `001_create_core_reference_foundation`.
- Avoid vague names such as `001_init` when the scope is broad.
- Names must not imply marketplace, payment, advertising, ranking, social, AI, or production infrastructure scope.

### Migration Ordering Principles (`migration ordering principles`)

- Create independent reference/system tables before dependent entity tables.
- Create audit foundation early enough to support future sensitive changes.
- Create identity tables before profile and relationship tables.
- Create taxonomy/location references before provider service/location relationships.
- Create trust/verification after eligible entity tables exist.

### Backward Compatibility Principles (`backward compatibility principles`)

- Prefer additive changes.
- Avoid destructive changes in the first migration.
- Do not rename/drop fields without a future compatibility window.
- Seed/reference data must be idempotent and safe to re-run in non-production contexts.

### Database Change Approval Rules

- Any migration must reference approved contracts before implementation.
- Any migration changing trust, verification, ownership, lifecycle, or audit fields requires architecture review.
- Any migration adding marketplace, payment, commission, advertising, ranking, social, AI, or tracking structures is rejected for V1.

## 3. Initial Database Creation Order

Future recommended creation order:

1. system configuration.
2. audit foundation.
3. users.
4. profiles.
5. roles and permissions.
6. organizations.
7. categories.
8. locations.
9. services.
10. business profiles.
11. relationships.
12. trust records.

### Dependency Explanation

| Order | Area | Dependency reason |
| --- | --- | --- |
| 1 | system configuration | Establishes governed enums/reference switches without domain data. |
| 2 | audit foundation | Enables future sensitive change tracking and migration audit records. |
| 3 | users | Identity anchor required for owners, actors, members, and reviewers. |
| 4 | profiles | Public identity layer depends on users for owner references. |
| 5 | roles and permissions | Access catalog needed before role_assignments and organization_members. |
| 6 | organizations | Organization ownership depends on users; memberships depend on roles. |
| 7 | categories | Service taxonomy foundation before services and provider services. |
| 8 | locations | Location reference foundation before business/professional/coverage records. |
| 9 | services | Services depend on categories and workflow types. |
| 10 | business profiles | Depend on profiles, organizations, categories, services, and locations. |
| 11 | relationships | Depend on users, profiles, organizations, services, and locations. |
| 12 | trust records | Depend on eligible entities and audit foundation. |

Creation order decision: references and audit come before dependent domain relationships; trust comes after eligible entities exist.

## 4. Dependency Analysis

Reviewed dependencies:

| Dependency | Direction | Risk |
| --- | --- | --- |
| users → profiles | Profile owner references user. | Low if users are created first. |
| users → audit | Audit actor may reference user. | Low if nullable/governance actor strategy exists. |
| profiles → professional/business profiles | Extensions require base profile. | Low. |
| roles/permissions → role_assignments | Assignments require catalog roles/permissions. | Low. |
| organizations → organization_members | Members require organization, user, role. | Low. |
| categories → services | Services require taxonomy references. | Low. |
| locations → coverage/location relationships | Coverage requires governed location references. | Low. |
| services → provider_services | Provider services require service catalog. | Low. |
| eligible entities → trust_records | Trust requires entity references. | Medium if polymorphic references are not validated. |
| audit_records → verification/trust changes | Verification decisions require audit references. | Medium if circular audit/trust insertion is not planned. |

Circular dependency risks (`circular dependency risks`):

- Trust records may need audit references, while audit records may reference trust changes.
- Profiles may reference trust records, while trust records reference profiles.
- Organizations may need owner users, while user onboarding may need organization context later.

Circular dependency prevention:

- Create base entities first, then attach trust records.
- Allow audit records to reference entity_type/entity_id without requiring inverse entity references.
- Avoid mandatory trust_record_id on profile creation; attach after entity exists.
- Keep organization membership separate from ownership.

## 5. First Migration Scope Definition

Migration 001 should include documentation-approved core foundation only:

- system configuration/reference enum foundation.
- audit foundation structure.
- users identity anchor.
- profiles base identity layer.
- roles and permissions catalogs.
- organization foundation.
- categories, subcategories, services, workflow type references.
- countries, cities, areas, and location reference foundation.
- relationship scaffolding for memberships/provider services/coverage where safe.
- trust_records and verification_records only after eligible entity references are available.

Migration 001 must not include:

- marketplace.
- payments.
- orders.
- commissions.
- advertising.
- social features.
- AI systems.
- delivery marketplace.
- inventory systems.
- tracking/surveillance tables.
- fake users, fake companies, fake ratings, or fake verification.

## 6. Rollback Playbook

### Rollback Triggers (`rollback triggers`)

- Migration fails to apply fully.
- Constraint creation fails.
- Seed/reference data fails validation.
- Relationship integrity checks fail.
- Unexpected destructive behavior is detected.
- V1 boundary violation appears in migration scope.

### Failure Detection (`failure detection`)

- Migration runner future-only reports failure.
- Schema validation detects missing or extra structures.
- Constraint validation fails.
- Rollback dry-run fails in testing/staging.
- Data integrity tests detect orphan or invalid references.

### Data Protection (`data protection`)

- Take backup before applying migration in any shared or production-like environment.
- Prefer transactional migrations where supported.
- Do not run destructive operations without backup and review.
- Preserve audit/history data.
- Do not delete user, business, trust, verification, or audit data during rollback without explicit governance.

### Backup Requirements (`backup requirements`)

- Backup schema state.
- Backup reference data state.
- Record migration version and actor.
- Store rollback instructions with the migration plan.

### Recovery Steps (`recovery steps`)

1. Stop further migration execution.
2. Record failure result and reason.
3. Restore from backup if transactional rollback is unavailable.
4. Re-run validation checks.
5. Confirm no partial forbidden structures were left behind.
6. Document remediation before retry.

### Audit Requirements (`audit requirements`)

- Record migration version.
- Record actor.
- Record timestamp.
- Record purpose.
- Record result.
- Record rollback information.
- Record remediation notes for failed migrations.

## 7. Data Safety Rules

Protection rules:

| Data area | Rule |
| --- | --- |
| user data | Never drop private user/contact fields without backup, compatibility period, and governance. |
| business data | Preserve ownership, profile identity, category, service, and location references. |
| verification data | Do not expose or delete private evidence during migration/rollback. |
| trust data | Trust records must not be self-edited or downgraded accidentally. |
| audit history | Audit records should be append-only and preserved during rollback. |

Prevent:

- accidental deletion.
- irreversible changes.
- data corruption.
- orphan records.
- private data exposure.
- trust/verification evidence loss.

## 8. Migration Testing Strategy

Future testing before applying migrations:

| Test type | Requirement |
| --- | --- |
| schema validation | Verify expected tables, columns, constraints, indexes, and reference structures exist. |
| relationship validation | Verify foreign-key/reference integrity and entity_type/entity_id rules. |
| constraint testing | Verify unique constraints, required relationships, and status enums. |
| rollback testing | Verify rollback or restore steps work in development/testing/staging before production. |
| data integrity testing | Verify no orphan records, invalid references, duplicate active relationships, or privacy leaks. |

Testing decision: no migration may be applied to production until schema, relationship, constraint, rollback, and data integrity checks pass in lower environments.

## 9. Environment Separation

Environment flow:

```text
Development
↓
Testing
↓
Staging
↓
Production
```

Environment rules:

- Development may validate structure quickly with disposable data.
- Testing must run automated schema, relationship, rollback, and seed validation.
- Staging must mirror production-like schema behavior without production secrets or private data copies unless governed.
- Production migrations require approved plan, backup, rollback playbook, and completed lower-environment validation.

Prevention: production changes must never be applied from unverified migrations.

## 10. Seed Data Migration Rules

Allowed seed/reference data:

- roles.
- permissions.
- categories.
- locations.
- workflow types.
- trust levels.

Seed rules:

- Seeds must be idempotent.
- Seeds must not create user/business activity.
- Seeds must not create fake trust or verification.
- Seeds must not include secrets, credentials, tokens, private addresses, or production values.

Prevent:

- fake users.
- fake companies.
- fake ratings.
- fake verification.
- production-like demo data.
- fake businesses.
- fake trust scores.

## 11. Audit & Compliance Review

Migration audit requirements:

Every future migration execution should record:

- migration version.
- actor.
- timestamp.
- purpose.
- result.
- rollback information.
- environment.
- checksum/fingerprint future-only.
- validation status.

Compliance decision: migration activity must be traceable, reproducible, and reviewable before production execution.

## 12. KILL CRITICAL Migration Review

Prevented migration drift:

- Accidental marketplace schema creation.
- Payment schema creation.
- Commission schema creation.
- Advertising schema creation.
- Tracking schema creation.
- Social graph schema creation.
- Unnecessary personal data storage.
- AI recommendation/matching schema creation.
- Delivery marketplace schema creation.
- Inventory/order/cart/checkout schema creation.

Critical rule: any migration containing prohibited V1 structures must be rejected before execution.

## 13. Backend Readiness Assessment

Database readiness status: **READY FOR BACKEND FOUNDATION PLANNING WITH CONDITIONS**.

Backend prerequisites:

- Final physical table names selected.
- Enum/reference strategy selected.
- Audit payload shape approved.
- Migration ordering documented.
- Rollback playbook approved.
- Seed governance approved.
- V1 boundary checks added to implementation review.

Unresolved decisions:

- users versus user_accounts final table name.
- suppliers versus supplier_capabilities strategy.
- platform-owned organization representation.
- audit snapshot storage format.
- migration transaction/rollback capabilities for selected database engine.

## 14. Migration Decisions

- Migration versions must be ordered, immutable, and descriptive.
- Migration 001 must be limited to core foundation/reference/entity structure.
- Additive and reversible migration planning is preferred.
- Rollback/restore strategy must exist before execution.
- Lower-environment validation is required before production.
- Seed data is limited to governed reference data.
- V1 prohibited domains are blocked from migration scope.

## 15. Risks

- First migration can become too large if all entities are included at once.
- Polymorphic entity references can be misused without validation.
- Trust/audit dependency ordering can create circular insertion pressure.
- Rollback may be limited by selected database engine capabilities.
- Seed data can drift into fake production/demo data without governance.

## 16. Readiness Score

Migration planning readiness score after Mission 048: **98 / 100**.

Rationale: migration ordering, dependency analysis, scope boundaries, rollback playbook, data safety, testing strategy, environment separation, seed rules, audit requirements, and kill-critical exclusions are now documented. Remaining readiness depends on final physical database engine behavior, table-name choices, enum/reference strategy, and audit payload format.

## 17. Recommended Next Mission

Recommended next mission: **Mission 049 — Backend Foundation Architecture Contract**.

Purpose: define backend module boundaries, service layering, repository patterns, validation boundaries, error handling, audit integration, and V1-safe API readiness without implementing backend code, APIs, database connections, or authentication middleware.
