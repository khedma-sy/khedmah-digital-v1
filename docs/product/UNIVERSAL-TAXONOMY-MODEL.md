# Universal Business & Service Taxonomy Model

## Purpose

This document governs the implemented V1 category taxonomy and the reserved layers that may extend it later. It is the product authority for Arabic-first category discovery, owner classification, and category presentation across Web and Android while preserving the bounded V1 scope.

## Scope Boundary

The V1 implementation authority is limited to a two-level `Category → Subcategory` slice: 15 canonical roots, 99 selectable leaves, Migration `022_expand_category_taxonomy`, the read-only Category API, category validation on existing business/service writes, and category/search presentation in the existing Web and Android clients. The broader Business Type, Service, Workflow Type, Location, and Trust layers remain governed by their own existing contracts; this amendment does not authorize new transaction systems or production infrastructure.

## Implemented V1 Category Authority

| Decision | Approved V1 behavior |
| --- | --- |
| Source of truth | The `categories` table and ordered Migration `022_expand_category_taxonomy`. |
| Shape | Exactly 15 active root categories and 99 active leaf categories in the shipped catalog. Root and leaf codes are stable governed identifiers. |
| Owner writes | Business profiles and service listings select an active leaf. A broad root is not a writable activity classification. |
| Discovery | Search accepts an active root or leaf. A root includes all descendants; Arabic and English aliases from the selected category lineage are searchable. |
| Presentation | Web groups roots and leaves. Android carries `parentCode`, shows roots as the main row, and reveals the selected root's leaves. |
| Compatibility | Pre-existing referenced category rows are preserved. Noncanonical legacy roots are hidden from active public/owner selection, and the rollback restores their exact pre-022 state. |
| Change control | Adding, renaming, moving, or reactivating categories requires a reviewed migration, updated aliases/presentation, tests, and synchronized product/contract documentation. |

## Taxonomy Principles

- Arabic-first naming, labels, moderation, and discovery must remain the default product direction.
- A business can have more than one classification dimension; the taxonomy must not collapse all meaning into one flat category.
- Business identity, offered services, workflows, locations, and trust level are separate concepts.
- Internal organization membership must remain separate from external commercial roles such as representative, broker, supplier, or partner.
- The implemented category slice uses governed values instead of uncontrolled free-form category strings.
- Expansion beyond the approved 15 roots and 99 leaves remains reserved until product and domain governance are updated with the same change.

## Business Types

Business Type is the highest-level actor classification. It describes what kind of business or professional identity is being represented, not the full category or service list.

| Business Type | Meaning | Example actors | V1 boundary |
| --- | --- | --- | --- |
| Individual Professional | A person offering professional services under an individual profile or owned business profile. | Doctor, engineer, marketer, private chef. | Discovery vocabulary only until approved. |
| Business | A commercial entity providing services or selling its public offering. | Restaurant, clinic, agency, shop. | Discovery vocabulary only until approved. |
| Factory | A producer or manufacturer of goods. | Water factory, juice factory, biscuit factory. | Future/reserved sector-specific scope. |
| Supplier | A provider of goods to other businesses or consumers. | Food wholesaler, dairy supplier, beverage supplier. | Future/reserved sector-specific scope. |
| Partner | A business or person seeking or providing commercial collaboration. | Distribution partner, business partner. | Future/reserved relationship scope. |
| Representative | A person or business representing another entity in a territory. | City representative, regional agent. | Future/reserved relationship scope. |
| Broker | A person or business connecting parties without becoming the producer, supplier, or buyer. | Commercial broker, sourcing broker. | Future/reserved relationship scope. |

## Category Hierarchy

The universal taxonomy hierarchy is:

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

### 1. Business Type

Business Type identifies the actor kind. Examples include Individual Professional, Business, Factory, Supplier, Partner, Representative, and Broker.

### 2. Category

Category identifies the broad field of activity. Examples:

