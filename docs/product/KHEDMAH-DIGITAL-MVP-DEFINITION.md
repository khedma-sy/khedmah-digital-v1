# Khedmah Digital MVP Definition

**Status:** Approved scope baseline  
**Authority:** Council directive — 2026-07-27  
**Version:** 1.1
**Product direction:** Arabic-first business growth platform  
**Scope rule:** Capabilities not explicitly listed as required below are not part of MVP.

**Approved amendment — 2026-08-29:** MVP-09 authorizes only the bounded canonical category and discovery slice defined below. It does not authorize transactional delivery, marketplace, or any other reserved capability.

## 1. Purpose and Authority

This document is the authoritative definition of the Khedmah Digital MVP. It converts the repository from an ambiguous “foundation-only” description to a bounded delivery baseline while preserving all security, governance, Arabic-first, and reserved-module restrictions.

Approval of this definition approves **scope**, not Alpha release and not production deployment. Every required capability must still pass its acceptance criteria and the release gates in section 7.

## 2. MVP Product Outcome

The MVP must let an Arabic-speaking user establish and access a basic account, maintain a basic personal profile, discover approved providers through a canonical Arabic-first category hierarchy and governed location/search filters, and submit or record a privacy-safe contact interaction with an eligible public business. Existing organization data remains compatibility scope while its retired user-facing journey is not restored by this amendment. The platform may record a minimal allowlisted set of operational events needed to evaluate these journeys. Supporting health, configuration, persistence, migration, security, and audit controls are part of the MVP technical boundary.

The MVP is not a marketplace, social network, job-execution engine, payment system, or market-intelligence product.

## 3. Required MVP Capabilities and Acceptance Criteria

### MVP-01 — Platform Health and Safe Configuration

**Required function**

- Expose one versioned health endpoint.
- Load only approved environment, port, version, and service-name settings with safe defaults.
- Attach request and correlation identifiers and return safe errors without internal details.

**Acceptance criteria**

1. `GET /api/v1/health` returns HTTP 200 and only `status`, `timestamp`, and `version`.
2. Unsupported environment and port values fall back to documented safe defaults.
3. Error responses contain no stack, credential, token, database URL, or private payload.
4. Build, health integration tests, and configuration tests pass in clean CI.

### MVP-02 — Account, Authentication, Session, and Basic Profile

**Required function**

- Register an account with a basic profile.
- Log in and log out.
- Resolve and revoke a server-managed session.
- Read the authenticated user and update the approved basic profile fields.

**Acceptance criteria**

1. Registration validates display name, normalized email, and the approved minimum password length.
2. Passwords are stored only as salted hashes; session tokens are stored only as hashes and are never logged.
3. Login returns a generic failure for invalid credentials and creates a bounded, revocable session for valid credentials.
4. Protected current-user/profile operations reject absent, invalid, expired, or revoked sessions.
5. Duplicate account identifiers and unapproved fields are rejected safely.
6. Data survives process restart in the approved persistence implementation before Alpha.
7. Arabic-first registration, login, and basic-profile journeys have loading, validation, error, and accessible focus states.

### MVP-03 — Basic Organization and Membership Management

**Required function**

- Create a basic organization.
- List organizations available to the authenticated user.
- Read and update an authorized organization.
- List, add, update, and remove basic organization memberships under owner/role controls.

**Acceptance criteria**

1. Every organization has one authorized owner reference and validated approved fields.
2. Only an authorized owner/member can access or mutate protected organization data.
3. Membership operations reject duplicates, invalid roles, self-conflicting ownership, and unauthorized changes.
4. Organization and membership data survive process restart and preserve referential integrity.
5. List and membership access are bounded and have an approved pagination/limit rule before Alpha.
6. Arabic-first list, create, detail, and membership journeys expose loading, empty, validation, error, and success states.

### MVP-04 — Controlled Business Contact Interaction

**Required function**

- Accept a validated inquiry for an eligible, approved, public business profile.
- Record a privacy-safe contact intent such as a contact click.
- Apply basic abuse and rate-limit controls.

**Acceptance criteria**

