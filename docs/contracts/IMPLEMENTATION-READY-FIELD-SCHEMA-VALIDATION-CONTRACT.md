# Implementation-Ready Field Schema & Validation Contract

## Mission Boundary

This document is documentation and architecture preparation only. It does not implement production features, database models, migrations, APIs, backend code, frontend code, UI screens, authentication, authorization middleware, admin panels, workflows, payments, marketplace features, ordering, delivery, commissions, subscriptions, messaging/chat, AI systems, advertising, or production infrastructure.

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

## 2. Schema Contract Principles

Every future field contract should define:

| Field contract element | Meaning |
| --- | --- |
| Field name | Stable canonical field name before database/API design. |
| Purpose | Why the field exists and what business question it answers. |
| Data type | Intended primitive or structured type such as string, enum, UUID reference, timestamp, boolean, object, or list. |
| Required / Optional | Whether the field is required for creation, public visibility, verification, or operation. |
| Public / Private visibility | Whether the field is public, private, internal operational, owner-visible, or trust-authority-only. |
| Owner | Which actor or resource owns the field value. |
| Editable roles | Roles that may request or perform modification under future permission contracts. |
| Validation rules | Required format, length, allowed values, state rules, ownership checks, and relationship checks. |
| Audit requirement | Whether creation, update, state change, or attempted modification must be audited. |

### Data Visibility Separation

| Visibility class | Meaning | Examples |
| --- | --- | --- |
| Public data | Approved data safe for public discovery, sharing, and public profile display. | Business display name, public category, public city. |
| Private data | User, owner, credential, contact routing, evidence, or account data not publicly visible. | Email, phone, credential evidence, private address. |
| Internal operational data | Platform moderation, trust, abuse, audit, lifecycle, and security fields. | Verification decision, suspension reason, audit metadata. |

## 3. User Account Schema Contract

Future User Account fields:

| Field name | Purpose | Data type | Required / Optional | Visibility | Owner | Editable roles | Validation rules | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| id | Stable account identifier. | UUID | Required | Internal/private | Platform | None after creation | Must be unique and immutable. | Creation only. |
| display_name | Owner-visible user display label. | String | Optional | Private by default unless linked to public profile rules. | User | User/Owner | Length, safe text, Arabic-first support. | Audit public exposure changes. |
| email | Account contact and login/contact method. | String | Required for email-based identity. | Private | User | User through secure flow | Email format, uniqueness, confirmation state. | Audit change. |
| phone | Optional account contact method. | String | Optional | Private | User | User through secure flow | Phone format, country code rules. | Audit change. |
| account_status | Lifecycle state. | Enum | Required | Internal | Platform | Future governance/security authority | Created, Pending, Active, Suspended, Archived. | Audit all changes. |
| preferred_locale | Arabic-first language preference. | Enum/string | Optional | Private | User | User | Allowed locale values. | No audit unless security relevant. |
| created_at | Creation timestamp. | Timestamp | Required | Internal | Platform | None | ISO timestamp. | Creation only. |
| updated_at | Last update timestamp. | Timestamp | Required | Internal | Platform | Platform | ISO timestamp. | No separate audit. |
| last_security_event_at | Security signal timestamp. | Timestamp | Optional | Internal security | Platform | Security authority | Timestamp only, no secret data. | Audit security event separately. |

### User Account Protection Rules

- No password value, token, or credential secret should appear in public contracts.
- Security-related fields are internal and must not be exposed publicly.
- Account contact methods are private unless future consent and contact-display contracts allow limited display.
- User Account is distinct from Professional Profile, Business Profile, Organization, Partner, and Representative identities.

## 4. Professional Profile Schema Contract

Applies to:

- Doctor.
- Engineer.
- Lawyer.
- Consultant.
- Freelancer.
- Technical specialists.

Future Professional Profile fields:

