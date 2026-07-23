# Database Architecture Design Contract

## Mission Boundary

This contract is documentation and architecture preparation only. It does not implement database models, migrations, database connections, APIs, backend code, frontend code, UI screens, authentication, authorization middleware, or production infrastructure.

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

## 2. Database Architecture Principles

This contract converts the Mission 043 architecture freeze into database design guidance without creating implementation artifacts.

### Design Principles

- Use explicit entity names that preserve canonical boundaries.
- Prefer stable identifiers over free text relationships.
- Keep platform-owned, organization-owned, business-owned, and user-owned data distinct.
- Separate public profile data from private account data and internal operational data.
- Treat trust, verification, permissions, lifecycle, and audit as protected records.
- Design relationships as explicit records with type, scope, status, timestamps, and audit compatibility.
- Avoid marketplace, ordering, payment, commission, advertising, ranking, social network, AI tracking, and unnecessary personal tracking tables.

### Naming Conventions

- Use lowercase snake_case for future tables, fields, indexes, and constraints.
- Use singular concept names in documentation and clear plural table names in future implementation decisions.
- Reserve explicit names for ambiguous concepts: `professional_profile`, `business_profile`, `organization_member`, `service_catalog_item`, `provider_service`, `location_reference`, `service_coverage`, `partner_coverage`, `representative_assignment`, `trust_record`, and `audit_record`.
- Do not reuse `profile` to mean business, organization, partner, or representative assignment.

### Entity Ownership Rules (`entity ownership rules`)

- User account owns authentication identity and may own or manage profile resources through roles.
- Business profile must have a clear owner-of-record.
- Organization ownership is separate from organization membership.
- Supplier may be modeled as a business/organization capability or subtype, but must not become a marketplace seller table.
- Partner and representative records are relationship/coverage constructs, not default ownership records.
- Platform-owned organization is a special official entity type with neutrality and audit safeguards.

### Relationship Principles (`relationship principles`)

- Relationships must have explicit source entity, target entity, relationship type, scope, status, timestamps, and audit compatibility.
- Membership does not imply ownership.
- Representation does not imply ownership.
- Partnership does not imply affiliate, commission, revenue-share, or marketplace seller behavior.
- Service ownership must distinguish catalog ownership from provider offering references.

### Indexing Principles (`indexing principles`)

- Index identifiers, owner references, foreign-key-style references, status fields, lifecycle states, location references, and search-friendly public labels.
- Unique constraints should protect normalized email/phone identity, duplicate profile prevention, category/service slugs, and relationship uniqueness where appropriate.
- Partial or scoped unique indexes should be considered for active records so archived records do not block legitimate re-registration decisions.
- Do not create ranking or advertising indexes.

### Privacy Principles (`privacy principles`)

- Public data supports discovery and sharing.
- Private data requires protection and should not appear in public queries.
- Internal operational data is platform-governance data and must not be exposed publicly.
- Private verification evidence, duplicate matching evidence, moderation notes, secrets, credentials, tokens, and production values must not be embedded in public records.

### Audit Principles (`audit principles`)

- Sensitive changes must be auditable.
- Audit records should capture actor, action, entity, previous state, new state, timestamp, and reason.
- Audit records should support future security review, lifecycle review, permission review, and verification review.
- Audit design must not expose private evidence in public surfaces.

Compatibility confirmation: this design contract is compatible with `docs/audits/MISSION-043-ARCHITECTURE-FREEZE-FINAL-CONSISTENCY-GATE-AUDIT.md`.

## 3. Core Entity Database Design

### User Accounts

- Purpose: authentication identity and account lifecycle anchor.
- Ownership: owned by the human/account subject; managed through future identity governance.
- Main fields: id, display_name, account_status, normalized_email_reference, normalized_phone_reference, locale, lifecycle_state, created_at, updated_at, archived_at.
- Relationships: user account to profile, role assignments, owned resources, audit records as actor.
- Visibility level: private by default; only safe display name/profile link may become public through profile records.
- Validation requirements: unique normalized contact references, lifecycle state validation, private data protection.

### Profiles

