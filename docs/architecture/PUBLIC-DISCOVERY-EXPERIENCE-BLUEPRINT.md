# Public Discovery Experience Blueprint

## Mission Boundary

This blueprint now records the approved bounded V1 discovery implementation: keyword search, governed `cityCode`, the canonical root/leaf Category authority for Business Profiles and Service Listings, and a separate keyword/location search for public Professional Profiles on existing Web and Android surfaces. It does not authorize marketplace, payments, ordering, messaging/chat, commissions, advertising, paid ranking, AI recommendations, or new discovery infrastructure beyond the reviewed runtime and migration paths.

## Discovery Experience Goal

Khedmah Digital public discovery should help users find the right service, professional, business, supplier, or partner through an Arabic-first, location-aware, category-aware experience. The experience should remain simple in V1 and should prioritize clear public information, trusted visibility, and safe contact intent over transactions or social behavior.

The current bounded discovery experience supports:

- Service discovery.
- Business discovery.
- Professional discovery.
- Location-based discovery.
- Category-based Business Profile and Service Listing discovery.
- Supplier and partner discovery as future governed scope.

## Discovery Structure

The official discovery relationship is:

```text
User Need
↓
Search / Browse
↓
Category
↓
Subcategory
↓
Service
↓
Provider / Business Profile
↓
Location
↓
Trust Information
```

### Structure Meaning

| Layer | Purpose | Boundary |
| --- | --- | --- |
| User Need | The user's intent, phrased as a need, service, profession, business type, or location. | Does not create personalization or AI recommendations. |
| Search / Browse | The entry path for keyword search or guided category browsing. | Uses the approved existing search API and does not add an external index or recommendation engine. |
| Category | Broad governed classification such as Healthcare, Food & Hospitality, Manufacturing, Engineering, Marketing, or Supply & Distribution. | Must not become a flat uncontrolled string. |
| Subcategory | Narrower governed leaf such as Doctor, Restaurant, Water Factory, Civil Engineer, Digital Marketer, or Food Supplier. | Must be an active child in the canonical Category authority. |
| Service | Specific public offering such as consultation, catering, structural design, or wholesale supply. | Must not imply ordering, payments, commissions, inventory, or transactions. |
| Provider / Business Profile | Public profile for an approved business, professional, supplier, partner, representative, or broker. | Must separate public profile data from private owner/user data. |
| Location | Structured country, city, area, and service coverage context. | Must avoid dependency on free-text location only. |
| Trust Information | Moderation and verification signals suitable for public discovery. | Must not become paid ranking, advertising, or marketplace eligibility. |

## Homepage Discovery Concept

The homepage implements search and grouped canonical category browsing while preserving V1 simplicity and avoiding marketplace or social-feed behavior. Other sections below remain conditional on their own approved data and contracts.

Potential future sections:

- Search.
- Categories.
- Services around user.
- New businesses in area.
- Popular service categories.
- Professional knowledge.
- Shared Khedmah content.

### Homepage Guardrails

- Search should be a clear entry point, not an AI recommendation system.
- Categories should guide users into governed taxonomy paths.
- Services around user should depend on explicit location permission, selected location, or non-private local preference after governance approval.
- New businesses in area should mean recently approved public profiles, not paid placement.
- Popular service categories should be based on approved analytics definitions only after governance approval and must not become paid ranking or advertising.
- Professional knowledge and shared Khedmah content must remain educational or discovery-supportive, not a social network or chat system.

## Search Foundation

Implemented V1 search capabilities include:

- Keyword search.
- Category filtering for Business Profiles and Service Listings.
- Location filtering.
- Recursive root/leaf category filtering.

Professional Profiles use their separate keyword-and-location endpoint in V1. Their implemented data contract has no Category relationship, so the Professional tab must hide and clear the Category filter; the combined Category query does not include Professional results.

Service Listings do not duplicate a location field. City filtering derives the governed city from the eligible public owner: the Business Profile city for a Business-owned listing or the Professional Profile city for a Professional-owned listing. The dedicated Service endpoint and combined discovery endpoint apply the same rule.

Service-type and Business-type filters remain future decisions.

The current search implementation uses validated existing API contracts, Arabic/English category-lineage aliases, governed visibility, and bounded result projections. Any replacement index or new search infrastructure still requires explicit privacy, abuse, audit, and language governance.

### Search Architecture Expectations

- Arabic search terms must be first-class.
- Search inputs must be validated and rate-limited when implemented.
- Search results must expose only approved public business profile data.
- Search must respect trust and moderation visibility.
- Search must not expose private user data, private owner data, moderation internals, or abuse-detection internals.
- Search must not create ranking, advertising, paid promotion, AI recommendation, marketplace, ordering, payment, or commission behavior in V1.