1. Hidden, suspended, missing, or unapproved business profiles cannot receive a successful interaction.
2. Inquiry payloads accept only approved fields and never expose private business or user data in receipts.
3. Rate-limited requests return HTTP 429 with a safe response.
4. Abuse and rate-limit state is enforceable across process instances before Alpha, or an explicit time-bound Alpha exception is approved.
5. Inquiry and contact-intent evidence persists and contains request/correlation references without credentials or private profile snapshots.
6. Unit and endpoint-level tests cover success, validation, privacy, eligibility, abuse, and rate-limit outcomes.

### MVP-05 — Minimal Operational Analytics Intake

**Required function**

- Accept only the four current MVP operational events: `business_view`, `search_action`, `contact_click`, and `inquiry_submitted`.
- Record only approved entity references and privacy-safe metadata.

**Acceptance criteria**

1. Any event type, entity type, or metadata key outside the allowlist is rejected.
2. No credential, free-form private profile, personal tracking history, fingerprint, or precise private location is stored.
3. Accepted event records persist, are auditable, and have a documented retention rule before Alpha.
4. This capability exposes no ranking, scoring, recommendation, market-intelligence, or user-profiling output.
5. Tests cover allowlist, rejection, privacy, and safe-receipt behavior.

### MVP-06 — Arabic-First RTL Experience

**Required function**

- Provide Arabic-first RTL presentation for MVP-02 and MVP-03, plus global loading/error foundations.

**Acceptance criteria**

1. Root document language is Arabic and direction is RTL.
2. Every required form has labels, keyboard focus, validation, loading, error, and success/empty handling where applicable.
3. Frontend pages call approved backend contracts before Alpha; timer-only simulated submission is not accepted as completed behavior.
4. A browser-level smoke test covers the critical registration/login/profile/organization journey in the Alpha candidate environment.
5. Shared First Load JS remains measured and any agreed performance budget is met.

### MVP-07 — Persistence and Reversible Data Change

**Required function**

- Persist only the data required for MVP-02 through MVP-05.
- Maintain one authoritative, ordered, reversible migration lineage.

**Acceptance criteria**

1. The council-approved migration authority is the only path used by CI and runtime deployment.
2. Forward and rollback operations succeed on a clean temporary PostgreSQL database.
3. Foreign keys, uniqueness, lifecycle, visibility, and ownership constraints match the approved contracts.
4. No marketplace, payment, commission, tracking, or reserved-module table is created.
5. Credentials, raw session tokens, production URLs, and secrets are absent from SQL and seed data.
6. Runtime repositories use the approved persistence path rather than process-local `Map` storage before Alpha.

### MVP-08 — Internal Audit Evidence

**Required function**

- Produce internal evidence for security- and lifecycle-relevant outcomes of MVP-02 through MVP-05.

**Acceptance criteria**

1. Events use the approved uppercase naming catalog or an explicitly mapped runtime catalog.
2. Evidence includes timestamp, result, resource reference, and request/correlation reference where available.
3. Evidence excludes password, session token, credentials, full private payloads, and unnecessary personal data.
4. Audit is separated from analytics, application logging, authorization, and personal tracking.
5. Required evidence persists and can be retrieved for an authorized operational review before Alpha.

### MVP-09 — Canonical Category Discovery

**Required function**

- Maintain one Arabic-first canonical root/leaf Category authority for Business Profiles and Service Listings.
- Let users discover approved public businesses and services by keyword, governed location, and root or leaf category. Professional discovery remains a separate keyword-and-location search until a governed professional-category relationship is approved and implemented.
- Present the hierarchy consistently on Web and Android without a flat, random, or single-category primary surface.

**Acceptance criteria**

1. The governed catalog contains 15 active roots and 99 active leaves; new or changed owner category selections accept active leaves only, while an unchanged preserved legacy reference does not block unrelated edits.
2. Root discovery recursively includes descendants, and keyword matching includes Arabic and English aliases from category lineage.
3. Web and Android consume `parentCode`; the primary category surface displays roots and exposes leaves within their selected root.
4. Migration 022 is ordered, checksum-bound, and reversible. Its forward path preserves legacy references; rollback restores the exact pre-022 catalog by deleting unreferenced post-snapshot rows and aborts before mutation when a post-snapshot category is referenced.
5. Search results continue to enforce existing public visibility and moderation rules and expose no private or internal fields.
6. Category names, aliases, hierarchy, product documentation, contract documentation, and cross-client tests change together.
7. The Web search surface must not show or retain a Category filter on the Professional tab; the combined Category search returns Business Profiles and Service Listings only.

