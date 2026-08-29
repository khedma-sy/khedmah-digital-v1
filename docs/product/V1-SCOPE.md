# V1 Scope

## Product Direction

Khedmah Digital V1 is an Arabic-first business growth platform. Its first delivery boundary is the formally approved [Khedmah Digital MVP Definition](KHEDMAH-DIGITAL-MVP-DEFINITION.md).

## Current Authority

The documentation-foundation phase remains the historical prerequisite for implementation. The council directive dated 2026-07-27 and the bounded MVP-09 category amendment dated 2026-08-29 authorize the current MVP definition; they do not authorize capabilities outside that definition.

Where an older foundation report or placeholder statement conflicts with the MVP definition, the MVP definition is authoritative for current product scope. Governance, security, architecture, and release gates remain mandatory.

## In Scope for MVP

- Platform health and safe runtime configuration.
- Account registration, login, logout, session lookup, and the authenticated user's basic profile.
- Organization creation, owned-organization access, basic updates, and controlled membership management.
- Public-business contact inquiry and contact-intent recording with validation, privacy, abuse, and rate-limit boundaries.
- A minimal allowlisted operational analytics-event intake for MVP measurement only.
- Arabic-first RTL user interfaces for the approved identity and organization journeys.
- Persistence and reversible migrations needed only by the approved MVP capabilities.
- Internal audit evidence required to support those capabilities.
- Canonical Arabic-first Category authority, root/leaf browsing, category-filtered Business Profile and Service Listing discovery, separate keyword/location Professional discovery, and consistent Web/Android hierarchy presentation defined by MVP-09.
- Moderated classifieds tied to approved Business Profiles, capped at five images, with direct seller contact and no cart, checkout, or payment handling.
- Location-based discovery of approved taxi and delivery providers with direct contact; no internal dispatch, assignment, tracking, pricing, or payment workflow.
- Arabic routing assistant and optional browser speech-to-text without platform-side audio storage.

Acceptance criteria and exact exclusions are defined only in the linked MVP definition.

## Out of Scope for MVP

- Orders, inventory, cart, checkout, payments, commissions, paid ranking, internal dispatch, assignment, or tracking. Moderated classified listings and provider discovery remain informational/direct-contact features only.
- Social-network behavior, feeds, comments, reactions, or individual behavioral tracking.
- Advanced market intelligence, scoring, recommendations, competitor analytics, or sale of data.
- New sector-specific workflows, production infrastructure, or integrations not explicitly listed in the MVP definition.

## Deferred After MVP

- Khedmah Connect.
- The `أنا مع خدمة` future brand/community expression.
- Job Work execution workflows.
- Khedmah Sharing as a broader sharing/community capability.
- Partner and representative network execution.
- Advanced discovery, trust verification, service catalog, locations, relationships, and professional/business profile workflows beyond the bounded category/search capability approved in MVP-09.

## Scope Protection

Deferred and excluded capabilities must remain documentation-only until a later council directive changes this source of truth. No backlog item, architecture note, test placeholder, or historical report independently authorizes implementation.
