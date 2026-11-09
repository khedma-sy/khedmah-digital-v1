# Khedmah Digital — Independent Release Readiness / EXPOSE + AUTOPSY + IQ200 + KILLCRITIC
**Evidence time:** 2026-11-06 UTC. **Verdict:** NO-GO for an end-to-end production release. **No production mutation was performed.**

## 2026-11-07 owner-reported Google login acceptance update

The owner reported successfully signing in with Google on 2026-11-07. This is **one owner-reported positive runtime acceptance signal**, not an independently captured OAuth/session trace. It supersedes treating Google login as uniformly unavailable for this user's tested attempt, but does **not** establish a general fix, session persistence, cross-device success, verified admin-role authorization, logout/re-login safety, or runtime image/source parity. Keep the release gate **OPEN** pending authenticated acceptance receipts and correlated service logs. Do not reset Preview scaling, migrate the database, publish Floot, or change Production solely on this report.

GitHub main and review/CI status must be refreshed directly before any merge or release. Floot public UI and preview sources are managed separately from the Next.js repository; do not equate file presence in one with a deployed fix in the other.

## 0. Evidence standard and important limitations
This document distinguishes (a) repository source and CI, (b) Floot editor/preview source, tests and read-only Floot DB state, (c) real anonymous HTTP probes of public sites and the Google Cloud Run Preview health endpoint, and (d) dated Google Cloud evidence captured in GitHub Actions. A successful page GET, health response or mock/unit test is NOT an authenticated end-to-end journey or a checked production deployment.

No authenticated Google Cloud console, Cloud SQL, Firestore, IAM, monitoring or deployment comparison was available to this review. No authenticated buyer/merchant/courier/driver/admin browser sessions were exercised. Floot editor was not open for a desktop/iPhone screenshot; a separate browser automation attempt was unavailable. Site-wide manual UI/visual and accessibility certification remain outstanding.

## 1. Source-of-truth: GitHub
- Repository: https://github.com/khedma-sy/khedmah-digital-v1
- Verified main SHA: **cc8d49809cb9543ee1620432d9c0ba73fb801cbb**. Main Node.js CI 42049716098 and Khedmah Test & Verify 42049716046 both succeeded on this SHA. Source/CI success does not establish a deployment.
- Seven OPEN DRAFT PRs, all exact-head CI workflows completed successfully as observed:
  - #344 Google login scaling-only recovery, SHA 54b91a90, merge state BEHIND; validations do NOT execute recovery.
  - #346 Android legal/deletion links, SHA 247d95cf, BEHIND; Android Debug Build / Google readiness source checks passed, not Play release certification.
  - #348 professional Smart Admin, SHA c95b56b2, CLEAN; five files, planning and canonical state/evidence fingerprint with transactional comparison, no activated executor.
  - #349 account/courier workflow audit/navigation, SHA 74ad6beb, CLEAN; not merged.
  - #350 home discovery/UX, SHA 858c3bbd, CLEAN; not merged.
  - #351 professional onboarding progressive disclosure, SHA 1f210bf7, CLEAN; not merged.
  - #352 project checkpoint, initial SHA 55323ef2, CLEAN at the check, docs-only; this report extends it.
- **0 of the seven** are merged into main. They are not evidence of production repairs.
- Main docs/project-control/CURRENT-STATE.md and NEXT-ACTION.md are very large accumulated histories and start with a 2026-11-02 checkpoint about PR #333 and an older main SHA. The open docs PR #352 is not yet main. Always resolve live main/PRs/Actions before each cycle.

