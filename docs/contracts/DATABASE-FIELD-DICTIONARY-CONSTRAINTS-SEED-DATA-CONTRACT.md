# Database Field Dictionary, Constraints & Seed Data Boundary Contract

## Mission Boundary

This contract is documentation and architecture preparation only. It does not implement database tables, collections, migrations, database connections, seed scripts, APIs, backend code, frontend code, UI screens, authentication, authorization middleware, or production infrastructure.

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

## 2. Field Dictionary Principles

Official field dictionary rules:

| Principle | Contract |
| --- | --- |
| Field naming (`field naming`) | Use lowercase snake_case and keep names explicit, such as `owner_user_id`, `profile_type`, and `verification_status`. |
| Data types (`data types`) | Use documented logical types before implementation: uuid, text, normalized_text, enum, boolean, timestamp, json_internal, and reference_id. |
| Nullable rules (`nullable rules`) | Required identity, ownership, status, lifecycle, and relationship references should be non-null unless a pending lifecycle state explicitly allows null. |
| Default values (`default values`) | Defaults must be safe, explicit, and non-promotional, such as `status = pending` or `is_platform_owned = false`. |
| Required fields (`required fields`) | Required fields must be defined per entity before migrations. |
| Visibility classification (`visibility classification`) | Every field must be classified as public, private, or internal. |
| Ownership | Every owned entity must identify owner-of-record, managing organization, or platform governance owner. |
| Edit permissions (`edit permissions`) | Sensitive fields must reference roles/permissions before implementation. |
| Audit requirements | Ownership, trust, verification, lifecycle, permission, and public identity changes require audit compatibility. |

Visibility classes:

- Public: safe for discovery, public profiles, and sharing.
- Private: protected account, contact, credential, or owner data.
- Internal: platform operational, audit, moderation, duplicate detection, or verification evidence data.

## 3. User Account Field Dictionary — `users`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| user_id | uuid | Yes | Internal | Unique primary identifier. | Platform identity system. |
| display_name | text | Optional | Public/private depending profile exposure | Length and safe text validation. | User. |
| normalized_email | normalized_text | Optional | Private | Unique when present; email format; never public by default. | User. |
| normalized_phone | normalized_text | Optional | Private | Unique when verified; phone format; never public by default. | User. |
| account_status | enum | Yes | Internal | Allowed values: created, pending, active, suspended, archived. | Platform governance. |
| lifecycle_state | enum | Yes | Internal | Must follow allowed lifecycle transitions. | Platform governance. |
| locale | enum/text | Optional | Private | Prefer Arabic-first defaults when absent. | User. |
| created_at | timestamp | Yes | Internal | Set at creation. | System future. |
| updated_at | timestamp | Yes | Internal | Updated on changes. | System future. |
| archived_at | timestamp | Optional | Internal | Required when archived. | Platform governance. |

Security boundaries:

- No plaintext passwords in this contract.
- No tokens or credentials in public records.
- Contact references are private.
- Account status changes require audit compatibility.

## 4. Profile Field Dictionary — `profiles`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| profile_id | uuid | Yes | Internal | Unique primary identifier. | Owner-of-record. |
| owner_user_id | reference_id | Conditional | Internal | Required for user-owned profiles. | User/platform governance. |
| profile_type | enum | Yes | Public/internal | Allowed values: individual, professional, business, organization, partner, representative, platform_owned. | Platform taxonomy governance. |
| public_name | text | Yes | Public | Required for public profiles; normalized for duplicate checks. | Profile owner/manager. |
| arabic_name | text | Optional | Public | Arabic-first preferred; safe text validation. | Profile owner/manager. |
| short_description | text | Optional | Public | Length, safety, and content validation. | Profile owner/manager. |
| public_slug | normalized_text | Optional | Public | Unique in active namespace. | Platform/profile owner. |
| status | enum | Yes | Public/internal | draft, pending, active, suspended, archived. | Platform/profile governance. |
| visibility_class | enum | Yes | Internal | public, private, internal. | Platform governance. |
| created_at | timestamp | Yes | Internal | Set at creation. | System future. |
| updated_at | timestamp | Yes | Internal | Updated on changes. | System future. |

## 5. Professional Profile Fields — `professional_profiles`

