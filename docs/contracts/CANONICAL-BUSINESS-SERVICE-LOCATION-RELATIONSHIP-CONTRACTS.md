# Canonical Business Profile, Service Catalog, Location & Relationship Contracts

## Mission Boundary

This contract began as architecture reconciliation and now also governs the approved V1 Category authority. The bounded implementation consists of Migration `022_expand_category_taxonomy`, the existing Category API, leaf validation for Business Profile and Service Listing writes, root/leaf discovery filters, and grouped Web/Android presentation. All other future layers described here remain documentation until separately approved. This amendment does not authorize authentication changes, workflow engines, payments, marketplace features, ordering, delivery systems, commissions, subscriptions, social-network features, AI, advertising, paid ranking, or new production infrastructure.

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

## 2. Business Profile Canonical Contract

### Official Purpose

A Business Profile is the canonical public-facing profile for a discoverable provider identity on Khedmah Digital. It represents how an individual professional, business, organization, supplier, partner, or representative is presented for future discovery, sharing, trust display, service catalog linkage, location context, analytics aggregation, and possible future Job Work compatibility.

A Business Profile is not an orderable listing, marketplace seller account, payment recipient, chat identity, advertising unit, ranking unit, or AI recommendation target in V1.

### Relationship With Core Actors

| Actor | Relationship to Business Profile | Boundary |
| --- | --- | --- |
| User | A user may own, manage, represent, or contribute to a profile only through approved ownership and role rules. | User private data must not become public profile data. |
| Professional Profile | A professional profile may be represented as or linked to a Business Profile when the professional offers public services. | Professional identity must remain separate from business identity and credentials. |
| Organization | An organization may own or manage one or more Business Profiles after future governance. | Organization membership does not automatically create partner or representative authority. |
| Provider | Provider is a public role derived from a Business Profile plus service capability. | Provider must not become a generic table mixing all actor types without role contracts. |
| Partner | A partner may have a Business Profile or relationship to another profile. | Partner is not employee, affiliate, marketplace seller, or commission role. |
| Representative | A representative may have a profile and may represent another profile through an approved relationship. | Representative authority must be explicit and verified before public claims. |

### Ownership, Management, Representation, and Service Provision

| Question | Canonical answer |
| --- | --- |
| Who owns the profile? | The owning actor is either an individual user acting as an individual professional or an organization acting through approved owner members. Future contracts must record one owner-of-record per profile. |
| Who manages it? | Management is performed by approved users with profile-management permissions through the owning user or organization. Management is not the same as ownership. |
| Who can represent it? | Only approved representatives with an explicit relationship to the profile, organization, or provider can represent it. Representation is not implied by organization membership. |
| Who can provide services through it? | Services can be provided by the profile owner, organization members, linked professionals, approved workers, or representatives only after future service and relationship contracts define eligibility. |

### Profile Type Distinctions

#### A. Individual Professional

Examples:

- Doctor.
- Engineer.
- Lawyer.
- Technician.

Canonical distinction: the discoverable identity is centered on a person and their professional services. The professional may later be linked to an organization, but their individual professional identity and credential readiness remain separate from the organization identity.

#### B. Business

Examples:

- Restaurant.
- Shop.
- Workshop.

Canonical distinction: the discoverable identity is centered on a commercial business location, brand, or service provider. It may have staff, branches, services, and public contact intent, but does not imply marketplace selling or ordering.

#### C. Organization

Examples:

- Factory.
- Hospital.
- School.
- Company.

Canonical distinction: the discoverable identity is centered on a formal organizational actor. Organizations may own or manage multiple profiles and may connect to professionals, services, partners, representatives, or suppliers through explicit relationships.

#### D. Supplier

Examples:

- Food supplier.
- Building materials supplier.

Canonical distinction: the discoverable identity is centered on supply capability. Supplier profiles must distinguish supplier role, category, service coverage, organization relationship, trust status, and service catalog entries without implementing transactions, inventory, purchase orders, payments, commissions, or marketplace behavior.

## 3. Service Catalog Canonical Contract

### Official Purpose

