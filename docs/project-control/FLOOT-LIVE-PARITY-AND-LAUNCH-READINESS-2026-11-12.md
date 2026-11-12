# Khedma Digital — Floot live parity and launch readiness audit

**Evidence date:** 2026-11-12 UTC (latest observed Floot published snapshot 02:16:21 UTC; background inspection 02:25 UTC).
**Decision:** PUBLIC WEB **LIVE**; FULL TRANSACTIONAL / TAXI / RESTAURANT / ADMIN / NATIVE PRODUCTION **NO-GO**.
**Scope:** CEO, GM, CTO, EM, TL, PJM, PM, UXR, UX/UI, QA/SDET, DevOps/SRE, FS/FSD, BE/BED, FE/FED, software, security, admin and finance.

This is a **scope-based reconciliation** of live published metadata, Floot source/test inventory, repository source and prior owner Cloud SQL read-only receipts. It is **not** a claim that all 1,392 published Floot files or every backend method was manually line-reviewed, that every route was clicked on physical devices, or that authenticated end-to-end operations passed.

## Exact source and serving evidence

| Surface | Verified receipt | What it DOES NOT prove |
| --- | --- | --- |
| GitHub | Protected `main=f3fb146fb04dd90011a8ffdfced8a7368eaca993`; **0 open PRs** at start of this audit; latest two main push workflows (Node.js CI and Test & Verify) **SUCCESS** | A GitHub merge is not a Floot transfer or Google Cloud deployment |
| Floot editor | Project `5e271f43-96a6-40de-a634-ec3eae023a49`, editor version `1794449628151`; **109 route files** including **37 canonical platform routes and 72 legacy/business/redirect routes**; **164 endpoint files**, **32 Khedmah integration handlers**, **159 helper spec files** | Pages and tests are not authenticated live UAT; some legacy routes only redirect |
| Floot source QA | Latest prepublish serialized test run **157/157 ordinary spec files + 2/2 hook specs PASS**, TypeScript clean. Existing release-gate test explicitly holds native approvals and driver uploads OFF | Does not verify physical-device notifications or customer→merchant→courier completion |
| Floot PUBLIC WEB | `https://khedma-meeting.floot.app`, attached domains `khedmah.uk` and `www.khedmah.uk`. Release `17944497863238012c746-3984-447f-b76c-d2cf67556dca`, published `2026-11-12T02:16:21.098Z`, digest `e736c4e77784794b45c25a22f62b9a6b19d81798f2aa68c405245875d6abd5f4`, 1,392 files, no later failed publish shown | Domain attachment alone does not certify DNS in every network, authenticated live workflows or full commercial readiness |
| Recent Floot logs | Browser public classified list, categories, cities, professional search, public tenders and public opportunities returned 200 in observed preview window; anonymous session 401 is expected. Published ERROR-filter query after latest publish returned **no matching events**. Published schedules: `discoverSources` and `buildTenderAlerts`; **no push deliveries appeared in sampled push window** | Successful anonymous GET or empty error/push window does NOT prove positive role access, background phone delivery or real order lifecycle |
| Google Cloud Preview | Latest documented owner receipts (not re-executed in this audit): Backend Cloud Run serving older f4-derived revision `00008-tg8`; Cloud SQL writer isolation **false**; session zero was only a snapshot; schema 036/037 and current backup restore evidence **not approved** | No new Cloud Run immutable image, serving traffic, database writer fence or production release certification is supplied by this audit |
| PostgreSQL owner read-only inspection | 64 ordinary relation objects, `khedmah_app` effective SELECT 62 / INSERT 63 / UPDATE 60 / DELETE 60; 3 named billing row-level no-rewrite triggers enabled; all 6 inspected sensitive tables had RLS disabled; `audit_logs` and `fulfillment_order_events` had effective UPDATE/DELETE and no denial triggers | Neither proves successful illicit changes nor verifies function body. Live write tests, role mutations and migration remain prohibited until gates |