Supports Doctor, Engineer, Lawyer, Consultant, Freelancer, and Technical specialists.

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| professional_profile_id | uuid | Yes | Internal | Unique primary identifier. | Professional owner/platform governance. |
| profile_id | reference_id | Yes | Internal | Must reference valid profile. | Professional owner. |
| owner_user_id | reference_id | Yes | Internal | Must reference owner user unless organization-managed exception exists. | Professional owner. |
| profession | enum/reference_id | Yes | Public | Must match approved taxonomy. | Professional owner/platform taxonomy. |
| specialty | enum/reference_id/text | Optional | Public | Must be valid for profession when governed. | Professional owner. |
| qualifications_summary | text | Optional | Public/private depending evidence | Public summary only; private evidence stored elsewhere. | Professional owner. |
| experience_summary | text | Optional | Public | Safe text validation. | Professional owner. |
| service_refs | reference list | Optional | Public | Must reference active services/provider_services. | Professional owner/manager. |
| location_refs | reference list | Optional | Public | Must reference governed locations/coverage. | Professional owner/manager. |
| trust_record_id | reference_id | Optional | Public/internal | Trust record is not self-editable. | Platform trust governance. |
| status | enum | Yes | Public/internal | pending, active, suspended, archived. | Platform/profile governance. |

## 6. Business Profile Fields — `business_profiles`

Supports Restaurants, Shops, Workshops, Service businesses, and Retail businesses.

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| business_profile_id | uuid | Yes | Internal | Unique primary identifier. | Owner-of-record. |
| profile_id | reference_id | Yes | Internal | Must reference valid profile. | Owner-of-record. |
| owner_user_id | reference_id | Conditional | Internal | Required unless owned by organization. | Owner-of-record. |
| organization_id | reference_id | Optional | Internal/public relationship | Must reference valid organization if present. | Organization governance. |
| business_name | text | Yes | Public | Required; normalized for duplicate prevention. | Owner/manager. |
| category_id | reference_id | Yes | Public | Must reference approved category. | Owner/manager/platform taxonomy. |
| service_refs | reference list | Optional | Public | Must reference service catalog/provider_services. | Owner/manager. |
| location_refs | reference list | Optional | Public | Physical/branch/coverage must be separated. | Owner/manager. |
| public_contact_ref | reference_id | Optional | Public/private boundary | Public-safe contact only; private contact separate. | Owner/manager. |
| media_refs | reference list | Optional | Public | Media safety and ownership validation. | Owner/manager. |
| trust_record_id | reference_id | Optional | Public/internal | Trust record protected from self-edit. | Platform trust governance. |
| lifecycle_status | enum | Yes | Public/internal | pending, active, suspended, archived. | Platform/profile governance. |

## 7. Organization & Supplier Fields

### `organizations`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| organization_id | uuid | Yes | Internal | Unique primary identifier. | Organization owner/platform governance. |
| owner_user_id | reference_id | Yes | Internal | Required owner-of-record. | Organization owner. |
| organization_type | enum | Yes | Public/internal | company, factory, hospital, school, platform_owned, other governed types. | Platform taxonomy governance. |
| public_name | text | Yes | Public | Required; duplicate prevention normalization. | Organization owner/manager. |
| arabic_name | text | Optional | Public | Arabic-first preferred. | Organization owner/manager. |
| headquarters_location_id | reference_id | Optional | Public/internal | Must reference governed location. | Organization owner/manager. |
| branch_refs | reference list | Optional | Public/internal | Branches must be location relationships. | Organization manager. |
| member_refs | reference list | Optional | Internal | Members through organization_members only. | Organization owner/admin. |
| is_platform_owned | boolean | Yes | Internal/public indicator | Default false; true only for official platform entity. | Platform governance. |
| status | enum | Yes | Public/internal | pending, active, suspended, archived. | Organization governance. |