## 2. Google Cloud / environment provenance
- Direct anonymous GET to the exact Cloud Run origin hard-coded in Floot, [Preview Cloud Run frontend origin]/api/v1/health, returned HTTP **200**, status **ok**, version **preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a**. GET session without a cookie returned HTTP 401, which is correct for an anonymous request and is NOT proof that authenticated Google sign-in is failing.
- The PUBLISHED Floot endpoint [published Floot custom domain]/_api/integrations/khedmah_preview_health returned HTTP 200 with **connected=true**, target **khedmah-preview-v2**, and the SAME advertised preview version. Floot source helpers/khedmahAdapterSecurity.tsx hard-codes the PR-274 Preview Cloud Run origin. Thus the public app is definitely integrated with a Preview-designated target, not a separately evidenced production backend.
- This runtime version label does not establish a content-addressed mapping to GitHub main cc8d4980, nor does it prove PR #348 or the seven drafts are deployed. Require immutable image digest/source SHA, revision and traffic receipt for every serving service before any GO verdict.
- Latest inspected read-only Preview V2 release gate: GitHub Actions run https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/41710857994 (2026-11-03) FAILED at known writer services. Error: **STOP: KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT**. khedmah-pr-274-frontend was not demonstrably manual-zero; scaling mode/manual_instances were MISSING_OR_UNKNOWN in two reads. The gate explicitly reported writer_quiescence_verified=false, database_checked=false, external_writer_sources_checked=false and release_authorized=false. This is a failed gate, not a detected database corruption.
- No fresh authenticated direct inventory of Cloud Run revisions, Cloud SQL schema/roles, Firestore collections, IAM, CI/CD service accounts, scheduled writers or alerts was made. These unknowns remain P0 gate blockers.

## 3. Floot UI and runtime smoke tests
- Project خدمة ديجتل, id 5e271f43-96a6-40de-a634-ec3eae023a49; working editor version **1793989505581**. Last published Floot code reported **2026-11-04 00:01 UTC**, hence preview changes are not automatically production.
- Inventory: **346 page-related files** (including layouts/styles; NOT 346 independent navigable pages), **58 integration adapter files**, **138 test specifications**.
- TypeScript typecheck clean. All **138/138 Jasmine spec files passed, 0 failed** in seven 20-file batches (last 16) and the two separately run hook specs. These are source/component/fixture tests, NOT browser and authenticated transaction coverage.
- Anonymous GET smoke: public khedmah.uk /platform, /platform/account, /platform/admin, /platform/admin/reviews, /platform/professional-manage, /platform/professionals, /platform/store, /platform/restaurants, /platform/taxi, /platform/orders, /business and /smart-admin each returned HTTP 200 HTML. Floot-hosted /platform and /business also returned 200; root paths redirect 301 to /platform. HTTP 200 is page availability only.
- Published GET /_api/integrations/khedmah_session and /_api/integrations/khedmah_admin returned 401 anonymously, as expected. Published GET /_api/business/tender?tenderId=1 returned 401; public /_api/public/tenders returned 200. Thus no unauthorized private tender data was exposed in these tests; it does NOT certify all route-level permissions.
- Floot approval endpoint returns 503/not_applied for authenticated attempts when helpers/khedmahApprovalExecution.tsx has enabled=false. This is an intentional safety hold.
- Current Floot review routes, sign-in, orders, taxi and business UI exist; visually rendered desktop/mobile workflows and multi-role sessions were not audited, because the user's Floot editor/preview window was not open for screenshot capture.

