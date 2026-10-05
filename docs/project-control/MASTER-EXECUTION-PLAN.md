# Khedmah Digital — Master Execution Plan

## Objective
Finish the existing GitHub/Google Cloud Production path first, prepare Google services for the next application layer, migrate the user experience to Floot without moving Production database/infrastructure secrets, and then complete final product, AI, SEO, quality, and launch work in Floot.

## Governing architecture
- GitHub: source of truth, code review, CI/CD, infrastructure definitions, production evidence.
- Google Cloud: backend, Cloud SQL, IAM/WIF, Secret Manager, storage, runtime infrastructure.
- Cloudflare: authoritative DNS for `khedmah.uk`.
- Floot: target application experience layer, AI/voice integrations, web frontend, and selected server-side adapters.
- Floot must call Khedmah APIs over HTTPS; it must not receive Cloud SQL passwords or Production service-account credentials.

## Phase 0 — Production incident/state reconciliation
Exit criteria:
- Failed PREPARE run `37183178537` is fully explained.
- Distinguish the observed blank Cloud SQL `databaseRoles` metadata from the still-unverified live PostgreSQL memberships; blank is not proof of any privilege state.
- Workflow state machine accurately models the valid live state.
- Regression tests cover the discovered state.
- No Production mutation is performed during diagnosis.

## Phase 1 — Complete GitHub + Production database path
### 1A Database role cutover gates
- Current source prerequisite: PR #250 is merged; resume [metadata-only reconciliation](PRODUCTION-RECONCILIATION.md), following [NEXT-ACTION.md](NEXT-ACTION.md).
- Reconfirm current main.
- Reconfirm latest system-role manifest.
- Reconfirm Secret Manager IAM for canonical deployer.
- Establish actual PostgreSQL memberships and credential continuity; blank Cloud SQL role metadata and enabled versions are insufficient.
- Create/verify fresh on-demand backup immediately before mutation.
- Independently review backup/PITR/restore suitability. The role workflow has no automatic backup gate and rotates the transition credential before the later prepare SQL compares the actual manifest.
- Run PREPARE only after the above gates are green and explicit owner authorization is present.
- Verify isolation.
- Re-run INVENTORY and compare manifest.
- Confirm migration secret active alias points to the final verified version.

### 1B Schema production
- First establish the installed Production schema and prior execution evidence. Repository files and successful Preview tests do not prove Production application.
- For a proven fresh database only, initialize the governed 001–020 baseline after role isolation; never rerun initialization against an already populated database as a shortcut.
- Establish completion of 021 (`021_provider_reports`), 022 (`022_expand_category_taxonomy`), and 024 (`024_product_store`) through the separate Production Schema Operator.
- Version 023 is intentionally unused. Do not invent a 023 migration or interpret its absence as an error.
- Only after those prerequisites are proven, execute the missing migrations 025 through 034 in the governed order, one approved migration per operation.
- Respect each migration's exact SHA/confirmation/backup gates.
- Verify canonical schema after 034.
- Detailed source mapping and unresolved live gates: [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md).

### 1C Hardening and release
- HARDEN only after schema prerequisites are satisfied.
- Select verification by exact workflow and mode: schema-operator `VERIFY_ONLY` is not a database-schema certificate; new-account `VERIFY_ONLY` is not the `verify-hardened` predeploy job.
- Production readiness / new-account operator VERIFY_ONLY, plus separately proven role/schema hardening evidence.
- DEPLOY_PRODUCTION only after all gates close and explicit owner authorization; retain the built-in predeploy `verify-hardened` job.
- Bootstrap admin.
- Smoke, acceptance, security, and rollback verification.

### 1D Repository hygiene
- PR #247 closed as superseded by #248; preserve the decision record.
- PR #172 closed after requirements salvage; do not restore its obsolete migration number or merge the old branch wholesale.
- Remove stale execution assumptions from handoff docs.
- Maintain `CURRENT-STATE.md` as the compact live checkpoint.
- Synchronize the original roadmap entry point required by `AGENTS.md` with these control documents in the same change; do not leave competing next-action instructions.
- Full root/backend/frontend test matrix green on the exact candidate SHA.

