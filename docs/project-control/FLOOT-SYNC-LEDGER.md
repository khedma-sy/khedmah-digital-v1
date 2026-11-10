# Khedma Digital — Floot / GitHub release synchronization ledger

**Baseline:** 2026-11-10. **Decision:** NO-GO. **Owner scope:** CEO, GM, CTO, EM, TL, PJM, PM, UXR, UX, UI, QA, SDET, DevOps, FS/FSD, BE/BED, FE/FED, Security, Operations, CFO.
**GitHub:** `khedma-sy/khedmah-digital-v1`, protected `main=2cae37037da91e2a75f0d482f04d9773a5bdde10`, latest merged #367. Draft #368 (documentation only) is open; do not infer CI from an earlier head.
**Floot:** project `5e271f43-96a6-40de-a634-ec3eae023a49`, editor version `1794272024135`, 109 routed page files and 155 Jasmine specs in the current file inventory; TypeScript clean.
**Published Floot:** 2026-11-04T00:01:39.684Z / source digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`. Attached domains `khedmah.uk`, `www.khedmah.uk`. Floot reports 55 helper/endpoint files changed since that publish. Editor code **is not live**.
**Preview Backend:** anonymous health 200 identifies `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`, older than GitHub main. This check does not inspect Cloud Run traffic/image or SQL.
**Evidence taxonomy:** M = merged GitHub source; E = Floot editor code/targeted tests; L = proven live published behavior; S = server-side only, no Floot transfer intended; B = blocked/default-off; U = unverified. M≠E≠L, and HTTP 200≠end-to-end acceptance.

## Evidence-weighted production readiness score — 36/100

This is a *conservative evidence readiness index*, NOT engineering % complete. Fixed weights; changes require a new independent receipt. A P0 gate failure can keep NO-GO at any score.

| Domain | Points / weight | Why not full |
|---|---:|---|
| Protected main, PR workflow and CI | 8 / 10 | main green; draft #368 CI/review not finished at baseline |
| Floot editor UI/code/test readiness | 7 / 10 | 109 routes; TypeScript clean; 155 specs pass when serial rerun, but concurrency-sensitive quote spec and missing device rendering |
| Floot published parity | 3 / 15 | 2026-11-04 publish is older, 55 helper/endpoints diverged, two sampled route mismatches |
| Google auth, roles, isolation | 2 / 10 | unauthenticated routes deny as expected, no positive cross-role/mobile acceptance |
| Cloud Run, SQL, isolated restore and rollback | 3 / 15 | health 200 only; image/traffic/writer/restore/schema gates unproven |
| Store, classifieds, restaurant and commerce journey | 3 / 10 | public read routes and unit specs, no full customer→merchant→courier reconciled run |
| Taxi, driver documents, Smart Admin | 2 / 10 | safety contracts/source, operational mutation deliberately disabled |
| Background order and courier notifications | 1 / 5 | foreground 30-second polling/ring; closed-app device push not proved |
| Business Desk, tenders and entitlements | 3 / 5 | public tenders and source implementation; no subscriber/payment/alerts journey |
| SDET/UAT, device UX and observability | 4 / 10 | 155 specs mostly green; no signed mobile/desktop E2E or SRE rollback |
| **Total** | **36 / 100** | **NO-GO** |

**Next hourly reports:** keep these weights; report previous→current delta and exact new evidence. Do not increase unverified buckets. First iteration delta = N/A.

## Verified transfer and fix register

| ID / GitHub source | Technical change | GitHub | Floot editor | Published / runtime | Next acceptance |
|---|---|---|---|---|---|
| #367 discovery copy | Replace misleading live `متاح/مشغول` with `يعلن أنه متاح للعمل/يعلن أنه مشغول/حسب الاتفاق` | M | **E:** `pages/platform.nearby.tsx`, `pages/platform.search.tsx`, `components/KhedmahProviderView.tsx`, regression `helpers/khedmahProfessionalAvailabilityUi.spec.tsx` | U: public release predates editor correction | verify rendered labels on mobile + desktop after controlled publish |
| #359 cash quote | Bind customer confirmation to expected quote revision/total/currency, fail closed for stale quote | M | **E:** `pages/platform.orders.tsx` uses expectedUpdatedAt/expectedTotal/currency; checkout-related tests | B: old backend target; no live confirmation evidence | server-compatible 409 re-review and real order settlement UAT |
| #357 account/discovery/professional integration | Staged account, Nearby and professional flows | M | E: `platform.account`, `platform.nearby`, `platform.professional-manage` and tests exist | U: live flow not accepted | cross-role desktop/mobile Google sign-in and professional publish lifecycle |
| #356 restaurant background push safety | Staged push contract and release-safety infrastructure | M | E only for **foreground** order/courier notifications and 30s polling; no certified closed-device push | B: not proved in background | real device enrollment, token/outbox/retry/dedup/closed app |
| #364 taxi presence | Server-owned driver online lease and dispatch eligibility fail-closed contract | M, server-side | E: `khedmahDriverPresence` descriptive; no dispatch claims | B: no live presence/dispatch proof | live lease, consent, dispatch concurrency, accepted trip and pricing |
| #348/#365/#366 Smart Admin and verification | Fail-closed plan, unknown-domain rejection, superseded snapshot rejection | M, primarily server-side | E safety gate `khedmahApprovalExecution.enabled=false`, review queues UI | B by design | atomic backend approval, independent reviews, documents validation, audit |
| #344 Google login recovery | Scaling-only verified recovery request, not authorization to change Cloud Run | M, operations | S: no UI transfer expected | U: health 200; mobile Google UAT missing | serving revision/traffic and mobile OAuth tests |
| #362 Nearby diagnostics | Read-only provider discovery aggregate diagnostics | M, server-side | E: Nearby UI, city/GPS fallback, empty-state tests; no proof live data populated | U: sample discovery query returned zero entries | genuine seeded approved providers and role safe discovery |
| #346/#345 Android legal readiness | Legal links and nonproduction compilation tests | M, Android scope | E: privacy, terms, account deletion routes exist in Floot | U: actual Android store authorization/build | native application tests plus Play Console eligibility independently |
| #358 and #334–342 release gates | Writer-surface, Cloud Run and source provenance checks | M, CI/operations | S: these do not belong to public Floot UI | B: required Cloud/SQL receipts missing | read-only provenance, writer fence, restore, rollback |
| #321 and predecessor professional privacy | Safer professional/provider links and data handling | M, frontend/server | E: provider detail and public search, safe search returns, restricted route checks | U: no signed live PII/tenant negative tests | privacy/IDOR and role acceptance |
| Editor-only 2026-11-10 | Search + provider-detail availability wording, clarification and regression | not yet a matching GitHub source PR from Floot | **E**, test PASS | **not published** | source sync review and controlled publish |
| Editor-only 2026-11-10 | New canonical-vs-legacy classifieds parity and privacy regression `helpers/khedmahPublicClassifiedsRegression.spec.tsx` | documentation captured in draft #368 | **E**, regression PASS | **not published** | resolve published legacy 502; confirm no private details leak |
| #368 docs control | Reconcile `CURRENT-STATE.md` and `NEXT-ACTION.md`, record 16-route anonymous differential | **DRAFT**, not merged | E: separate internal roadmap/this ledger only | not public | exact-head Actions and independent review, then controlled docs merge |

The GitHub history includes other merged PRs not individually enumerated here; this register catalogs **verified launch-relevant transfers and blocks**, not a verified file-for-file diff of every historical commit. Do not label all historical PRs as synchronized.

## P0/P1 risk register (AUTOPSY / EXPOSE / KILLCRITIC)

| ID | Priority | Verified symptom and root-cause boundary | Owner | Stop/go acceptance |
|---|---|---|---|---|
| R01 | P0 | Editor is newer than Nov 4 release; 55 helper/endpoints changed; published scheduled `discoverSources` and `buildTenderAlerts` still execute old code | CTO / DevOps / FE | approved artifact/serving compatibility matrix and reversible isolated pilot |
| R02 | P0 | Legacy `/_api/integrations/khedmah_public?section=classifieds` 502 published vs 200 editor. Canonical `/_api/integrations/khedmah_classifieds?view=list&page=1` 200 both with one listing. Root cause is **not proven**, older adapter is candidate; do not call whole classifieds service broken | FE / QA | confirmed sanitized live old-path 200 after gated publish |
| R03 | P1 | Admin KORA endpoint 404 published vs 401 anonymous editor; module source exists only in editor release | FE / Admin / BE | authenticated admin 200, non-admin 403, verified live module availability |
| R04 | P0 | Backend reports older `f4f8ce2`; source/main has newer quote and verification contracts, runtime compatibility unproven | CTO / BE / DevOps | exact image/revision/traffic receipts and atomic 409 acceptance |
| R05 | P0 | Cloud SQL writer quiescence, 030/033 current schema, 036/037 prerequisites and isolated restore not signed | DBA / SRE / Security | read-only approved evidence + recoverability rehearsal |
| R06 | P0 | Smart Admin execution disabled and driver document upload disabled by immutable source guards | BE / Trust / Security | validated atomic checks and human document decision; keep OFF until then |
| R07 | P0 | Taxi driver online state is informational only, live dispatch/full trip/fare unproven | BE / Mobile / Operations | concurrent dispatch, consent, lease expiration, fare and cancellation acceptance |
| R08 | P0 | Merchant/courier alerting is foreground only, not audited background push on locked/offline phones | SDET / DevOps / Mobile | real iOS/Android closed-app tests, token lifecycle, durable outbox |
| R09 | P0 | No signed end-to-end Google account session, admin role and customer→merchant→courier cash order, stale quote 409 test | QA / BE / Product | independent cross-role test receipts in compatible Preview |
| R10 | P1 | Business Desk Floot DB counters: tenders 86, discovery runs 68; client access 0, alert preferences 0, alert deliveries 0, service payments 0, user tenders 0 at read. Public tender endpoint lists 14 and market opportunities 21. Counters alone do not prove subscriber delivery or payment | GM / CFO / Product / BE | opt-in subscriber → reviewed tender → alert → access → reconciled order |
| R11 | P1 | Some paths have zero public results (food/store/pro search in anonymous sample); this may reflect no approved rows, not a confirmed UI defect | PM / UXR / BE | verified approved fixtures in isolated Preview, complete search & empty/error states |
| R12 | P1 | The delivery quote UI spec fails under simultaneous eight-batch test execution, but passes alone and when its 20-file batch is rerun sequentially. No confirmed product defect from this evidence | SDET / FE | stable isolated CI reruns and no stale location/price acceptance across address/quantity changes |
| R13 | P1 | Mobile visual preview capture not confirmed; web HTTP shell 200 is not visual/accessibility acceptance | UXR / UX / UI / QA | desktop+iPhone+Android screenshots and keyboard/RTL/a11y/UAT checks |
| R14 | P1 | Public tenders hide contact strings in editor sample (14 cards), but broad private document/record access remains unproven | Security / Business Desk | negative disclosure and ACL tests for person/company/subscriber roles |

## Anonymous route differential — 16 paired routes / 32 GET

- **Both 200:** canonical classifieds list (1), food directory (0), mobility directory, Preview health, public cities, public categories, professional search (0), store list (0), web config, public tenders (14), public market opportunities (21).
- **Both 401 without login:** client portal, customer orders, session.
- **Mismatch:** legacy classifieds 502 published / 200 editor; KORA admin modules 404 published / 401 editor.
- This is a route-level sample, not a complete browser/device audit. A GET returning 200 cannot attest an order/publish/dispatch action.

## Floot editor scope inventory (verified paths, not signed UAT)

- Public: `platform`, `platform.categories`, `platform.search`, `platform.nearby`, `platform.professionals`, provider details, `platform.classifieds`, `platform.store`, `platform.restaurants`, `platform.mobility`.
- Identity and creation: `platform.account`, `platform.professional-manage`, `platform.manage`, `platform.driver-signup`, `platform.ads-manage`, `platform.products-manage`.
- Commerce: `platform.checkout`, `platform.orders`, `platform.merchant`, `platform.courier`, `platform.notifications`.
- Operations: `platform.admin`, `platform.admin.reviews`, `platform.admin.kora`, `platform.admin.billing`, `platform.admin.categories`, `platform.admin.taxi-pricing`, `platform.admin.operations`.
- Business Desk: `business` and related tender/access/meeting/tasks/client pages, safeguarded public tender endpoints.
- Code presence is E, never L. Confirm each auth/role/state variant independently.

## Current hourly executive dispatch / Next Safe Action

1. **P0 highest:** request independently attested READ-ONLY Cloud Run serving image/revision/traffic and Cloud SQL writer/quiescence/schema/restoration before any compatible canary. Owner CTO+DevOps+DBA.
2. **P0 parallel:** keep Floot Editor current with source safety copies and exact regression tests, map legacy classifieds and KORA consumers. Owner FE+QA+UX.
3. **P0 parallel:** prepare real device and role acceptance for Google login, customer/merchant/courier quote transaction, restaurant push, taxi, Smart Admin. Owner QA+SDET+Security+Product.
4. **No-go rule:** never publicly publish, merge unsafe draft, bypass review, deploy Cloud Run, mutate SQL, or activate payment/taxi/push/admin until independently verified gates and explicit release approval.

## Hourly reporting contract

Every run reports current GitHub main/PRs/Actions, Floot editor version, Floot live release digest, Preview backend version, 36/100 baseline score with delta according to the *same 10 weights*, status per launch-critical module (M/E/L/S/B/U), top 3 P0 failures, actual safe fixes/tests/checkpoints/links, findings newly resolved or reopened, and **one Next Safe Action**. Do not overwrite prior evidence or convert uncertain data into completed claims.