## 4. Critical differences / P0 release blockers
| ID | Evidence | Practical impact | Required acceptance |
| --- | --- | --- | --- |
| P0-01 | Public Floot targets Google Cloud Run Preview V2 and reports an older f4-labeled revision, while main and PRs differ | Source/runtime parity is NOT certified, contracts may differ; provenance and environment isolation are unresolved | Immutable source→image→revision→traffic receipt and reviewed target environment before any release |
| P0-02 | Preview V2 read-only release gate failed; writer quiescence and DB state not verified | A safe production transition/migration cannot be certified | Fresh read-only gate, independent writer/service inventory, schema verification, permission and backup checks |
| P0-03 | Google redirect/session has source and adapter code, but no authenticated cross-device end-to-end receipt | Accounts may not be able to sign in consistently; 200 health and 401 anonymous session are insufficient | Authorized iPhone/desktop Google login→session→refresh→reopen, correlated backend logs, admin/ordinary role checks |
| P0-04 | Floot approval execution disabled. PR #348 canonical state+evidence SHA contract exists only as draft; real credential resolver and trusted policy assessor not connected | No auto-approval; enabling early could compromise trust and safety | Least-privilege independently authenticated service principal, canonical policy checks, transactional consistency, audit and E2E roles |
| P0-05 | PR #348 writer checks a content fingerprint while holding parent row, but comprehensive audit of **all** media and service mutation paths plus phantoms/indirect writers is unfinished | Some child writes could escape the intended parent-lock protocol and invalidate a decision | Audit/patch all writers or move evidence recheck/locking to a provably serialized protocol; stress test interleaving |
| P0-06 | Repo taxi page gates trips behind NEXT_PUBLIC_TAXI_TRIPS_ENABLED==='true'; no approved current target activation/E2E evidence | Cannot declare the passenger→approved driver→completion journey live | Test quote, consent, authorization, acceptance, cancellation, location privacy, closeout, pricing and audit with distinct accounts |
| P0-07 | Repo merchant/courier pages poll while open (8 s); Floot operations has foreground polling interval and alerts. No demonstrated background installed-app push worker/outbox/retry/ACK | Closed/background app does NOT have call-like guaranteed notification | Native/mobile OS-compliant push registration, retries, deduplication, app state coverage and operational runbook, acknowledging iOS limits |
| P0-08 | No completed order/checkout/courier/customer multi-account runtime acceptance, rollback/cash and permission receipts | Revenue-critical food/store fulfilment still unverified | Place→quote→confirm→assign→accept→pickup→deliver→settle/rate + failure/rollback test and telemetry |
| P0-09 | Floot business scheduled jobs are running on the published code, while no new production release is authorized | Existing jobs must be included in writer/quiescence inventory; code edits in preview do not change them | Inventory deployed schedules, outgoing side effects, DB permissions and controlled release plan |

## 5. Module-by-module acceptance register
| Module | Code/API/fixture state | Production readiness |
| --- | --- | --- |
| Landing, public categories, Near Me, search | Routes return HTML 200, tests green; PR #350 draft | P1 browser UX/SEO/accessibility/real catalog acceptance missing |
| Professional registration/profile/inbox | Floot first use title+city, tests green; PR #351 draft | P1 canonical owner→submit→review→public E2E and account transition missing |
| Classifieds | API/UI/tests available | P1 create/photos/category/idempotent retry/moderation/public proof missing |
| Store/catalog/checkout | UI/API tests available | P0 checkout, inventory/price integrity and fulfilment proof missing |
| Restaurants/merchant | UI foreground alerts and order actions | P0 recipient alerts when browser closed and merchant order acceptance missing |
| Courier/driver | Source handlers, role checks, polls | P0 docs, eligibility, assignment, evidence, delivery and OS notifications E2E missing |
| Taxi | Quote and trip state source code, conservative feature gate | P0 complete authorized live trip not proven; leave flag off |
| Admin and verification | Role-gated menus; anonymous admin 401; PR #348 plan | P0 role-by-role API negative tests, authenticated reviewer, trust docs and audit required |
| Account and Google login | Public account route 200; anonymous session 401; PR #344 draft | P0 authenticated login/session persistence/root cause; no proven E2E |
| Account deletion and native app | Web deletion currently starts with support email; PR #346 legal links draft | P1 secure authenticated deletion request, retention/compliance and app store release checks |
| Business Desk and tenders | Floot managed Postgres + public/managed endpoints, scheduled discovery and alerts | P1 subscription/activation/freshness/revenue acceptance; segregate B2B auth from platform admin |
| Billing/revenue | Source and admin navigation exist | P0/P1 payment/cash ledger, failed-write recovery and legally required receipts unverified |
| CEO/GM/KORA/IQ/EXPOSE/AUTOPSY | Dashboard/report names and code exist | P1 provenance, durable audit, access control and actual operational decisions not certified |

