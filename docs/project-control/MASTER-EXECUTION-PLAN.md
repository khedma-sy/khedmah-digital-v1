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
- Current Cloud SQL runtime/migration `databaseRoles` are known.
- Workflow state machine accurately models the valid live state.
- Regression tests cover the discovered state.
- No Production mutation is performed during diagnosis.

## Phase 1 — Complete GitHub + Production database path
### 1A Database role cutover gates
- Reconfirm current main.
- Reconfirm latest system-role manifest.
- Reconfirm Secret Manager IAM for canonical deployer.
- Create/verify fresh on-demand backup immediately before mutation.
- Run PREPARE only after the above gates are green.
- Verify isolation.
- Re-run INVENTORY and compare manifest.
- Confirm migration secret active alias points to the final verified version.

### 1B Schema production
- Execute migrations 025 through 034 in strict order.
- Respect each migration's exact SHA/confirmation/backup gates.
- Verify canonical schema after 034.

### 1C Hardening and release
- HARDEN only after schema prerequisites are satisfied.
- Production readiness / operator VERIFY_ONLY.
- DEPLOY_PRODUCTION only after all gates close.
- Bootstrap admin.
- Smoke, acceptance, security, and rollback verification.

### 1D Repository hygiene
- Resolve/close superseded PR #247.
- Audit old draft #172; salvage only still-relevant feature concepts into a fresh branch if required.
- Remove stale execution assumptions from handoff docs.
- Maintain `CURRENT-STATE.md` as the compact live checkpoint.
- Full root/backend/frontend test matrix green.

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
- Apply final visual identity from centralized brand tokens/assets.
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