### Source-to-Floot transfer crosswalk

Legend: **L** = present in the new public Floot release by published source; **E** = editor/source with test but no positive authenticated live acceptance; **S** = backend/CI/Cloud-only (not a browser transfer); **B** = deliberately disabled; **U** = unverified runtime behavior. L is not UAT.

| Workstream | GitHub source evidence | Floot route / handler evidence | State / unfinished acceptance |
| --- | --- | --- | --- |
| Landing, navigation, 9 entrances, RTL | Public frontend and category/discovery modules | `pages/platform.tsx`, `platform.categories`, nine entrance cards; mobile grid; English/Chinese/Arabic shared i18n | **L**; real multi-device visual/keyboard testing U |
| Google account, owner console | Identity/auth source, session contract | `platform.account`, `khedmah_google_POST`, `khedmah_session_GET`, owner actions | **L/E**; user previously observed login success; fresh signed-in cross-role, refresh, logout, phone browser U |
| Professionals | `apps/backend/src/professional-profiles`, moderation lifecycle | `platform.professional-manage`, `KhedmahProfessionalManage`, `platform.professionals`, `platform.nearby`, `khedmah_manage_POST` | **L/E**; two required fields (profession and city), explicit privacy opt-in and separate submit/review; positive owner→human approval→public discovery U |
| Nearby/maps/location | Search/locations, public-discovery and taxi presence source | `platform.nearby`, `platform.map`, `KhedmahMapPreview`, `platform.mobility`, `khedmah_nearby_GET` | **L/E**; consented GPS and city fallback, but declared availability ≠ online lease; not all source map/dispatch features transferred |
| Classifieds | `apps/backend/src/classifieds`, quota/review rules | `platform.classifieds`, `platform.ads-manage`, `khedmah_classifieds_GET`, safe listings | **L/E**; public read observed; real create→approve→publish, quota/negative ACL, legacy endpoint parity U |
| Store/products | `apps/backend/src/products`, business profile owner | `platform.store`, `platform.products-manage`, `platform.checkout`, related adapters | **L/E**; published browse & source tests, no full live order/payment/merchant acceptance |
| Food/restaurants | `apps/backend/src/orders`, restaurant pricing, coupons and push-safety tests | `platform.food`, `platform.restaurants`, `platform.merchant`, order/quote/tracking/action adapters | **L/E/U**; no signed customer→restaurant→courier cash order, stale-quote 409, durable push and closed-app alert |
| Taxi & driver enrollment | `apps/backend/src/taxi` trips, approval, pricing, presence and leases | `platform.mobility`, `platform.driver-signup`, `platform.courier`, `khedmah_driver_GET` | **L + B**; trip creation not activated; `khedmahDriverExecution.documentUploadEnabled=false`; no live dispatch/arrival/fare/cancel UAT |
| Smart Admin/content & identity | `apps/backend/src/moderation`, approval review concurrency, verification evidence source | `platform.admin.reviews`, other admin panels, `khedmah_approval_POST` | **L + B**; review UI present but `khedmahApprovalExecution.enabled=false`; cannot claim approval automation operational |
| Notifications/orders | Notification and restaurant FCM/push policy source | `platform.notifications`, `platform.orders`, `platform.courier`, 30s foreground order polling described in source ledger | **L/E/U**; no live locked-screen push receipt, audible repeat/vibration, permission/token/ack UAT |
| Business Desk, tenders and opportunities | Floot-native business workflow, procurement, publishing, access and subscription code; distinct from public backend modules | `business`, `portal`, `tenders-public`, `market-opportunities-public`, meetings, Gmail, jobs and admin pages; two deployed scheduled discovery/alert jobs | **L/E/U**; public tender and opportunities endpoints observed 200, but subscriber→approved publishing→delivery→entitlement→payment not signed |
| Billing, schema and rollback | Main backend billing and migration versions 025–037; `#374` synthetic isolated restore rehearsal; `#375` sensitive SQL read-only inspector | Billing UI and quote/order adapters only, not raw migration roles/scripts | **S + E**; historical older Preview backend expected-quote mismatch remains P0 until exact serving proof; no Cloud writer fence/real restore |
| Android/iOS and app stores | `apps/android` present in GitHub; legal/identity source | Floot native build status **none** | **U/B**; Google Play account enforcement is independent; web publishing is not native app approval |