A Service is an independent platform concept that describes what a profile can publicly offer or be discovered for. Service is separate from Business Type, Category, Subcategory, Workflow Type, Job Work state, price, payment, inventory, and marketplace availability.

### Canonical Chain

```text
Business
↓
Service
↓
Workflow Type
↓
Job Work
```

### Service Contract Principles

- Services should be governed taxonomy-linked concepts, not uncontrolled profile text only.
- A profile may offer multiple services.
- One service may be offered by many profiles.
- A service can have a future Workflow Type without implementing workflows.
- A service can be compatible with Job Work without creating jobs, orders, dispatch, or payments.
- Service labels must support Arabic-first presentation and optional secondary-language labels.

### Examples

#### Restaurant

Services:

- Food.
- Catering.

Workflow compatibility: public discovery and inquiry intent. Future delivery coverage must remain future scope and must not implement ordering or delivery marketplace.

#### Doctor

Services:

- Consultation.
- Medical examination.

Workflow compatibility: appointment service vocabulary. This does not implement appointments, booking, patient records, payments, or regulated data workflows.

#### Factory

Services:

- Manufacturing.
- Supply.

Workflow compatibility: supply service or partnership interest vocabulary. This does not implement supplier transactions, inventory, ordering, payments, or commissions.

#### Technician

Services:

- Repair.
- Installation.

Workflow compatibility: instant service, appointment service, or project service vocabulary. This does not implement dispatch, worker assignment, chat, payments, or mobile workflows.

## 4. Relationship Contract

### Official Relationship Chain

```text
User
↓
Profile
↓
Organization / Business
↓
Services
↓
Partners / Representatives
↓
Customers
```

### Canonical Relationship Types

| Relationship | Meaning | Boundary |
| --- | --- | --- |
| User owns Profile | A user is the owner-of-record for an individual professional profile. | Ownership is not representation of another organization. |
| User manages Profile | A user can edit or manage a profile through approved permissions. | Management is not ownership. |
| Organization owns Profile | An organization is owner-of-record for a business, supplier, factory, hospital, school, or company profile. | Organization membership controls access, not public representative claims. |
| Profile offers Service | A profile is associated with governed services. | Service offering is not an orderable product or marketplace listing. |
| Profile has Location | A profile has physical location, coverage, or territory context. | Location context is not private user location. |
| Profile has Partner | A profile may relate to a partner for ecosystem support. | Partner is not employee, affiliate, or commission recipient. |
| Profile has Representative | A profile may be represented in a region or category by a representative. | Representative authority must be explicit and not inferred. |
| Profile has Trust | A profile has trust state derived from completeness and verification readiness. | Trust is not paid ranking or advertising. |
| Service maps to Job Work | A service may be compatible with future execution workflows. | No Job Work engine is implemented. |

### Ownership Boundary Rules

- Every future profile must have one owner-of-record.
- Management permissions must be separate from ownership.
- Representation permissions must be separate from organization membership.
- Partner relationships must be separate from provider service delivery.
- Worker/provider execution relationships must be separate from partner and representative roles.
- Customer interactions must not create ownership or representation rights.

### Prevention Rules

- Prevent duplicate ownership by requiring a single owner-of-record and explicit transfer governance.
- Prevent role confusion by separating owner, manager, representative, partner, worker, provider, and customer roles.
- Prevent partner/provider conflicts by treating partner as ecosystem relationship and provider as service-capable public profile role.

## 5. Professional Profile Contract

### Official Purpose

A Professional Profile is the canonical identity for an individual professional's public professional presence. It may be discoverable directly or linked to a Business Profile when the professional offers services publicly.

Applies to:

- Doctor.
- Engineer.
- Lawyer.
- Consultant.
- Freelancer.

### Professional Identity vs Business Identity

Professional identity vs Business identity is a canonical distinction: professional identity describes the person and credentials, while business identity describes the organization, office, clinic, workshop, or company context.

| Concept | Meaning | Example |
| --- | --- | --- |
| Professional identity | The person's professional public identity, credentials, categories, services, and trust readiness. | A doctor offering consultation as an individual professional. |
| Business identity | The business, clinic, firm, workshop, office, or organization through which services may be offered. | A medical organization that employs or hosts doctors. |