### `suppliers` / `supplier_capabilities`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| supplier_id or supplier_capability_id | uuid | Yes | Internal | Unique primary identifier. | Linked owner entity. |
| organization_id | reference_id | Conditional | Internal/public relationship | Required if supplier is organization-owned. | Organization owner. |
| business_profile_id | reference_id | Conditional | Internal/public relationship | Required if supplier is business-owned. | Business owner. |
| supplier_type | enum/reference_id | Yes | Public | Food, building material, manufacturing, wholesale, or governed type. | Owner/platform taxonomy. |
| coverage_refs | reference list | Optional | Public | Must reference governed coverage locations. | Owner/manager. |
| relationship_refs | reference list | Optional | Internal | Partners/representatives through relationship tables. | Owner/manager. |
| status | enum | Yes | Public/internal | pending, active, suspended, archived. | Owner/platform governance. |

Supplier boundaries:

- No inventory systems.
- No purchasing systems.
- No transaction models.
- No pricing, carts, orders, payments, or commissions.

## 8. Service Catalog Fields

### `categories`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| category_id | uuid | Yes | Public/internal | Unique primary identifier. | Platform taxonomy governance. |
| business_type | enum/reference_id | Yes | Public | Must match approved business type. | Platform taxonomy governance. |
| name_ar | text | Yes | Public | Arabic-first label required. | Platform taxonomy governance. |
| name_en | text | Optional | Public | Optional secondary label. | Platform taxonomy governance. |
| slug | normalized_text | Yes | Public | Unique within category namespace. | Platform taxonomy governance. |
| description | text | Optional | Public | Safe text. | Platform taxonomy governance. |
| status | enum | Yes | Public/internal | draft, active, inactive, deprecated. | Platform taxonomy governance. |

### `subcategories`, `services`, and `workflow_types`

| Field | Applies to | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| subcategory_id | subcategories | uuid | Yes | Public/internal | Unique primary identifier. | Platform taxonomy governance. |
| service_id | services | uuid | Yes | Public/internal | Unique primary identifier. | Platform taxonomy governance. |
| workflow_type_id | workflow_types | uuid | Yes | Public/internal | Unique primary identifier. | Platform taxonomy governance. |
| category_id | subcategories/services | reference_id | Yes | Public/internal | Must reference active category where applicable. | Platform taxonomy governance. |
| subcategory_id | services | reference_id | Conditional | Public/internal | Must reference valid subcategory when applicable. | Platform taxonomy governance. |
| name_ar | all | text | Yes | Public | Arabic-first label required. | Platform taxonomy governance. |
| slug | all | normalized_text | Yes | Public | Unique within scope. | Platform taxonomy governance. |
| status | all | enum | Yes | Public/internal | draft, active, inactive, deprecated. | Platform taxonomy governance. |

## 9. Location Fields

| Field | Applies to | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| country_id | countries | uuid | Yes | Public/internal | Unique primary identifier. | Platform location governance. |
| city_id | cities | uuid | Yes | Public/internal | Unique primary identifier. | Platform location governance. |
| area_id | areas | uuid | Yes | Public/internal | Unique primary identifier. | Platform location governance. |
| service_coverage_id | service_coverages | uuid | Yes | Internal/public relationship | Unique primary identifier. | Provider/relationship owner. |
| country_id | cities/areas/locations | reference_id | Conditional | Public/internal | Must follow country → city → area hierarchy. | Platform location governance. |
| city_id | areas/locations | reference_id | Conditional | Public/internal | City must belong to country. | Platform location governance. |
| area_id | locations/coverages | reference_id | Optional | Public/internal | Area must belong to city. | Platform location governance. |
| public_label_ar | all | text | Yes | Public | Arabic-first location label. | Platform location governance. |
| status | all | enum | Yes | Public/internal | active, inactive, deprecated. | Platform location governance. |

## 10. Trust & Verification Fields

### `trust_records`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| trust_record_id | uuid | Yes | Internal | Unique primary identifier. | Platform trust governance. |
| entity_type | enum | Yes | Internal | Must be eligible trust entity. | Platform trust governance. |
| entity_id | reference_id | Yes | Internal | Must reference eligible entity. | Platform trust governance. |
| trust_level | enum | Yes | Public/internal | Basic, verified, official, suspended, or governed values. | Platform trust governance. |
| verification_status | enum | Yes | Public/internal | unverified, pending, verified, rejected, suspended. | Platform trust governance. |
| public_indicator | text/enum | Optional | Public | Safe public trust label only. | Platform trust governance. |
| reviewed_at | timestamp | Optional | Internal | Required for reviewed decisions. | Platform trust governance. |