| Field name | Purpose | Data type | Required / Optional | Visibility | Owner | Editable roles | Validation rules | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| id | Stable professional profile identifier. | UUID | Required | Internal/public reference if approved | Profile owner | None after creation | Unique and immutable. | Creation only. |
| owner_user_id | Links profile to owner user. | UUID reference | Required | Private/internal | User | Owner transfer authority only | Must reference valid user; one owner-of-record. | Audit changes. |
| profession | Main profession. | Enum/taxonomy reference | Required for public profile | Public | Professional profile | Owner request; trust review may govern | Must match governed taxonomy. | Audit changes. |
| specialty | Specialty under profession. | Enum/string/taxonomy reference | Optional or category-required | Public after approval | Professional profile | Owner request; review for regulated categories | Allowed value or moderated text. | Audit changes. |
| qualifications_summary | Public-safe summary of qualifications. | String | Optional | Public after approval | Professional profile | Owner request | Safe text; no private evidence. | Audit changes. |
| qualification_evidence_ref | Private evidence reference. | Reference | Optional or required by category | Private/trust authority | Trust authority | Trust authority only | Must not expose raw evidence publicly. | Audit all changes. |
| experience_summary | Public experience description. | String | Optional | Public after approval | Professional profile | Owner/manager if delegated | Safe text and length rules. | Audit changes. |
| services | Linked professional services. | List of service references | Required for service discovery | Public | Professional profile | Owner/manager if delegated | Must reference approved services. | Audit changes. |
| locations | Professional location or service coverage. | List of location references | Optional/required for discovery | Public/private by class | Professional profile | Owner/manager if delegated | Governed country/city/area/coverage. | Audit sensitive changes. |
| trust_summary | Public trust indicator. | Trust reference/enum | Optional | Public-safe | Trust authority | Trust authority only | Derived from trust contract. | Audit all changes. |

### Professional Identity vs Business Identity

Professional identity describes the person, profession, specialty, credentials summary, services, locations, and trust context. Business identity describes the clinic, firm, office, workshop, company, hospital, or organization context. A doctor may be an Individual Professional or connected to a Medical Organization, but the profile contract must not duplicate the same person as unrelated identities.

## 5. Business Profile Schema Contract

Applies to:

- Restaurant.
- Shop.
- Workshop.
- Service business.
- Retail business.

Future Business Profile fields:

| Field name | Purpose | Data type | Required / Optional | Visibility | Owner | Editable roles | Validation rules | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| id | Stable profile identifier. | UUID | Required | Internal/public reference if approved | Owner-of-record | None after creation | Unique and immutable. | Creation only. |
| owner_ref | Owner user or organization. | Reference | Required | Internal/owner-visible | Owner-of-record | Owner transfer authority | Must reference valid owner; one owner-of-record. | Audit changes. |
| business_name | Public business name. | String | Required for public profile | Public | Business profile | Owner/admin/manager if delegated | Length, safe text, Arabic-first support. | Audit changes. |
| category_ref | Main category. | Taxonomy reference | Required | Public | Business profile | Owner/admin request | Must reference approved category. | Audit changes. |
| description | Public business description. | String | Optional | Public after approval | Business profile | Owner/admin/manager if delegated | Safe text and length rules. | Audit changes. |
| service_refs | Offered services. | List of service references | Optional/required for discovery | Public | Business profile | Owner/admin/manager if delegated | Must reference approved services. | Audit changes. |
| location_refs | Business and coverage locations. | List of location references | Required for location discovery | Public/private by class | Business profile | Owner/admin/manager if delegated | Must distinguish physical and coverage locations. | Audit sensitive changes. |
| contact_public | Public contact information. | Structured object | Optional | Public if approved | Business profile | Owner/admin/manager if delegated | Format validation; no private routing secrets. | Audit changes. |
| media_refs | Public media references. | List of media references | Optional | Public after moderation | Business profile | Owner/admin/manager if delegated | Allowed media type; moderation status. | Audit changes. |
| operating_info | Hours or operating notes. | Structured object/string | Optional | Public after approval | Business profile | Owner/admin/manager if delegated | Valid time formats where structured. | Audit changes. |
| trust_summary | Public trust indicator. | Trust reference/enum | Optional | Public-safe | Trust authority | Trust authority only | Derived from trust contract. | Audit all changes. |

### Business Ownership and Visibility Rules

- Business Profile has one owner-of-record.
- Managers can edit only delegated fields.
- Representatives cannot modify owner, trust, verification, or unassigned public information.
- Public fields require safe text, taxonomy, visibility, and audit rules.
- Private contact routing and verification data must remain private.

## 6. Organization Schema Contract

Applies to:

- Factory.
- Hospital.
- School.
- Company.

Future Organization fields:

| Field name | Purpose | Data type | Required / Optional | Visibility | Owner | Editable roles | Validation rules | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| id | Stable organization identifier. | UUID | Required | Internal/public reference if approved | Organization owner | None after creation | Unique and immutable. | Creation only. |
| organization_name | Formal organization display name. | String | Required | Public if profile-visible | Organization | Owner/admin | Safe text, Arabic-first support. | Audit changes. |
| organization_type | Factory, hospital, school, company, etc. | Enum/taxonomy reference | Required | Public if profile-visible | Organization | Owner/admin request | Governed allowed values. | Audit changes. |
| branch_refs | Branch relationships. | List of location/profile references | Optional | Public/private by branch visibility | Organization | Owner/admin | Must reference valid branch/location. | Audit changes. |
| member_refs | Organization members. | List of user-role references | Required after membership | Private/internal | Organization | Owner/admin if delegated | Must obey membership contract. | Audit all changes. |
| service_refs | Organization-level services. | List of service references | Optional | Public if profile-visible | Organization | Owner/admin/manager if delegated | Approved services only. | Audit changes. |
| location_refs | Headquarters, branches, coverage. | List of location references | Required for discovery if public | Public/private by class | Organization | Owner/admin | Structured location validation. | Audit sensitive changes. |
| coverage_refs | Service/network coverage. | List of location references | Optional | Public/private by class | Organization | Owner/admin/manager if delegated | Must distinguish coverage from address. | Audit changes. |
| relationship_refs | Partners/representatives/suppliers. | List of relationship references | Optional | Public/private by relationship type | Organization | Owner/admin; relationship authority | Must pass relationship validation. | Audit all changes. |

### Organization Ownership Boundaries

- Organization owner role controls organization resource ownership.
- Organization members are not owners unless assigned owner role under future rules.
- Organization trust does not automatically verify all members, services, branches, or relationships.
- Organization relationships must not create partner, representative, or worker authority without explicit relationship records.

## 7. Supplier Schema Contract

Compatible supplier types:

- Food suppliers.
- Building material suppliers.
- Manufacturing suppliers.
- Wholesale suppliers.

Future supplier-specific fields:

| Field name | Purpose | Data type | Required / Optional | Visibility | Owner | Editable roles | Validation rules | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| supplier_type | Classifies supplier role. | Enum/taxonomy reference | Required for supplier profiles | Public | Supplier profile | Owner/admin request | Allowed values such as wholesaler, distributor, manufacturer supplier. | Audit changes. |
| supply_categories | Categories supplied. | List of taxonomy references | Required for discovery | Public | Supplier profile | Owner/admin/manager if delegated | Approved categories only. | Audit changes. |
| coverage_refs | Supply coverage areas. | List of location references | Required for location discovery | Public/private by class | Supplier profile | Owner/admin/manager if delegated | Structured coverage validation. | Audit changes. |
| organization_ref | Supplier organization if applicable. | Reference | Optional/required for organizations | Internal/public by visibility | Supplier/organization | Owner/admin | Valid organization relationship. | Audit changes. |
| trust_summary | Public trust indicator. | Trust reference/enum | Optional | Public-safe | Trust authority | Trust authority only | Derived from trust contract. | Audit all changes. |

Supplier contracts do not create transactions, inventory, purchase orders, ordering, payments, commissions, delivery marketplace, supplier marketplaces, or revenue-sharing systems.

## 8. Service Catalog Schema Contract

Service Catalog hierarchy:

```text
Category
↓
Subcategory
↓
Service
↓
Workflow Type
```

### Category Fields

| Field | Purpose | Data type | Visibility | Validation |
| --- | --- | --- | --- | --- |
| category_id | Stable category identifier. | UUID/string | Public | Unique and immutable. |
| name_ar | Arabic category label. | String | Public | Required; safe text. |
| description | Category purpose. | String | Public/internal by status | Safe text. |
| status | Category lifecycle. | Enum | Internal/public if active | Draft, Active, Reserved, Archived. |

### Subcategory Fields

| Field | Purpose | Data type | Visibility | Validation |
| --- | --- | --- | --- | --- |
| subcategory_id | Stable subcategory identifier. | UUID/string | Public | Unique and immutable. |
| category_id | Parent category. | Reference | Public | Must reference active/approved category. |
| name_ar | Arabic subcategory label. | String | Public | Required; safe text. |
| status | Subcategory lifecycle. | Enum | Internal/public if active | Draft, Active, Reserved, Archived. |

### Service Fields