Example:

```text
Doctor
↓
Individual Professional
or
Employee inside Medical Organization
```

Canonical distinction: a doctor can be an Individual Professional profile or a professional linked to an Organization profile. The same person must not be duplicated as multiple unrelated provider identities without ownership and relationship rules.

## 6. Location Contract

### Final Location Hierarchy

```text
Country
↓
City
↓
Area
↓
Service Coverage
```

### Business Location vs Service Coverage Area

Business location vs Service Coverage Area is a canonical distinction: business location describes physical presence, while service coverage area describes where services can be provided.

| Location concept | Meaning | Example |
| --- | --- | --- |
| Business location | Where the business, organization, branch, shop, clinic, workshop, or office is physically located. | Restaurant physical address in Damascus. |
| Service coverage area | Where the provider can serve, visit, deliver future scope service, represent, or operate. | Technician covers Damascus and nearby areas. |
| Network coverage area | Where a partner or representative supports ecosystem growth or relationships. | Partner covers Aleppo city. |
| Headquarters location | Main organization/factory/company location. | Factory headquarters in Saudi Arabia. |
| Branch location | Specific operational branch location. | Hospital branch in Homs. |

### Examples

- Restaurant: physical location plus delivery coverage as future-only vocabulary.
- Technician: service coverage area may matter more than physical address.
- Partner: network coverage area defines regional support scope.

### Location Rules

- Country, city, and area should be governed values.
- Free-text location must not be the only source of location truth.
- Physical address, service coverage, branch, headquarters, and territory must remain separate concepts.
- Private user location and private service addresses must not be exposed publicly.
- Location must be compatible with discovery, analytics, trust, sharing, partner network, and Job Work without implementing runtime features.

## 7. Trust Relationship Contract

Trust can attach to multiple entities, but each attachment must be scoped to avoid duplication.

| Trust attachment | Purpose | Duplication prevention |
| --- | --- | --- |
| User | Account security and identity readiness. | User trust must not automatically make all profiles verified. |
| Professional Profile | Professional identity and credential readiness. | Professional trust is scoped to the individual and category. |
| Business Profile | Public profile completeness, ownership, and business verification readiness. | Business profile trust is distinct from user and organization trust. |
| Organization | Ownership, membership, and organizational evidence readiness. | Organization trust does not automatically verify all employees or services. |
| Partner | Ecosystem relationship and contribution readiness. | Partner trust is not affiliate, commission, or marketplace eligibility. |
| Representative | Authority, region, and represented-entity readiness. | Representative trust requires explicit relationship evidence. |

### Trust Rules

- Trust state must be scoped by entity type.
- Verification evidence must remain private unless a public-safe label is approved.
- Trust must not become paid badges, advertising, ranking, or marketplace eligibility.
- A single boolean `verified` is not sufficient.
- Future trust contracts must define public status, internal status, evidence state, expiration, dispute, suspension, and audit requirements.

## 8. Job Work Compatibility

Compatibility chain:

```text
Service
↓
Job Type
↓
Workflow
↓
Provider / Worker
↓
Completion History
↓
Trust
```

### Compatibility Rules

- Service Catalog entries can map to future Job Types.
- Job Type must remain separate from Category and Service.
- Workflow Type must remain future vocabulary until implementation is authorized.
- Provider is a service-capable profile role.
- Worker is a future execution actor and must not be confused with representative, partner, or organization member.
- Completion History may contribute to Trust only after privacy, consent, dispute, retention, and aggregation rules exist.
- No workflow engine, task assignment, dispatch, payments, chat, ordering, or marketplace behavior is implemented by this contract.

## 9. Taxonomy Compatibility

Taxonomy chain:

```text
Business Type
↓
Category
↓
Subcategory
↓
Service
↓
Workflow Type
↓
Location
↓
Trust Level
```

### Implemented V1 Category Contract

