# Khedma Digital — Floot / GitHub / Google Cloud release and migration inventory
Observed 2026-11-08 UTC. Audit modes: EXPOSE, IQ200, KILLCRITIC, AUTOPSY, AUDIT, CEO/GM/ADMIN/WORKFLOW.

## Executive release decision

**NO-GO to a full public production deployment.** This is a live code/CI/editor/HTTP evidence inventory, not a production authorization. The user requested an end-to-end Floot/GitHub/Google release; retain the pre-existing requirement that production mutations require closing current source, independent review, authenticated acceptance, Cloud Run/SQL writer and rollback gates. Do not treat the author's publication request as a waiver of those gates.

The six distinct states in play are: (1) GitHub protected main, (2) unmerged PR heads, (3) Floot editor source, (4) Floot public release, (5) Preview Google Cloud serving revision, and (6) Floot-managed application database. They are not interchangeable.

### Exact observed references
- GitHub repository `khedma-sy/khedmah-digital-v1`; main `cc8d49809cb9543ee1620432d9c0ba73fb801cbb`.
- **12 OPEN unmerged PRs, no formal APPROVED review** in the recorded review submissions. No merges in this audit cycle.
- #352 documentation HEAD `6448cc0167e6ddde6d63c75fdb205c8ec6e354cf`: PR Preview SUCCESS; Node.js CI SUCCESS; Khedmah Test & Verify IN_PROGRESS at the inspection (Run Tests & Verification step). Its next HEAD changes with this document, so these prior-head check results must not authorize a merge.
- #357 frontend integration HEAD `500f7ebfe30b5b8f29d0701f4950af68e1cdf943`: 3/3 Actions SUCCESS, no APPROVED, no real multi-role mobile acceptance. Integrates overlapping #349, #350, #351.
- #356 restaurant security integration HEAD `93a19977913a2e3d3a33b4ea50832f9fa3924642`: 3/3 Actions SUCCESS, no APPROVED. Integrates #353, #354, #355, but is NOT an activated FCM sending chain.
- Android #346 HEAD `247d95cf55356f729535a83e1fdb777e827a0969`: five source Actions SUCCESS including debug build, not Play Console release acceptance.
- Smart Admin #348 remains DRAFT and gated; Google login scaling-only diagnostic #344 remains DRAFT and must not be executed based on historical outage.
- Main `docs/project-control/CURRENT-STATE.md` and `NEXT-ACTION.md` start with November 2/#333 checkpoint text, even while PR #352 contains newer source/CI/Floot evidence. Resolve live main and PR heads first; do not rely on stale date-stamped statements.
- Floot project `5e271f43-96a6-40de-a634-ec3eae023a49`; editor **`1794148108129`**, 108 `pages/*.tsx` page modules, 31 integration HTTP handlers, 144 helper Jasmine spec files. **144/144 spec files PASS** in eight batches; TypeScript CLEAN. This is source/fixture coverage, NOT 144 live customer acceptance journeys.
- Floot editor checkpoint `d62c818f-f977-4e28-8e2f-81dd7f7352eb` records redirect repair. 25 previously blank legacy page modules now perform internal routing to matching /platform pages; added 26 legacy redirect regression cases including map.
- Floot **published** release `1793750504473f0272d7f-c673-4f61-acff-130b2f13d3e9`, dated **2026-11-04T00:01:39.684Z**, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`; the published site does NOT automatically contain the newer editor changes.
- Preview health GET 200 `connected=true`, upstream `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`. Anonymous public categories/cities/search 200; anonymous session/admin/reviews/KORA/pricing/billing/operations 401. These prove bounded endpoint availability and unauthenticated denial, not authenticated role permissions or Cloud release readiness.
- Floot business DB read-only counts: companies 1, market opportunities 31, client access 0, access requests 0, tender alert preferences 0, tender alert deliveries 0. No evidence of active customer access or delivered tender alerts.
- Prior **read-only** Google V2 release gate #41710857994 STOPPED at `KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT`; `writer_quiescence_verified=false`, `database_checked=false`, `release_authorized=false`. No fresh authenticated Cloud Run/Cloud SQL/IAM writer, image, traffic, backup, secret and rollback attestation obtained here.

## PR disposition — complete 12-item inventory

| PR | Status | Exact source gate | Next action |
| --- | --- | --- | --- |
| #344 | OPEN DRAFT | 3/3 success | Historical login recovery: re-evaluate before any scaling mutation |
| #346 | OPEN, not draft | 5/5 success | Independent review; actual Android/Play/legal acceptance |
| #348 | OPEN DRAFT | 3/3 success | Trusted service identity, risk policy, complete write serialization, audit, cross-role review |
| #349 | OPEN DRAFT | 3/3 success | Overlapping source for #357; do not independently duplicate merge |
| #350 | OPEN DRAFT | 3/3 success | Overlapping source for #357 |
| #351 | OPEN DRAFT | 3/3 success | Overlapping source for #357 |
| #352 | OPEN, not draft | 2/3 complete success, third running on prior HEAD | Finish exact-head CI; independent APPROVED; then normal protected merge |
| #353 | OPEN, not draft | 3/3 success | Overlapping source for #356; no live push |
| #354 | OPEN, not draft | 3/3 success | Overlapping source for #356 |
| #355 | OPEN DRAFT | 3/3 success | Overlapping source for #356 |
| #356 | OPEN, not draft | 3/3 success | Security APPROVED, complete real FCM enrollment/dispatch/outbox/worker/device acceptance |
| #357 | OPEN, not draft | 3/3 success | Frontend APPROVED, real Google/customer/professional/admin/mobile acceptance |

**Merge order:** documentation #352 after fresh-head checks and review; frontend #357 after cross-role acceptance/review; restaurant source #356 after security review; Android #346 after app acceptance. Keep #348/#344 draft pending design and live conditions. Close absorbed source PRs only after verifying that their commits are included and recording disposition. Avoid blind bulk merge.

## Floot functional transfer — evidence class, not a completion percentage

| Domain | Present in Floot editor | Remaining gap blocking claim of full migration |
| --- | --- | --- |
| Home/discovery/cities/categories/search | React pages, public integration adapters; recently repaired legacy links | Verify current search source contract and real mobile browsing; editor vs published parity |
| Account/Google sign-in | Google-only page, session proof, logout/relogin source fix | Authorized iPhone/desktop E2E, refresh/session persistence, role enforcement, real audit logs |
| Classified ads | Public list/details, owner drafts/media/management | Real submit/approve/deny flow, media and moderation end-to-end |
| Store | Public product browsing, checkout/quotes/owner management | Order persistence, stock, merchant/courier/buyer permissions, settlement acceptance |
| Restaurants/food | Catalog, checkout and merchant order console | Real order-to-merchant flow and closed-app push registration/FCM/outbox/retry; background alerts unproven |
| Courier/delivery | Role-specific dashboard and location workflows | Verified dispatch lifecycle, live tracking, reliable alerts, device/background and map acceptance |
| Taxi | Driver candidate interface and mobility UI | Production trips OFF; driver verification/upload OFF; live fare/trip lifecycle, GPS and tracking unproven |
| Professionals | Registration/profile/owner pages, progressive UX work in #357 | Actual multi-role enrollment, identity/trust/media approval, server version and page parity |
| Business Desk | Tender/opportunity/company/service/meeting/UI workflows in Floot | Customer access zero, tender-alert delivery zero, payment/revenue and external publish/submission separate approval gates |
| Platform moderation/verification | Evidence queues and audited read-only adapters | `khedmahApprovalExecution.enabled=false`; no safe auto-approval executor enabled |
| Driver verification documents | Candidate view and related source | `khedmahDriverExecution.documentUploadEnabled=false`; no upload rollout |
| KORA Executive, categories, taxi pricing, billing, operations | New *editor-only* native Floot internal consoles and authenticated read adapters, manual KILLCRITIC/AUTOPSY | Mostly read-only; write/settlement/fare/operational tasks require independent RBAC, CSRF, atomic revisions, audit, rollback |
| Maps and navigation | New `/platform/map`, redirected old `/map`, geolocation by consent, selected published provider point, route and profile preview | Not full JS multi-marker/viewport search; no real-time taxi/courier position streaming; phone visual tests outstanding |
| Native Android | GitHub source and #346 candidate | Floot editor is not a signed native Play artifact; Play Console identity issue and real-device acceptance unresolved |
| Legacy URLs | 25 blank old pages now redirect to /platform pages in Floot editor | Real published URL redirect and authenticated page acceptance not yet verified |

## EXPOSE critical findings and AUTOPSY
- **P0 — Release authority:** independently verified reviewer approvals absent; source CI ≠ authorized merge or deployment.
- **P0 — Cloud provenance:** published Floot remains wired to a Preview-labeled backend, with no verified source-to-image-to-traffic receipt or writer-quiescence proof.
- **P0 — Security:** moderation executor and driver document upload remain deliberately disabled; financial/fare/release mutations not enabled in new Floot views. No bypass to achieve 100%.
- **P0 — User journeys:** no full authenticated role matrix and actual phone browser/device acceptance for Google, order, taxi, courier, restaurant push, admin approvals.
- **P1 — UI parity:** 25 legacy page modules had blank content; fixed with explicit redirects in editor, regression tested, but not published. Multi-marker map and live position not yet implemented.
- **P1 — Business operations:** 31 market opportunities exist but zero active client access/alert deliveries.
- **P1 — Documentation:** live `main` project-control headers are stale; current evidence resides in unmerged #352.
- **KILLCRITIC counterfactual:** Publishing editor now would expose new navigation but falsely signal production readiness, while critical order/driver/admin capabilities remain disabled or untested. Preserve NO-GO.

## Release pipeline / NEXT SAFE ACTION

1. Recheck all exact heads, threads, requested reviewers, workflows and branch-protection; finish #352 third workflow and any newly triggered checks from this report. Secure independent APPROVED reviews before merging. Do not merge overlapping PR source branches twice.
2. On authorized read-only Google Cloud inspection, capture current Cloud Run deployed service+revision+image SHA, traffic, frontend↔backend routing and IAM; SQL schema/migrations, active writer inventory and quiescence, backups, restore rehearsal and rollback. Require explicit `release_authorized=true` from the reviewed process before mutation.
3. Open Floot Preview in a real browser, authenticate separate owner/admin, ordinary customer, professional, merchant and driver identities and execute bounded E2E. Record denied/allowed permissions, phone viewport, geolocation and redirect tests. Do not use anonymous 401 as proxy for this gate.
4. Verify current editor-vs-GitHub HEAD and source-vs-serving provenance. Implement outstanding guarded write contracts and real alert/outbox/FCM/device tests independently.
5. Only after all relevant checks are evidenced, perform a reviewed, reversible canary publication with rollback and live probes, then decide wider rollout. Financial commitments, legal attestations, external tenders and production DB writes have separate human authorization gates.

**This audit performed no Google Cloud/SQL production mutation, no merge, no Floot publication and no sensitive external action.**