### `verification_records`

| Field | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- |
| verification_record_id | uuid | Yes | Internal | Unique primary identifier. | Platform trust governance. |
| trust_record_id | reference_id | Yes | Internal | Must reference trust record. | Platform trust governance. |
| reviewed_by_user_id | reference_id | Conditional | Internal | Reviewer cannot be same as self-verifying owner. | Platform trust governance. |
| decision | enum | Yes | Internal | approved, rejected, needs_review, suspended. | Platform trust governance. |
| decision_reason | text | Conditional | Internal | Required for rejection/suspension. | Platform trust governance. |
| audit_record_id | reference_id | Yes | Internal | Sensitive decision must be auditable. | Platform trust governance. |

Prevention rules:

- No self approval.
- No trust manipulation.
- No public private-evidence exposure.
- No paid badge, ranking, or advertising side effect.

## 11. Relationship Fields

| Field | Applies to | Type | Required | Visibility | Validation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| organization_member_id | organization_members | uuid | Yes | Internal | Unique primary identifier. | Organization governance. |
| partner_relationship_id | partner_relationships | uuid | Yes | Internal | Unique primary identifier. | Partner/organization governance. |
| representative_assignment_id | representative_assignments | uuid | Yes | Internal | Unique primary identifier. | Represented entity governance. |
| source_entity_type | relationships | enum | Yes | Internal | Must be allowed source entity. | Relationship owner. |
| source_entity_id | relationships | reference_id | Yes | Internal | Must reference source entity. | Relationship owner. |
| target_entity_type | relationships | enum | Yes | Internal | Must be allowed target entity. | Relationship owner. |
| target_entity_id | relationships | reference_id | Yes | Internal | Must reference target entity. | Relationship owner. |
| relationship_type | relationships | enum | Yes | Public/internal | member, partner, representative, coverage, provider_service. | Platform governance. |
| scope | relationships | enum/json_internal | Optional | Internal | Must not exceed assigned authority. | Relationship owner. |
| status | relationships | enum | Yes | Public/internal | pending, active, suspended, ended, archived. | Relationship owner/governance. |
| starts_at | relationships | timestamp | Optional | Internal | Start time for scoped role. | Relationship owner. |
| ends_at | relationships | timestamp | Optional | Internal | Required when ended. | Relationship owner. |

## 12. Constraint Rules

### Unique Constraints

- users.normalized_email unique when present.
- users.normalized_phone unique when verified.
- profiles.public_slug unique within active namespace.
- categories.slug, subcategories.slug, services.slug, and workflow_types.slug unique within catalog scope.
- organization_members unique for active organization_id + user_id + role/scope.
- representative_assignments unique for active representative + represented entity + scope.
- partner_relationships unique for active partner + entity + relationship_type + scope.

### Foreign Key Rules

- profile_id references profiles.
- owner_user_id references users.
- organization_id references organizations.
- category_id references categories.
- service_id references services.
- location references must follow countries → cities → areas hierarchy.
- trust entity references must match entity_type.

### Required Relationships

- business_profiles require profile_id and either owner_user_id or organization_id.
- professional_profiles require profile_id and owner_user_id unless organization-managed governance allows otherwise.
- organization_members require organization_id, user_id, role_id, and status.
- provider_services require provider entity reference and service_id.
- verification_records require trust_record_id and audit_record_id.

### Status Constraints

- Status values must come from governed enums.
- Suspended and archived records must not behave as active discovery records.
- Ended representative/partner scopes must not grant authority.

### Deletion Rules

- Prefer archive/soft delete for owned entities.
- Do not hard-delete audit records during normal operations.
- Do not delete referenced taxonomy or location records without impact review.

### Update Rules

- Ownership changes require audit.
- Verification/trust changes require audit and reviewer authority.
- Public identity changes require validation and may require audit.
- Relationship scope changes require audit.

## 13. Seed Data Boundary Contract

Allowed future seed/reference data:

| Seed category | Allowed examples | Boundary |
| --- | --- | --- |
| System roles (`system roles`) | Owner, Admin, Manager, Representative, Member, Worker. | Role catalog only; no fake users. |
| Permissions | Manage profile, manage services, manage members, represent entity, view internal audit future-only. | Permission catalog only; no auth implementation. |
| Service categories (`service categories`) | Healthcare, Food, Technology, Construction, Transport, Education, Tourism, Real Estate. | Reference catalog only; no providers or orders. |
| Workflow types (`workflow types`) | Instant Service, Appointment Service, Project Service, Supply Service, Transport Service. | Classification only; no workflow engine. |
| Locations (`locations`) | Countries, cities, areas as governed public references. | Reference data only; no private addresses. |
| Trust levels | Basic Profile, Verified Business, Verified Professional, Verified Partner, Official Platform Verification. | Public indicators only; no fake trust scores. |

Seed data must prevent:

- Fake users.
- Fake businesses.
- Fake ratings.
- Fake trust scores.
- Fake verification evidence.
- Production-like demo data.
- Private addresses, credentials, tokens, or production values.

## 14. Data Quality & Duplicate Prevention

Compatible with Mission 042 duplicate and error diagnosis principles.

Duplicate rules:

- Duplicate users: detect by normalized email, verified phone, and private identity signals without exposing private matches.
- Duplicate businesses: detect by normalized business name, owner, category, location, contact reference, and verification status.
- Duplicate professionals: detect by owner, profession, credential indicators, contact reference, specialty, and location.
- Duplicate services: prevent duplicate service slugs within category/subcategory/workflow scope.

Data quality rules:

- Normalize Arabic and optional secondary-language names for matching while preserving display labels.
- Use governed category/service/location references instead of free-text dependency.
- Store duplicate review evidence as internal data only.
- Return safe user-facing duplicate errors without exposing private owner/contact/credential data.

## 15. KILL CRITICAL Database Review

This contract verifies prevention of:

- Payment fields.
- Commission fields.
- Advertising fields.
- Ranking fields.
- Social activity fields.
- Unnecessary tracking fields.
- Marketplace inventory fields.
- Order/cart/checkout fields.
- AI recommendation or matching fields.
- Production secrets, credentials, tokens, or production values.

Critical database decision: fields support identity, profiles, organizations, suppliers, services, locations, trust, relationships, audit, constraints, and reference data only. They do not support payments, commissions, ads, rankings, social networking, AI, marketplace, ordering, or unnecessary personal tracking.

## 16. Field Dictionary Decisions

1. Every field must declare name, type, required flag, visibility, validation, and owner before implementation.
2. Public/private/internal visibility must be encoded at design time.
3. Owner and governance responsibilities must be explicit for every mutable entity.
4. Trust, verification, ownership, lifecycle, and relationship scope fields require audit compatibility.
5. Seed data is limited to reference data and must not include fake users, fake businesses, fake ratings, fake trust, or production-like demo records.
6. Duplicate prevention depends on normalized fields, scoped uniqueness, and safe internal review evidence.

## 17. Resolved Risks

- Field-level visibility is now documented before migrations.
- Seed data boundaries prevent demo/production-like data drift.
- Supplier fields are explicitly non-transactional.
- Trust and verification fields prevent self approval and manipulation.
- Relationship fields separate source, target, type, scope, status, and timestamps.
- Constraints clarify uniqueness, required relationships, lifecycle status, deletion, and update rules.

## 18. Remaining Risks

- Exact physical data types still need implementation-specific mapping.
- Enum allowed values need final code/table representation before migrations.
- Audit payload snapshot format remains a future schema detail.
- Location seed data requires governance approval.
- Supplier table versus supplier_capabilities remains an implementation decision.
- Official platform-owned organization seed process still needs operational governance.

## 19. Readiness Score Update

Database field dictionary readiness score after Mission 046: **96 / 100**.

Rationale: entity fields, constraints, visibility classes, seed data boundaries, duplicate prevention, and kill-critical field exclusions are now documented. Remaining readiness depends on physical type mapping, enum storage strategy, audit payload format, governed location seed data, supplier representation, and official platform seed governance.

## 20. Recommended Next Mission

Recommended next mission: **Mission 047 — Physical Database Schema Review & Migration Safety Contract**.

Purpose: review physical schema translation, enum representation, migration ordering, rollback safety, seed governance, and audit payload structure without creating migrations, database tables, seed scripts, or production database connections.