## 6. Business Desk: read-only Floot managed DB facts
83 public-schema tables. Read-only aggregate SQL observations:
- business_tenders: **81** total: publication_status **published=14**, **verification_required=15**, **expired=52**. All 52 expired records with closing_date were overdue. The legacy business_tenders.status enum showed expired=52 and discovered=29, so do **not** confuse it with publication_status.
- business_tender_discovery_runs: **55**, status completed=15 and partial=40; aggregated found=214, inserted=22, failed=0, review_required=13. A partial status does not automatically mean a failed job; inspect the report before asserting a bug.
- business_market_opportunities: 31, with published_at non-null for 27 (timestamp alone does not guarantee current publication).
- business_tender_alert_deliveries=0, business_tender_alert_preferences=0, business_client_access=0, registered business_companies=1, business_user_tender_submissions=0, business_automation_runs=0.
- Floot published background inventory showed **discoverSources** scheduled every six hours and **buildTenderAlerts** daily; historical published logs 2026-11-06 show success:true for both functions at 15:00 and 05:00 UTC respectively. This proves invocations terminated successfully, not a paying subscriber received an alert. With zero preferences and zero client access, the lack of deliveries cannot be blamed on a sender failure without further evidence.
- Public tender endpoints project selected fields and use safePublicText for contact/address masking; private tender detail requires business admin. Anonymous published smoke returned private 401 and public listing 200. Residual unstructured sensitive detail leakage must be tested with representative examples before privacy sign-off.

## 7. UX/UI/accessibility and technical limitations
- Floot published site routes returned HTML; no visual screenshot was captured because the editor/preview was not open. Manual mobile usability and assistive-technology walkthrough remains OPEN.
- PR #349 account navigation, #350 homepage discovery and #351 professional form simplification remain independent drafts. Floot has its own UI changes; no file-level parity diff for all routes to GitHub main.
- The source shows the restaurant/courier ringing depends on in-page user permission and foreground polling, not reliable background delivery. Do not promise full-screen alert on iOS/Android.
- Legal/account deletion via mailto and native store certification require independent policy and functionality review.
- Backend moderation source is primarily NestJS/TypeScript + PostgreSQL; no separate Java component identified in the audited scope. Do not claim a Java QA pass on an unlocated Java service.
- No authenticated finance, privacy, pen test, accessibility, network-performance, availability SLO, load test, observability, disaster recovery or production backups were independently certified.

## 8. Next Safe Action / executive release gates
1. **CTO/DevOps/SDET, P0:** Produce a fresh read-only authenticated Cloud Run/Cloud SQL release evidence pack: exact repository main SHA, backend/frontend build digest and traffic revision, PREVIEW vs production environment boundaries, independent writer inventory/quiescence, schema and permissions, backed-up restore proof. Use the existing guarded workflow or a separately authorized read-only executor; DO NOT dispatch a deploy/migration.
2. **Backend/Auth, P0:** Reproduce a complete authorized Google session on iOS and desktop with anonymized correlation receipts; identify any 401 vs 502/503 root cause. Never infer a login outage from anonymous 401.
3. **Backend/Security, P0:** Complete #348 trusted service-identity resolver and canonical policy evidence checks, prove lock coverage for service listings/media/other writers, test rollback, concurrent modifications, self-review, role abuse and exact audit history on PostgreSQL. Do not enable Floot approvals before acceptance.
4. **Product/Ops/QA, P0:** Use separate owner, reviewer, customer, merchant, courier, driver accounts in Preview to exercise all service transitions, especially taxi and restaurant notifications, with screenshots/traces and denial receipts.
5. **FE/UX/QA, P1:** Reconcile Floot pages/production build against main and PRs #349-351 and validate desktop, iPhone and accessibility/RTL. Keep unpublished features out of launch claims.
6. **Business/GM, P1:** Explain partial discovery run statuses and reconcile 14 published tenders to current closing dates; activate a legitimate test customer flow only after authorized Preview setup, then verify subscriber entitlement, alert outbox/delivery and audit.
7. **PM/CEO/CTO:** Approve a staged, reversible rollout only after all P0 gates are signed with dated evidence and live rollback/monitoring. Until then NO-GO.

### Change control
This is a documentation-only audit committed on the existing DRAFT #352 branch. No main merge, Floot publish, database write, Cloud Run scaling/deploy, feature toggle, approval, contract acceptance, payment, tender publication or user/account change was performed.