- Healthcare.
- Food & Hospitality.
- Manufacturing.
- Engineering.
- Marketing.
- Business Services.
- Supply & Distribution.

### 3. Subcategory

Subcategory narrows the field. Examples:

- Doctor under Healthcare.
- Restaurant under Food & Hospitality.
- Water Factory under Manufacturing.
- Food Supplier under Supply & Distribution.
- Civil Engineer under Engineering.
- Digital Marketer under Marketing.
- Regional Representative under Business Services or Supply & Distribution.

### 4. Service

Service describes a specific public offering or professional capability. Examples:

- Medical consultation.
- Family dining.
- Catering.
- Bottled water production.
- Wholesale vegetable supply.
- Structural design.
- Social media campaign management.
- Regional representation.

Service is not the same as Category. A restaurant may offer family dining and catering; an engineer may offer inspection and design; a factory may offer production capacity and partner opportunity discovery in future scope.

### 5. Workflow Type

Workflow Type describes the non-transactional interaction intent or business journey expected around the service. Approved future values must be governed before implementation. Documentation-level examples include:

- Public discovery.
- Inquiry intent.
- Appointment request intent.
- Quote request intent.
- Partnership interest.
- Representation interest.
- Supplier discovery interest.

Workflow Type must not imply ordering, payment, commission, delivery, inventory, chat, AI matching, or marketplace transaction behavior.

### 6. Location

Location defines where the business identity, service availability, or future relationship need applies. It should be modeled as structured geography rather than a single text field.

Future location concepts should distinguish:

- Country.
- City.
- Area or district.
- Public address visibility.
- Service coverage area.
- Headquarters location.
- Branch location.
- Territory of representation or partnership need.

### 7. Trust Level

Trust Level describes moderation and verification status for discovery safety. Documentation-level examples include:

- Unreviewed.
- Submitted.
- Reviewed.
- Approved.
- Verified.
- Suspended.
- Rejected.

Trust Level must be controlled by future trust and safety contracts. It must not be used to imply paid ranking, advertising, recommendation, marketplace eligibility, or transaction approval.

## Examples

### Doctor

```text
Individual Professional
↓
Healthcare
↓
Doctor
↓
Medical consultation
↓
Appointment request intent
↓
Country: Syria / City: Damascus / Area: future governed value
↓
Trust Level: Approved or Verified
```

Architecture note: suitable for future business profile and service catalog compatibility, but appointments remain intent-only unless separately approved.

### Restaurant

```text
Business
↓
Food & Hospitality
↓
Restaurant
↓
Family dining / Catering
↓
Public discovery or inquiry intent
↓
Country: Syria / City: Aleppo / Area: future governed value
↓
Trust Level: Approved
```

Architecture note: supports restaurant discovery vocabulary without implementing ordering, delivery, payments, commissions, or marketplace flows.

### Factory

```text
Factory
↓
Manufacturing
↓
Water Factory
↓
Bottled water production
↓
Partnership interest or representation interest
↓
Headquarters Country: Saudi Arabia / Needed Territory: Syria / City: Damascus
↓
Trust Level: Reviewed or Verified
```

Architecture note: compatible with future factory discovery and partner-need vocabulary, but does not implement representative matching, contracts, commissions, or supplier transactions.

### Supplier

```text
Supplier
↓
Supply & Distribution
↓
Food Supplier
↓
Wholesale dairy supply
↓
Supplier discovery interest or quote request intent
↓
Country: Syria / City: Homs / Coverage: future governed values
↓
Trust Level: Approved
```

Architecture note: separates supplier classification from restaurant classification and keeps transactions out of scope.

### Engineer

```text
Individual Professional
↓
Engineering
↓
Civil Engineer
↓
Structural design
↓
Inquiry intent or quote request intent
↓
Country: Syria / City: Damascus
↓
Trust Level: Verified
```

Architecture note: supports professional discovery without introducing contracting, payments, or project marketplace behavior.

### Marketer