- `Category` maps to one of 15 active parentless root records in the canonical `categories` table.
- `Subcategory` maps to one of 99 active leaf records whose `parent_code` references a root.
- The public Category API returns `code`, `parentCode`, Arabic-first and optional English labels, `visualKey`, `isFeatured`, `status`, and `sortOrder` from that authority. Arabic/English alias arrays remain server-side search fields and are not part of the public Category payload.
- New or changed Business Profile and Service Listing category selections require an active leaf; roots and inactive values are rejected. An unchanged preserved legacy reference may pass through an unrelated edit so migration 022 does not strand existing owners.
- Discovery accepts a root or leaf. Root filtering recursively includes descendants, and keyword search includes aliases from the category lineage.
- Web and Android must preserve the hierarchy rather than render a flat 114-item primary list.
- Existing organization records and memberships remain compatible data but gain no category ownership authority.
- Legacy referenced category rows are preserved, hidden when noncanonical, and restored to their exact prior state by the governed rollback.
- Category changes require reviewed migration, rollback, checksum synchronization, product/contract updates, and cross-client tests.

`Service`, `Workflow Type`, expanded location coverage, category-specific trust policy, representative relationships, and Job Work execution remain separate contracts and are not implied by this Category implementation.

### Registered Example Compatibility

| Example | Canonical placement | Notes |
| --- | --- | --- |
| Doctors | Individual Professional or Organization-linked Professional → `health_medical` → `doctor` → Consultation/Medical examination. | Professional verification policy remains separate. |
| Dentists | Individual Professional or Clinic-linked Professional → `health_medical` → `dentist` → Consultation/Dental examination. | The leaf exists; regulated verification policy remains separate. |
| Engineers | Individual Professional or Organization-linked Professional → `professional_services` → `engineer` → Design/Inspection/Project service. | Professional identity remains separate from project execution. |
| Lawyers | Individual Professional or Firm-linked Professional → `professional_services` → `lawyer` → Consultation/Legal service. | Regulated service rules remain separate. |
| Restaurants | Business → `food_hospitality` → `restaurant` → Food/Catering. | Cuisine, branch, and service coverage remain future dimensions. |
| Supermarkets | Business → `food_hospitality` → `grocery` → Grocery retail/local service. | `supermarket` is an approved search alias for the governed leaf. |
| Factories | Organization → `industrial_supply` → `factory` → Manufacturing/Supply. | Product-family dimensions remain future scope. |
| Suppliers | Supplier or Organization → `industrial_supply` → `wholesale_supplier` → Supply. | Wholesaler/distributor/importer roles remain separate. |
| Real Estate | Business or Professional → `construction_real_estate` → `real_estate_agent` → Property service. | Broker/developer relationships remain separate. |
| Tourism | Business or Professional → `travel_tourism` → `travel_agency` / `hotel` / `tour_guide` → Tourism service. | Booking and payment remain excluded. |
| Education | Organization or Professional → `education_training` → `school` / `private_tutor` → Education service. | Child-safety policy remains separate. |
| Technology | Business/Professional → `technology_digital` → `software_development` / `it_support` → Technical service. | Digital partner relationships remain separate. |
| Workers | Future Worker/Field Actor → Service Execution → Worker subtype → Execution support. | Worker should be relationship/execution role, not necessarily Business Type. |
| Representatives | Representative → Business Services/Supply & Distribution → Representative subtype → Representation service. | Relationship authority must be explicit. |

## 10. Critical Risk Review

### Missing Concepts

- Profile lifecycle and visibility state.
- Service offering lifecycle.
- Relationship lifecycle and expiration.
- Trust state machine.
- Location source-of-truth governance.
- Category governance for regulated and sector-specific domains.
- Worker/field actor contract.
- Public link/share card safety contract.
- Analytics event taxonomy and aggregation thresholds.

### Duplicated Concepts

- Provider as business, professional, supplier, representative, worker, or partner.
- Partner as business type, relationship, profile, and trust type.
- Representative as business type, relationship, worker-like actor, and service role.
- Service as taxonomy term, offering, workflow trigger, shared object, and analytics dimension.
- Location as address, coverage, territory, branch, headquarters, and analytics geography.
- Trust as verification status, badge, discovery signal, completion history, and analytics dimension.

### Naming Conflicts