- Purpose: public/person-facing identity layer connected to user or entity contexts.
- Ownership: user-owned or organization-managed depending on profile type.
- Main fields: id, profile_type, public_name, arabic_name, short_description, public_slug, status, visibility_class, created_at, updated_at.
- Relationships: profile to user, professional_profile, business_profile, trust_record, locations, services.
- Visibility level: public-safe profile data plus private/internal extensions.
- Validation requirements: profile type required, public names normalized, slug uniqueness, status validation.

### Professional Profiles

- Purpose: individual professional identity for doctors, dentists, engineers, lawyers, consultants, freelancers, and technical specialists.
- Ownership: professional owner-of-record or organization-linked professional membership.
- Main fields: id, profile_id, profession, specialty, qualifications_summary, experience_summary, service_refs, location_refs, verification_status_ref, trust_record_ref, status.
- Relationships: profile, user account, organization member, services, locations, trust, audit.
- Visibility level: mostly public with private verification evidence stored separately.
- Validation requirements: valid profession taxonomy, specialty, owner/organization link, no duplicate active professional identity.

### Business Profiles

- Purpose: public business identity for restaurants, shops, workshops, salons, service businesses, and retail businesses.
- Ownership: owner-of-record user or owning organization.
- Main fields: id, profile_id, business_name, category_ref, description, service_refs, physical_location_ref, coverage_refs, public_contact_ref, media_refs, operating_info, trust_record_ref, status.
- Relationships: profile, owner, organization, services, locations, trust, audit.
- Visibility level: public profile fields with private owner/contact/admin data separated.
- Validation requirements: required owner, category, location strategy, duplicate business matching, public/private visibility separation.

### Organizations

- Purpose: larger entities such as factories, hospitals, schools, companies, and the platform-owned organization.
- Ownership: organization owner-of-record; members only through membership records.
- Main fields: id, organization_type, legal_or_public_name, arabic_name, description, headquarters_location_ref, branch_refs, status, lifecycle_state, platform_owned_flag.
- Relationships: members, roles, business profiles, supplier capability, services, branches, trust, audit.
- Visibility level: public organization profile fields plus internal membership/governance data.
- Validation requirements: organization type, owner-of-record, duplicate organization prevention, branch/location consistency.

### Suppliers

- Purpose: supply-network compatibility for food suppliers, building material suppliers, manufacturing suppliers, and wholesale suppliers without transactions.
- Ownership: linked business profile or organization owner-of-record.
- Main fields: id, supplier_type, organization_ref, business_profile_ref, category_refs, coverage_refs, public_description, status, trust_record_ref.
- Relationships: organization/business, services, coverage locations, representative assignments, trust, audit.
- Visibility level: public supplier identity with private contact/verification details separated.
- Validation requirements: exactly one owning organization/business context, supply category validation, no marketplace inventory/order fields.

### Partners

- Purpose: ecosystem growth roles for regional, business, digital, and community partners.
- Ownership: partner profile owner or organization relationship owner; not provider ownership by default.
- Main fields: id, partner_type, profile_ref, organization_ref, coverage_refs, supported_category_refs, trust_record_ref, relationship_status, created_at, updated_at.
- Relationships: coverage, organization relationships, representative assignments, trust, audit.
- Visibility level: public partner profile information plus internal relationship scope.
- Validation requirements: partner type, coverage, non-affiliate/non-commission boundary, no duplicate active partner scope.

### Representatives

- Purpose: scoped acting relationship for sales, service, delivery-future, or technical representatives without dispatch/commission behavior.
- Ownership: represented organization/business controls assignment; representative user/profile is distinct.
- Main fields: id, representative_type, representative_profile_ref, represented_entity_ref, scope_type, scope_refs, status, starts_at, ends_at, created_at, updated_at.
- Relationships: user/profile, organization/business/supplier, coverage, services, audit.
- Visibility level: assignment scope may be public-safe; private permissions and evidence are internal.
- Validation requirements: scope required, cannot change ownership/trust/verification, no duplicate conflicting active assignments.

### Categories

- Purpose: governed taxonomy layer under Business Type.
- Ownership: platform-governed catalog data.
- Main fields: id, business_type_ref, name_ar, name_en, slug, description, status, sort_order.
- Relationships: subcategories, services, discovery filters.
- Visibility level: public.
- Validation requirements: unique slug, valid business type, active/inactive status.