```text
Individual Professional or Business
↓
Marketing
↓
Digital Marketer
↓
Social media campaign management
↓
Inquiry intent or quote request intent
↓
Country: Syria / Remote coverage: future governed value
↓
Trust Level: Approved
```

Architecture note: supports service discovery while preserving future governance for remote coverage and business verification.

### Representative

```text
Representative
↓
Business Services
↓
Regional Representative
↓
Regional representation
↓
Representation interest
↓
Country: Syria / City: Latakia / Territory: future governed value
↓
Trust Level: Reviewed or Verified
```

Architecture note: representative identity must remain separate from organization membership and requires future relationship contracts before implementation.

## Compatibility Analysis

### Compatibility With `business_profiles`

The implemented Business Profile contract stores one governed leaf `category_code`. Category labels remain platform-owned, Arabic-first records rather than owner-entered profile text. Root categories are discovery filters only. Existing ownership, visibility, moderation, organization compatibility, and public-field rules remain unchanged; this taxonomy amendment does not grant organization membership or create a second profile owner model.

Reserved beyond this implementation: multiple classifications per profile, multiple business types, category-specific credentials, and owner-proposed taxonomy values.

### Compatibility With Service Catalog

The existing Service Catalog keeps service listings separate from category records. Each listing selects one active leaf `category_code`; the Category API does not turn roots or leaves into orderable services. Workflow Type, owner-proposed taxonomy, and any many-to-many service taxonomy remain reserved for separate approval.

### Compatibility With Locations

Category filtering remains independent of the existing governed Locations source and `cityCode` search filter. The taxonomy does not embed addresses, precise coordinates, service coverage, branches, or territories. Cross-border coverage and partner/representative territories remain reserved.

### Compatibility With Discovery

V1 discovery searches approved public businesses, professionals, and services by keyword, governed location, and category. Both roots and leaves are searchable; a root recursively includes its leaves, and category-lineage aliases participate in keyword matching. Public results continue to obey the existing publication, moderation, and visibility rules. Paid ranking, recommendation, personalization, and reserved network roles are not introduced.

## Architecture Decisions

1. Use a layered taxonomy from Business Type to Trust Level instead of a flat category list.
2. Keep Business Type separate from Category so factories, suppliers, restaurants, professionals, brokers, partners, and representatives are not mixed incorrectly.
3. Keep Service separate from Subcategory so one actor can offer multiple services under one classification.
4. Keep Workflow Type non-transactional until future governance approves any deeper behavior.
5. Keep Location structured and separate from profile text to support country, city, area, coverage, headquarters, branches, and territories.
6. Keep Trust Level separate from paid ranking, advertising, recommendation, or marketplace eligibility.
7. Keep representative and partner roles separate from internal organization membership.
8. Implement the V1 Category and Subcategory layers as root and leaf rows in one canonical `categories` authority.
9. Allow roots for broad discovery but require leaves for owner-authored Business Profile and Service Listing classification.

## Risks

- A flat category implementation would make future expansion brittle and may require database redesign.
- Mixing factories, suppliers, restaurants, professionals, and representatives under one undifferentiated type would harm discovery quality and moderation.
- Treating representative or broker as organization membership would confuse internal access control with external commercial relationships.
- Treating workflow type as a transaction state could accidentally introduce marketplace, ordering, payments, delivery, commissions, or supplier transaction behavior.
- Treating trust level as paid visibility or ranking would violate current V1 boundaries.
- Unstructured location text would make country/city/area discovery and regional representation needs difficult to support.

## Explicit Exclusions

The implemented V1 category slice does not authorize or implement:

- Marketplace.
- Payments.
- Ordering.
- Commissions.
- Delivery ordering, dispatch, fulfillment, or tracking. `Delivery & courier` is only a discoverable provider category.
- Messaging.
- AI.
- Inventory.
- Supplier transactions.
- New production infrastructure beyond the existing reviewed migration/deployment path.