- `Profile` versus `Business Profile` versus `Professional Profile`.
- `Organization` versus `Business` for factories, hospitals, schools, and companies.
- `Partner` versus `Representative` versus `Broker`.
- `Worker` versus `Representative` for delivery, technical, and field execution roles.
- `Workflow Type` versus `Job Type` versus `Job Lifecycle State`.

### Migration Risks

- Flat profile category storage.
- Single free-text location field.
- Single `verified` boolean.
- One generic provider table without role-specific relationships.
- Service data embedded directly in profile text.
- Job Work states embedded before workflow contracts exist.
- Analytics events collected before privacy-safe payload contracts exist.

### Future Scalability Risks

- Multi-branch organizations and multi-profile ownership.
- Cross-border suppliers and representatives.
- Multiple professionals inside one organization.
- One provider offering many services across multiple areas.
- Trust scoped differently by category, service, role, and location.
- Aggregated analytics across small areas risking privacy leakage.

## 11. V1 Boundary Check

This mission does not implement:

- Marketplace.
- Payments.
- Ordering.
- Delivery system.
- Commissions.
- Subscriptions.
- Social network.
- AI.
- Advertising.
- Ranking.
- APIs.
- Database models.
- Migrations.
- UI screens.
- Backend code.
- Frontend code.
- Authentication changes.
- Workflows.
- Production infrastructure.

## 12. Resolved Conflicts

| Conflict from Mission 036A | Canonical resolution |
| --- | --- |
| Partner as business type vs relationship role | Partner can be a discoverable role, but partner authority is a relationship and must not imply employment, affiliate, commission, or marketplace status. |
| Representative as business type, worker-like role, and service role | Representative is a relationship/authority role; worker is an execution actor; both require explicit contracts before implementation. |
| Provider as ambiguous actor | Provider means a Business Profile or Professional Profile capable of offering a governed Service. |
| Service as category child vs offering vs execution unit | Service is independent catalog concept; profile-service offering and Job Work execution are separate future relationships. |
| Location as address vs coverage vs territory | Location contract separates business location, service coverage, network coverage, headquarters, and branch. |
| Trust as badge vs verification vs analytics dimension | Trust attaches by entity type and scope; public display is distinct from private evidence and analytics. |

## 13. Architecture Decisions

1. Business Profile becomes the canonical public-facing discoverable provider profile.
2. Professional Profile is distinct from Business Profile but may be linked for service discovery.
3. Organization can own profiles, but organization membership does not imply representation.
4. Service is independent from category, profile text, workflow type, and Job Work state.
5. Relationship contracts separate owner, manager, representative, partner, provider, worker, and customer.
6. Location separates physical location, service coverage, network coverage, headquarters, and branch.
7. Trust attaches by scoped entity type and must not collapse into a single verified boolean.
8. Job Work compatibility remains future-only and does not implement workflows.
9. The implemented taxonomy supplies governed V1 roots and leaves for Legal, Retail/Grocery, Real Estate, Tourism, Education, Technology, Dental, and other approved discovery categories; regulated credential policy remains separate.

## 14. Remaining Risks

- Deeper Business Type, Service, Workflow Type, coverage, relationship, and Trust layers still require their own implementation decisions.
- Permissions and lifecycle state machines remain documentation-only.
- Cross-border partner/supplier/representative relationships need deeper governance.
- Regulated categories need category-specific review and trust policy.
- Analytics must wait for event taxonomy and aggregation thresholds.
- Business pressure may still push marketplace, payments, ranking, advertising, or AI if V1 boundaries are not enforced.

## 15. Readiness Score Update

Readiness score after Mission 037 reconciliation: **74 / 100**.

Rationale: Canonical ownership, profile, service, relationship, location, trust, Job Work, and taxonomy boundaries are now reconciled at the architecture-contract level. Development should still wait for field-level contracts, lifecycle state machines, permissions, validation rules, and privacy-safe analytics event definitions.

## 16. Recommended Next Mission

Recommended next mission: **Mission 038 — Field-Level Contract & Lifecycle Specification for Profiles, Services, Locations, Relationships, and Trust**.

Purpose: translate these canonical contracts into field-level documentation for future implementation planning without creating runtime code.