### Verified transfer and correction register (launch-relevant, not every historical PR)

| ID | Actual state as of this audit | Transfer boundary |
| --- | --- | --- |
| `#357` account/discovery/professional integration | Related Floot platform pages, owner flow, Nearby and tests **present and published as source** | No signed authenticated cross-role public journey |
| `#367` professional availability wording | `يعلن أنه متاح للعمل` rather than asserting live online state; Floot search/Nearby/provider copy and regression present and included in latest publish | Live presence/driver dispatch remains backend-only U |
| `#359` reviewed cash-order quote | Quote and stale state checking surfaced in Floot order code and tests | Older serving f4 backend may not implement latest expectedQuote contract; MUST reverify exact target |
| `#356` restaurant background push protections | Backend policy and tests merged; Floot foreground order/notification screens present | Do not claim real closed-app push works |
| `#364` driver online presence source | Backend lease/eligibility source | **S**, no validated live Floot-to-dispatch transaction |
| `#365/#366` Smart Admin hardening | Backend unknown domain fail-close and stale snapshot guard in merged source; review queue UI present | Approval write **B** by explicit Floot source guard |
| `#374` synthetic PostgreSQL isolated restore | Source-only CI test merged | **S**, does not equal actual Cloud SQL backup restore |
| `#375` sensitive SQL catalog inspector | Source-only read-only tool merged and run by owner | **S**, not a Floot feature or writer fence |
| Floot publish 2026-11-12 02:04 | Nine service entry cards unified in responsive platform home; account navigation spec adjusted | **L**, Floot project code—not a GitHub backend deployment |
| Floot publish 2026-11-12 02:16 | Taxi/delivery UI English & Chinese localization and map/contact/error wording repaired; dedicated UI spec | **L**, still no taxi-trip creation or driver document enablement |
| Historical docs `CURRENT-STATE` and `NEXT-ACTION` | Their opening snapshot says `main=2cae370`, #368 open, Floot Nov 4 published | **STALE**, superseded by this timestamped report; retain historical content for audit |

### Evidence-weighted launch indicator — PROVISIONAL 47/100 (previous documented 36/100)

**Not a measured fraction of code complete.** Fixed rubric from `FLOOT-SYNC-LEDGER.md`; recertification is conservative and separately gate-controlled. Increases recognize GitHub PR merges and a newer confirmed Floot web publish, **not** high-risk feature activation. A single P0 stop condition overrides the numerical score.

| Fixed dimension | Previous | Current / max | Reason |
| --- | ---: | ---: | --- |
| Main/PR CI | 8 | **9 / 10** | All last known pending PRs merged, post-merge main Node/Test&Verify green |
| Floot editor source and QA | 7 | **9 / 10** | 159 spec files pass and TypeScript clean; no signed device walkthrough |
| Floot published parity | 3 | **9 / 15** | New 12 Nov public publish verified; positive authenticated parity still untested |
| Auth, roles, isolation | 2 | **2 / 10** | No latest cross-role/mobile signed acceptance |
| Cloud Run, Cloud SQL, restore | 3 | **4 / 15** | Source-only synthetic restore/role read confirmed; actual writer fence/Cloud restore absent |
| Commerce & restaurant journey | 3 | **3 / 10** | No customer/merchant/courier reconciled transaction |
| Taxi, driver documents, admin | 2 | **2 / 10** | Critical write gates intentionally disabled |
| Background alerts and courier | 1 | **1 / 5** | No closed-app device push evidence |
| Business Desk/entitlements | 3 | **3 / 5** | Public tenders source/run evidence; no subscriber billing acceptance |
| QA E2E/device/observability | 4 | **5 / 10** | More source tests green and web published; physical/device E2E and rollback unsigned |
| **TOTAL** | **36 / 100** | **47 / 100 provisional** | **FULL PRODUCTION NO-GO** |