| Field | Purpose | Data type | Visibility | Validation |
| --- | --- | --- | --- | --- |
| service_id | Stable service identifier. | UUID/string | Public | Unique and immutable. |
| subcategory_id | Parent subcategory. | Reference | Public | Must reference approved subcategory. |
| name_ar | Arabic service label. | String | Public | Required; safe text. |
| description | Service explanation. | String | Public/internal by status | Safe text and length. |
| default_workflow_type | Future workflow compatibility. | Enum | Internal/public by approval | Discovery, Inquiry, Appointment, Instant, Project, Supply, Transport. |
| status | Service lifecycle. | Enum | Internal/public if active | Draft, Active, Reserved, Archived. |

### Workflow Type Fields

| Field | Purpose | Data type | Visibility | Validation |
| --- | --- | --- | --- | --- |
| workflow_type_id | Stable workflow type identifier. | UUID/string | Internal/public by approval | Unique and immutable. |
| name | Workflow type name. | Enum/string | Public if approved | Discovery, Inquiry, Appointment, Instant, Project, Supply, Transport. |
| boundary_note | Scope boundary. | String | Public/internal | Must state no implementation unless approved. |

Examples compatible with this schema:

- Medical consultation.
- Restaurant food service.
- Computer maintenance.
- Camera installation.
- Construction service.

## 9. Location Schema Contract

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

### Location Field Classes

| Location type | Purpose | Key fields | Visibility |
| --- | --- | --- | --- |
| Business location | Physical location of business/profile/branch. | country_ref, city_ref, area_ref, address_public_class. | Public/private by address class. |
| Branch location | Physical branch location. | branch_id, organization_ref, country_ref, city_ref, area_ref. | Public/private by branch visibility. |
| Professional location | Professional office or service area. | profile_ref, country_ref, city_ref, area_ref, coverage_ref. | Public/private by profile rules. |
| Service coverage area | Where service is available. | coverage_id, country_ref, city_ref, area_ref, coverage_type. | Public if approved. |
| Partner coverage area | Region supported by partner/representative. | relationship_ref, country_ref, city_ref, area_ref, territory_note. | Public/private by relationship rules. |

### Location Validation Principles

- Country, city, and area must be governed values.
- Free text cannot be the only location source of truth.
- Address, branch, headquarters, service coverage, and partner coverage must remain separate.
- Private user location and private service addresses must not be public.
- Location changes affecting discovery, coverage, trust, or relationships require audit.

## 10. Trust & Verification Schema Contract

Future trust and verification fields:

| Field name | Purpose | Data type | Visibility | Editable roles | Validation rules | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- |
| verification_status | Internal review state. | Enum | Internal/owner-visible/public-safe by mapping | Trust authority only | Unreviewed, Submitted, Reviewed, Approved, Rejected, Suspended, Expired. | Audit all changes. |
| trust_level | Public-safe trust signal. | Enum/reference | Public-safe | Trust authority only | Basic, Approved, Verified, Suspended, Rejected or future governed values. | Audit all changes. |
| public_trust_indicators | Public badge/label data. | Structured object | Public | Trust authority only | Must not expose evidence. | Audit all changes. |
| evidence_refs | Private verification evidence references. | List/reference | Private/trust authority | Trust authority only | Must not expose raw evidence. | Audit all changes. |
| verification_reason | Internal reason for decision. | String/reference | Internal | Trust authority only | Reason-code governed. | Audit all changes. |

### Trust Protection Rules

- Users cannot edit their own trust.
- Owners cannot edit verification decisions.
- Representatives cannot modify trust.
- Managers and members cannot modify verification evidence.
- Public trust indicators must never expose private verification evidence.
- Trust changes require audit.

## 11. Relationship Schema Contract

Future relationship fields and rules:

| Relationship | Key fields | Purpose | Validation rules |
| --- | --- | --- | --- |
| User → Profile | user_id, profile_id, role, ownership_status, lifecycle_status. | Links user to profile ownership/management. | One owner-of-record; valid role; no duplicate active ownership. |
| Organization → Members | organization_id, user_id, role, status, permissions_scope. | Links users to organization membership. | Unique active membership; role allowed; audit role changes. |
| Business → Services | business_profile_id, service_id, status, visibility, assigned_manager. | Links business profile to services. | Approved service; valid owner/manager permission. |
| Partner → Coverage | partner_profile_id, coverage_ref, category_scope, status. | Defines partner coverage. | Governed location; no duplicate conflicting active scope. |
| Representative → Relationship scope | representative_profile_id, represented_resource_ref, service_scope, category_scope, location_scope, status. | Defines representation authority. | Explicit represented resource; no unauthorized relationship; audit status changes. |