### Services

- Purpose: independent service catalog and provider-service compatibility.
- Ownership: platform owns catalog; providers reference services through provider-service records.
- Main fields: id, category_ref, subcategory_ref, name_ar, name_en, slug, workflow_type_ref, description, status.
- Relationships: category, subcategory, workflow type, provider services, discovery, Job Work future classification.
- Visibility level: public catalog data.
- Validation requirements: category/subcategory consistency, unique slug, workflow type reference, no ordering/payment fields.

### Locations

- Purpose: governed country/city/area/location/coverage model.
- Ownership: platform-governed reference data and entity-owned location relationships.
- Main fields: id, location_type, country_ref, city_ref, area_ref, public_label_ar, public_label_en, status.
- Relationships: physical locations, branch locations, professional locations, service coverage, partner coverage, discovery filters.
- Visibility level: public for governed labels; private for exact address/contact details when needed.
- Validation requirements: country → city → area hierarchy, avoid free-text dependency, distinguish address from coverage.

### Trust Records

- Purpose: verification status, trust level, and public trust indicators.
- Ownership: platform/governance controlled, not self-edited.
- Main fields: id, entity_type, entity_ref, verification_status, trust_level, public_indicator, reviewed_by_ref, reviewed_at, status.
- Relationships: user/profile/business/organization/partner/representative/platform-owned organization, verification records, audit.
- Visibility level: public indicators only; private evidence is internal.
- Validation requirements: prevent self verification, trust manipulation, representative trust edits, and private evidence exposure.

### Audit Records

- Purpose: immutable or append-only sensitive-action history.
- Ownership: platform operational governance.
- Main fields: id, actor_ref, actor_type, action, entity_type, entity_ref, previous_state, new_state, reason, occurred_at, request_context_ref.
- Relationships: actor, entity, lifecycle, permission, trust, verification, profile changes.
- Visibility level: internal operational data.
- Validation requirements: actor, action, entity, timestamp, reason for sensitive changes; no secrets or private evidence in public outputs.

## 4. Identity Database Design

Identity relationship:

```text
User Account
↓
Profile
↓
Roles
↓
Permissions
```

Database principles:

- User account is the identity anchor.
- Profiles are public-facing identity layers and must not store raw authentication secrets.
- Roles are assigned to user/profile/entity relationships.
- Permissions are referenced by roles and scoped to resources.
- Account lifecycle states should support created, pending, active, suspended, and archived.
- Role assignment records must include resource_ref, role, status, created_at, updated_at, and audit compatibility.
- Permission references must be stable and documented before authorization middleware exists.

## 5. Business Database Design

Business structure:

```text
Business Profile
Organization
Supplier
```

Design decisions:

- Business profile represents public provider identity.
- Organization represents larger managed entities and membership boundaries.
- Supplier is a supply capability/type linked to a business or organization, not a transaction seller by default.
- Members are modeled through organization membership records.
- Branches are modeled as location relationships, not separate ownership roots unless future governance requires it.
- Services are references to service catalog/provider-service records.
- Locations distinguish physical location, branch location, and coverage area.
- Trust relationship points to trust_records and verification records.

Prevention rules:

- No duplicate ownership without explicit ownership transfer or co-management contract.
- No mixed entity types that let supplier, business, partner, or representative overwrite each other.
- No supplier/business confusion: supplier capability must not imply marketplace inventory, ordering, or transactions.

## 6. Service Database Design

Service taxonomy relationship:

```text
Category
↓
Subcategory
↓
Service
↓
Workflow Type
```

Design principles:

- Categories, subcategories, services, and workflow types are platform-governed catalog records.
- Provider-service records may link a provider to catalog services in future design.
- Service ownership belongs to the catalog/governance layer; provider availability is a relationship, not ownership of catalog meaning.
- Visibility is public for active catalog services.
- Status should support active, inactive, deprecated, and draft/future-only as needed.
- Relationships include category_ref, subcategory_ref, workflow_type_ref, provider_refs, and discovery references.
- Do not create ordering, cart, quote, marketplace, price, payment, commission, or delivery models.

## 7. Location Database Design

Location hierarchy:

```text
Country
↓
City
↓
Area
↓
Service Coverage
```