## Phase 2 — Google readiness for the new experience layer
Exit criteria: Google services are ready for `khedmah.uk`, the Floot frontend, and the existing backend without weakening current IAM.

Workstreams:
- Domain architecture: `khedmah.uk`, `www.khedmah.uk`, `api.khedmah.uk`; optional `admin`/`media` only when needed.
- Cloudflare DNS plan with staged cutover and rollback.
- Google OAuth branding, authorized origins, redirect URIs, privacy/terms/support URLs.
- Firebase web configuration and authorized domains.
- Maps/Places/Routes keys separated by use case and restricted by API + referrer.
- Gmail/Calendar/Drive only with least-privilege scopes and contextual consent.
- Secret Manager inventory and explicit "never copy to Floot" list.
- Monitoring, alerting, quotas, budgets, and audit-log verification.
- Google Play/Data Safety/account deletion readiness for Android when applicable.

## Phase 3 — Floot migration
Use [the contract findings backlog](../floot-migration/IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) to select bounded implementation/acceptance work. [Media/Classifieds ownership and moderation](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md) is source mapping; its unresolved findings are not certified behavior.

### 3A Foundation
- Floot paid plan that supports the required build volume/custom domain.
- Khedmah application shell, RTL, routing, design tokens, approved brand assets.
- Environment/config contract.
- API client and error model.
- Auth/session bridge to the existing Khedmah backend.

### 3B Migration order
1. Categories, search, locations.
2. Business/professional profiles.
3. Classifieds + media + moderation.
4. Restaurants/products/cart/orders/promotions.
5. Courier operations.
6. Taxi request/planning/pricing/driver onboarding/admin.
7. Admin/operations dashboards.
8. AI assistant.
9. Voice/interview agent.

### 3C Security boundary
Floot may receive only credentials required for services it directly calls, such as AI/voice or a dedicated Maps browser key. It must not receive:
- Cloud SQL Production password.
- Terraform credentials/state write authority.
- Production deployer/migrator service-account credentials.
- unrestricted Google API keys.

## Phase 4 — Floot finalization
- Apply the existing approved visual identity from centralized brand tokens/assets; this is not a redesign request.
- Responsive/mobile QA.
- Accessibility/RTL QA.
- Performance and Core Web Vitals.
- Technical SEO: metadata, canonical URLs, sitemap, robots, structured data where appropriate.
- Analytics/consent/privacy implementation.
- Error/empty/loading/offline states.
- Security review, rate-limit/API abuse checks, and session edge cases.
- End-to-end journeys for customer, business, restaurant, courier, driver, moderator, and admin.
- UAT on Floot preview before custom-domain cutover.

## Phase 5 — Domain cutover and launch
- Keep Cloudflare as DNS control plane.
- Point `khedmah.uk` and `www.khedmah.uk` to Floot only after acceptance.
- Point `api.khedmah.uk` to the approved Google Cloud production edge.
- Update CORS, cookies, CSRF origins, OAuth redirects, Firebase authorized domains, and Maps restrictions.
- Validate TLS, login, uploads, classifieds, food orders, taxi non-live behavior, and admin.
- Maintain rollback target until launch acceptance passes.

## Product launch gates
- `TAXI_TRIPS_ENABLED` remains false until operational, legal, driver, pricing, monitoring, and incident-response gates are explicitly approved.
- Electronic payments remain disabled until provider/webhook/settlement/reconciliation contracts are production-ready.
- AI autonomous high-impact actions require owner/admin approval boundaries.

## Program-level definition of done
A release is not "done" because the UI renders. It is done only when:
- Source/infra state is documented.
- CI and production gates are green.
- Authentication and authorization are proven.
- Critical user journeys pass end to end.
- Privacy/Google disclosures match actual data flows.
- Domain and rollback are verified.
- Production monitoring can detect and diagnose failures.