**Score interpretation:** 47 is a *working CEO/CTO evidence indicator*, not an assertion of 47% of every feature operating. The canonical historical 36/100 stays preserved in its old dated ledger and is superseded for planning by this fresh, explicitly provisional assessment.

### Critical stop/go register (EXPOSE / AUTOPSY / KILLCRITIC)

1. **P0 – Exact Preview runtime parity (CTO/BE/DevOps):** read-only confirm serving Cloud Run revision, immutable image digest, schema and actual latest-backend API contracts. Old f4 backend vs newer `expectedQuote` and atomic approvals; do not activate incompatible writes.
2. **P0 – Writer fence + real recovery (SRE/DBA/Security):** enumerate every writer, verify SQL privileges/session quiescence under controlled maintenance, restore a CURRENT Cloud SQL backup to a separate instance, test rollback. Owner read-only catalog showed broad UPDATE/DELETE and no RLS/denial triggers on audit_logs and fulfillment_order_events; [security issue #376](https://github.com/khedma-sy/khedmah-digital-v1/issues/376).
3. **P0 – Smart Admin & driver verification (Trust/BE/QA):** source flags remain OFF until atomic latest-document, approval safety, identity proof, role acceptance and compatible Preview release all pass. Do not flip flags for appearance.
4. **P0 – Restaurant → courier real E2E (PM/QA/SDET/DevOps):** signed nonproduction customer order, merchant confirmation, pricing 409/no replay, courier eligible assignment/ack, cancel/refund policy, notification foreground/background real device, permissions/token rotation/outbox/retries.
5. **P0 – Taxi whole trip (BE/Mobile/Operations):** driver & vehicle latest approved docs, consented live presence, driver/customer matching, pricing, accepted/declined ride, lifecycle/cancellation, repeated ring/vibration locked screen, recovery and abuse tests.
6. **P1 – Floot UX and transfer diff (FE/FED/UX/UXR):** complete owner→review→public professionals acceptance; explicitly compare named source features and live pages, consolidate legacy/duplicate navigation while preserving deep links; audit map/address city/GPS path. No arbitrary numeric claim that all source commits moved to Floot.
7. **P1 – Business Desk monetization (GM/CFO/Product):** signed individual/company tender submission, review, language/access/subscription, alert delivery and revenue reconciliation; privacy/PII redaction negative tests.
8. **P1 – Observability and legal/native (SRE/QA/Security):** real-user mobile browser sign-in, accessibility, RTL, iOS/Android device push UAT, Play Console developer eligibility, runbooks/rollback/owner GO receipt.

### Next safe action and launch ordering

- **Immediate source/UI lane:** keep public Floot web live with verified low-risk UI improvements, no native approval/driver uploads/trip enablement; instrument a reviewable source-to-Floot acceptance matrix and repair route/UX issues with targeted tests + controlled republish.
- **Backend/Cloud lane:** exact immutable serving version + writer inventory read-only, independently authorize writer fence, isolated current backup restore, test/schema compatibility and deployment to **Preview only**; do not mutate Google Production.
- **End-to-end acceptance:** role-isolated professional, admin, taxi and merchant/courier flows including denied and replay cases, closed-app notifications and finance reconciliation.
- **Release:** only after signed gates, planned rollback and explicit scoped GO. Public Floot website can remain live meanwhile; **full operations and native store release remain NO-GO**.

## Evidence honesty and outstanding measurement

This report inventories all Floot routes from the project listing and samples high-risk source files/contract tests. It does **not** independently run every authenticated live transaction, compare every frontend source line, validate DNS in all countries or execute a fresh Google Cloud operator inspection. Those tasks are explicitly open. A green CI job, healthy 200 status, or a published page is not equivalent to operations being ready.