## 4. Explicitly Excluded from MVP

The following are prohibited MVP additions:

- Marketplace, seller storefront, products, inventory, orders, carts, checkout, payments, commissions, subscriptions, invoicing, advertising, or paid ranking.
- Delivery ordering, dispatch, fulfillment, worker/user/device/GPS tracking, or behavioral tracking. Provider discovery under the `Delivery & courier` category is allowed by MVP-09.
- Social feeds, public posts, comments, likes, reactions, follower graphs, or direct social messaging.
- Automated ranking, recommendation, trust score, credit score, competitor comparison, data brokerage, or advanced market intelligence.
- Production infrastructure creation, new external integrations, or sector-specific flows not required by MVP-01 through MVP-08.
- New public APIs, screens, database tables, or workflows for a reserved capability outside MVP-09.

## 5. Deferred Until After MVP

These recognized directions remain documentation-only and are not included in MVP completion:

- Khedmah Connect ecosystem/network execution.
- `أنا مع خدمة` as a future-facing brand/community expression.
- Job Work execution and worker lifecycle.
- Khedmah Sharing beyond the minimal privacy-safe operational events in MVP-05.
- Partner and representative network execution.
- Full service catalog, geographic coverage, relationship, trust-verification, professional-profile, business-profile, public-discovery, and business-search workflows beyond the bounded MVP-09 category/search journey.
- Advanced analytics and market intelligence.

## 6. Current Implementation-to-Documentation Conflicts

| Conflict | Verifiable evidence | Required resolution |
| --- | --- | --- |
| Root README says the repository is foundation-only and contains no implementation. | Runnable NestJS and Next.js workspaces exist under `apps/`; this definition now authorizes only the bounded MVP baseline. | Update README and current scope documents to point to this definition. |
| Previous V1 Scope excluded all backend, frontend, API, and migration implementation. | Runtime controllers/pages and SQL already exist. | This approved definition supersedes the foundation-only product boundary; retain the old foundation phase as history. |
| Canonical foundations under `backend/` and runtime under `apps/backend/` do not share one declared implementation authority. | Both trees contain overlapping identity, organization, contact/analytics, and adapter concepts. | Architecture decision must name runtime authority and adapter obligations before Alpha. |
| SQL exists in both `backend/migrations/versions` and `infra/database`. | Both paths contain numbered SQL with different lineages. | Council must select one migration authority before any new migration or Alpha data gate. |
| Runtime repositories use process-local Maps while migration documents imply physical persistence readiness. | Identity, organization, contact, analytics, and rate-limit services keep process-local state. | Wire only approved MVP repositories to the chosen persistence path and test restart/multi-instance behavior. |
| Frontend forms use timer-driven simulated outcomes. | Identity/organization pages use `window.setTimeout` rather than approved API integration. | Integrate only the existing MVP journeys; do not add pages or capabilities. |
| Historical reports claim production readiness. | Current audit contains critical/high findings and no central remote/CI evidence is available locally. | Treat the latest council gate report as authoritative and label historical reports superseded. |

## 7. MVP Release Gates

MVP scope completion and Alpha readiness are separate decisions. An Alpha candidate requires all of the following:

1. Clean `npm ci`, build, and test run in authoritative CI.
2. Zero critical and zero high production-dependency vulnerabilities, unless the council approves a named, time-bounded exception.
3. All MVP-01 through MVP-08 acceptance criteria are met or carry a named Alpha exception.
4. One migration authority and successful temporary-database forward/rollback evidence.
5. No process-local persistence for required account, organization, contact, analytics, audit, session, abuse, or rate-limit state unless explicitly accepted for Alpha.
6. Arabic RTL browser smoke coverage for the critical MVP journey.
7. Documentation, contracts, runtime routes, and the MVP dashboard agree on scope and status.
8. No excluded or deferred capability is implemented as part of MVP closure.

## 8. Change Control

Changing required, excluded, or deferred capabilities requires a council-approved revision to this document and corresponding updates to V1 scope, backlog, architecture, acceptance criteria, dashboard, and release gates. Passing tests, an implementation commit, or a historical report cannot expand MVP by itself.