### Relationship Protection Rules

- Prevent duplicate ownership with one owner-of-record per profile/resource.
- Prevent unauthorized relationships by requiring owner/admin/trust authority approval depending on relationship type.
- Prevent role conflicts by separating owner, manager, representative, partner, worker, provider, member, and customer scopes.
- Relationship changes require audit when they affect ownership, visibility, trust, coverage, services, or representation.

## 12. Validation Rules Review

Validation principles:

| Validation class | Rule |
| --- | --- |
| Required fields | Required fields depend on creation, public visibility, verification, and discovery state. |
| Format validation | Emails, phone numbers, timestamps, UUIDs, URLs/references, enum values, and localized labels require format checks. |
| Allowed values | Statuses, roles, trust levels, category references, workflow types, and visibility classes must use governed values. |
| Status transitions | Lifecycle transitions must follow approved state transition contracts. |
| Ownership validation | Updates require owner-of-record, delegated management, or authority-specific permission. |
| Visibility validation | Public fields must be safe, approved, and free of private evidence/secrets. |
| Relationship validation | Relationships must reference valid resources and avoid duplicate/conflicting active relationships. |
| Audit validation | Sensitive fields and state changes require audit metadata. |

## 13. Security & Privacy Review

This contract verifies:

- No secrets.
- No credentials.
- No tokens.
- No passwords.
- No private user data.
- No production information.
- No database models.
- No APIs.
- No runtime implementation.

Privacy separation is confirmed through Public data, Private data, and Internal operational data classes. Future implementation must define secure storage, access control, encryption expectations where applicable, audit retention, deletion, consent, private evidence protection, and production security controls separately.

## 14. V1 Boundary Check

This mission does not implement:

- Database.
- APIs.
- Authentication.
- Authorization.
- Payments.
- Marketplace.
- Ordering.
- Delivery.
- Commissions.
- Subscriptions.
- AI.
- Advertising.
- Database models.
- Migrations.
- Backend code.
- Frontend code.
- UI screens.
- Admin panels.
- Workflows.
- Messaging/chat.
- Production infrastructure.

## 15. Schema Decisions

1. Every future field must define purpose, type, requirement level, visibility, owner, editable roles, validation rules, and audit requirement.
2. Public, private, and internal operational data are separate visibility classes.
3. User Account data remains private and distinct from public profile identity.
4. Professional Profile identity remains separate from Business/Organization identity.
5. Business Profile fields are public only after visibility and validation rules allow them.
6. Organization fields separate branches, members, services, locations, coverage, and relationships.
7. Supplier-specific fields describe supply capability without transactions.
8. Service Catalog separates Category, Subcategory, Service, and Workflow Type.
9. Location separates physical locations, branches, professional locations, service coverage, and partner coverage.
10. Trust and verification fields are controlled by trust authority, not users, owners, managers, members, or representatives.
11. Relationships must prevent duplicate ownership, unauthorized relationships, and role conflicts.

## 16. Resolved Risks

- Field contracts now include visibility, ownership, editable roles, validation, and audit expectations.
- Professional and business identities are separated at schema-contract level.
- Supplier fields are scoped without transactions, ordering, payments, or inventory.
- Trust and verification fields are protected from self-editing and representative modification.
- Relationship fields explicitly prevent duplicate ownership and unauthorized relationships.
- Location fields avoid free-text-only dependency.

## 17. Remaining Risks

- Field names are implementation-ready at contract level but still require database/API naming reconciliation before code.
- Exact enum lists may need governance expansion for categories, statuses, trust levels, and workflow types.
- Validation error codes and API payload contracts are not defined.
- Audit event names and retention policies are not fully specified.
- Media handling, file storage, and evidence handling need future security contracts.
- Internationalization details beyond Arabic-first labels need future rules.

## 18. Readiness Score Update

Readiness score after Mission 040 schema and validation contract: **86 / 100**.

Rationale: Core entity fields, visibility boundaries, ownership rules, validation principles, relationship rules, and trust protections are now documented before database/API design. Implementation should still wait for final API payload contracts, database-neutral entity diagrams, audit event names, validation error catalog, and security storage rules.

## 19. Recommended Next Mission

Recommended next mission: **Mission 041 — API Payload, Validation Error & Audit Event Naming Contract**.

Purpose: define request/response payload shapes, validation error codes, audit event names, privacy classes, and API-neutral contract examples without implementing APIs or database models.