## Business Discovery Compatibility

### `business_profiles`

Public discovery reads approved public Business Profiles under the existing ownership, moderation, visibility, taxonomy, location, and trust boundaries. A profile is not an orderable product listing or a chat identity.

### Categories

Discovery depends on governed categories and subcategories. Categories should align with the Universal Business & Service Taxonomy Model and should support multiple dimensions where needed, including business type, category, subcategory, and service.

### Locations

Discovery requires structured locations that can support country, city, area, and service coverage. Location records should distinguish public address information from private owner or operational data.

### Service Taxonomy

Discovery keeps Service Listings separate from category records. Existing listings reference an approved leaf; categories themselves are not services or products.

### Trust Foundation

Discovery must use trust and moderation state to determine profile visibility and public trust information. Trust signals must be clear, privacy-aware, and governance-controlled. They must not be used as paid placement, advertising, ranking, or recommendation mechanics.

## User Personal Experience Compatibility

Future user experience may become compatible with:

- Recent services.
- Favorite providers.
- Previous interactions.
- Local area preferences.

This blueprint does not implement personalization. Future compatibility must preserve privacy, user control, and Arabic-first accessibility. Any saved preference, favorite, or interaction history must require approved contracts for consent, retention, data access, deletion, and security.

### Personal Experience Guardrails

- Recent services must not expose private activity publicly.
- Favorite providers must be user-controlled and private by default.
- Previous interactions must not become messaging/chat or social networking.
- Local area preferences must avoid precise-location overcollection.
- Personal experience must not become AI recommendations without future governance approval.

## Sharing Compatibility — `أنا مع خدمة`

The Khedmah Digital Sharing Identity, `أنا مع خدمة`, is compatible with future sharing of:

- Professional articles.
- Business profiles.
- Services.
- Local discoveries.

Sharing must remain a brand/community expression and discovery-supportive identity. This blueprint does not create social network features, feeds, comments, followers, private messages, chat, reactions, creator monetization, paid promotion, ranking, or AI content recommendations.

### Sharing Guardrails

- Shared content should link back to approved public information only.
- Private user data, owner data, and moderation data must not be embedded in shared content.
- Sharing should preserve Arabic-first labels and right-to-left presentation.
- Shared Khedmah content must not create a marketplace, social graph, or messaging system.

## Location Model

The future discovery location model should follow this structure:

```text
Country
↓
City
↓
Area
↓
Service Coverage
```

### Location Principles

- Country, city, and area should be governed values, not uncontrolled free text.
- Service coverage should be separate from physical address.
- Headquarters, branch, public address, and service coverage should not be collapsed into one field.
- Users should be able to browse by selected country, city, or area without requiring precise geolocation.
- Location display must be privacy-aware and avoid exposing private addresses or owner data.
- Cross-border discovery and representative territories should remain future governed scope.

## Security Review

This blueprint does not include secrets, credentials, private user data, production URLs, production infrastructure values, tokens, keys, or passwords. Future implementation must continue to separate public business data from private user, owner, moderation, analytics, and security data.

## Architecture Decisions

1. Define public discovery as search and browse over approved public profile information, not as a marketplace.
2. Align discovery with the taxonomy hierarchy of need, category, subcategory, service, provider profile, location, and trust information.
3. Keep homepage discovery simple and section-based for V1 readiness.
4. Treat search as a future governed capability, not an implemented engine.
5. Require compatibility with business profiles, categories, structured locations, service taxonomy, and trust foundation before implementation.
6. Keep personal experience compatibility future-facing and privacy-governed.
7. Preserve `أنا مع خدمة` as sharing identity without social network behavior.
8. Require structured country, city, area, and service coverage rather than free-text-only locations.

## Risks

- Implementing discovery before business profile, category, location, service, and trust contracts are approved could cause rework.
- Free-text categories or locations would weaken search, moderation, and Arabic-first consistency.
- Homepage sections could accidentally become advertising, ranking, or recommendations if guardrails are ignored.
- Personal experience features could expose private behavior if not governed by consent and retention rules.
- Sharing features could drift into social networking, chat, or paid promotion without strict boundaries.
- Trust information could be misused as ranking or paid visibility unless explicitly governed.

## Explicit Exclusions

This blueprint does not authorize or implement:

- Production features.
- APIs.
- Database models.
- UI screens.
- Marketplace.
- Payments.
- Ordering.
- Messaging/chat.
- Commissions.
- Advertising.
- Ranking.
- AI recommendations.