Design principles:

- Country, city, and area should be governed reference data.
- Physical location is where a business/organization/branch exists.
- Branch location is a child location relationship for organizations or businesses with multiple branches.
- Professional location is a public/coverage-safe location for individual professionals.
- Coverage area defines where a provider, service, partner, or representative can operate in future workflows.
- Partner coverage is relationship scope, not physical address.
- Avoid free text location dependency by storing governed references and optional public labels separately.

## 8. Trust & Verification Database Design

Future trust structure:

- verification_status.
- trust_level.
- verification_records.
- public_indicators.
- reviewed_by_ref.
- reviewed_at.
- evidence_visibility_class.
- audit_record_ref.

Prevention rules:

- No self verification.
- No owner-edited trust decisions.
- No representative-edited verification decisions.
- No public exposure of private evidence.
- No paid badge or ranking side effect.
- No trust manipulation by platform-owned profile or partner status.

## 9. Relationship Database Design

Future relationship structures:

| Relationship structure | Required design fields |
| --- | --- |
| Organization Members | organization_ref, user_ref/profile_ref, role_ref, status, starts_at, ends_at, created_at, updated_at. |
| Partner Relationships | partner_ref, related_entity_ref, coverage_refs, supported_category_refs, relationship_type, status, timestamps. |
| Representative Assignments | representative_profile_ref, represented_entity_ref, scope_type, scope_refs, status, timestamps. |
| Service Ownership / Provider Service | provider_entity_ref, service_ref, workflow_type_ref, location_coverage_refs, status, timestamps. |

General relationship fields:

- relationship_type.
- scope.
- status.
- timestamps.
- created_by_ref.
- audit_record_ref for sensitive changes.

## 10. Audit Database Design

Every sensitive change should record:

- actor.
- action.
- entity.
- previous state.
- new state.
- timestamp.
- reason.

Audit applies to:

- ownership changes.
- permission changes.
- role assignments.
- verification decisions.
- trust changes.
- profile changes.
- lifecycle transitions.
- suspensions and archives.
- representative scope changes.
- partner coverage changes.
- official platform profile changes.

Audit records should be append-only where possible and must not become public profile data.

## 11. Index & Performance Strategy

Future indexing principles:

### Search Fields

- Index public slugs, public names, Arabic names, category references, service references, and location references.
- Search indexes must support discovery filters without becoming ranking or advertising infrastructure.

### Unique Fields

- Unique normalized email reference.
- Unique normalized phone reference where applicable.
- Unique public slug per profile/entity type.
- Unique category/service slugs.
- Scoped uniqueness for active organization membership, representative assignments, and partner coverage.

### Relationship Lookups

- Index owner_ref, profile_ref, organization_ref, business_profile_ref, service_ref, category_ref, location_ref, trust_record_ref, and status.

### Location Queries

- Index country_ref, city_ref, area_ref, location_type, coverage_refs, and active status.

### Status Queries

- Index lifecycle_state, status, verification_status, trust_level, relationship_status, and archived_at.

No ranking, advertising, payment, commission, marketplace, or social graph index strategy is included.

## 12. Data Privacy Review

Data classification:

| Class | Purpose | Examples |
| --- | --- | --- |
| Public | Discovery, sharing, and public profile display. | Public names, public descriptions, categories, services, public areas, public trust indicators. |
| Private | Protected user/entity information. | Account contact references, owner data, private contact details, credential evidence, verification evidence. |
| Internal | Platform operations, governance, security, audit, moderation. | Audit records, duplicate match evidence, suspension reasons, review notes, lifecycle operation context. |

Verification:

- No private data exposure.
- No secrets.
- No credentials.
- No tokens.
- No production values.
- No passwords.
- No production URLs.

Privacy decision: database design must separate public/private/internal data at field and table/relationship level before implementation.

## 13. Migration & Scalability Review

Future risks:

| Risk | Analysis | Prevention |
| --- | --- | --- |
| Schema growth (`schema growth`) | New sectors may add profile/service fields. | Use canonical entities, typed relationships, and service catalog references. |
| Entity expansion | Suppliers, partners, representatives, and platform-owned organizations may need specialized fields. | Use subtype/capability records rather than flattening all fields into business_profiles. |
| Multi-region support (`multi-region support`) | Country/city/area expansion may grow quickly. | Use governed location references and coverage relationships. |
| Data migration complexity (`data migration complexity`) | Early ambiguous names can force breaking changes. | Freeze naming conventions and separate profile/business/professional/service concepts. |
| Duplicate detection complexity | Normalized names/contact/location matching can become costly. | Use indexed normalized references and scoped duplicate-review records in future design. |
| Audit volume | Sensitive changes can generate many audit rows. | Design indexed append-only audit records with retention/governance decisions later. |

Scalability decision: database architecture can proceed if it uses explicit relationships, governed reference data, scoped uniqueness, lifecycle states, and privacy classification.

## 14. KILL CRITICAL Database Review

| Drift risk | Database danger | Prevention |
| --- | --- | --- |
| Marketplace database drift | Adding carts, orders, listings, offers, seller accounts, inventory, or transaction tables. | Exclude marketplace tables from V1 database design. |
| Payment tables | Adding wallets, charges, subscriptions, invoices, payouts, or payment methods. | Exclude payment and subscription tables. |
| Commission tables | Adding commission, affiliate, revenue-share, or referral-payout tables. | Keep partner/representative tables non-financial. |
| Advertising tables | Adding ads, campaigns, promoted placements, or sponsored listings. | Exclude advertising and paid visibility tables. |
| Ranking tables | Adding rank scores, paid ranking, boosted profiles, or hidden priority. | Discovery indexes are filtering/search support only. |
| Social network tables | Adding followers, likes, comments, feeds, messages, or chat tables. | Sharing remains external share-card compatibility only. |
| AI tracking tables | Adding model prompts, embeddings, recommendation logs, AI matching, or user profiling tables. | Exclude AI and recommendation data structures. |
| Unnecessary personal tracking | Logging excessive user behavior or private activity. | Use aggregate analytics boundaries and avoid personal surveillance tables. |

## 15. Database Architecture Decisions

1. Database design should use explicit canonical entities and relationship tables.
2. Profile, professional profile, business profile, organization, supplier, partner, and representative must remain distinct.
3. Supplier should begin as a capability/subtype linked to business or organization unless future governance decides otherwise.
4. Service catalog and provider-service relationships must remain separate.
5. Location must use governed country/city/area references and separate physical location from coverage.
6. Trust and verification records must be protected from self-edit and private evidence exposure.
7. Audit records must capture sensitive changes with actor/action/entity/state/reason/timestamp.
8. Indexing supports identity, discovery filters, relationships, status, location, and audit lookup, not ranking or advertising.
9. Platform-owned organization must preserve discovery neutrality and auditability.

## 16. Entity List

Ready database architecture entities:

- user_accounts.
- profiles.
- professional_profiles.
- business_profiles.
- organizations.
- suppliers or supplier_capabilities.
- partners.
- representative_assignments.
- categories.
- subcategories.
- services.
- workflow_types.
- provider_services.
- locations.
- location_relationships.
- trust_records.
- verification_records.
- audit_records.
- roles.
- permissions.
- role_assignments.
- organization_members.
- partner_relationships.
- platform_owned_organizations.

## 17. Remaining Migration Risks

- Exact supplier modeling still needs final implementation decision.
- Subtype strategy for profiles and organizations needs database-specific design.
- Audit payload format needs concrete schema naming before migrations.
- Location seed strategy needs operational governance.
- Duplicate detection confidence keys need careful privacy review.
- Official Khedmah Digital profile seed process needs governance approval.

## 18. Readiness Score Update

Database architecture readiness score after Mission 044: **94 / 100**.

Rationale: the core database architecture, entity list, relationships, privacy model, audit model, indexes, scalability risks, and kill-critical exclusions are now documented. The remaining 6 points depend on final supplier modeling, table/subtype strategy, audit payload details, location seed governance, and duplicate detection key design.

## 19. Recommended Next Mission

Recommended next mission: **Mission 045 — Database Entity Relationship Diagram & Table Naming Contract**.

Purpose: define the ERD-style relationship map, table naming rules, key/reference conventions, status fields, and seed-data boundaries without creating migrations, database models, or database connections.
