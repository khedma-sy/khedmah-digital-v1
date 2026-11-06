# Khedmah Digital — Evidence-Based Site Coverage Scorecard (2026-11-06 UTC)

> REPORT ONLY. NO source fix, main merge, Preview or Production mutation. A score is coverage of verifiable readiness evidence, NOT a certified percentage of completed code and NOT a release authorization.

## Scope and sources
- GitHub protected main observed: `cc8d49809cb9543ee1620432d9c0ba73fb801cbb`. Open PRs: #344, #346, #348, #349, #350, #351, #352, #353, #354, #355. Source changes in draft/open PRs are NOT main or production.
- Floot project `5e271f43-96a6-40de-a634-ec3eae023a49`; editor version `1793991388100`; **102 actual `.tsx` page files** after excluding `.pageLayout` and `.__example` source items; 161 endpoint implementation files, 138 Jasmine spec files. A route source file is NOT an independent browser-accepted journey.
- Floot typecheck clean; 20 selected security/domain specs passed 0 failed on this audit. Earlier report on #352 recorded 138/138 spec files passing; these are not authenticated browser E2E checks.
- Floot published release: `1793750504473f0272d7f-c673-4f61-acff-130b2f13d3e9`, published `2026-11-04T00:01:39.684Z`, digest `sha256:49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`. Domains `khedmah.uk` and `www.khedmah.uk` are attached. Published code != editor changes.
- Anonymous live public probes returned the intended HTML for `/platform`, `/platform/admin`, `/platform/restaurants`, `/platform/store`, `/business`, `/platform/account`, `/platform/professional-manage`, `/platform/checkout` (the checkout refused absent basket context). Admin/session/private business tender APIs returned 401 without a session. GET/HTML and anonymous 401 do not prove authenticated authorization and app delivery.
- Published integration health advertises `khedmah-preview-v2` and `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`, not a content-addressed main-to-serving-revision certification.
- Read-only Floot DB aggregates: `business_tenders` publication_status `published=14`, `verification_required=15`, `expired=52`; discovery runs `55`; `business_tender_alert_preferences=0`, `business_tender_alert_deliveries=0`, `business_client_access=0`. Zero deliveries with zero preferences does NOT prove an alert sender failure.
- Production Floot schedules observed: discoverSources every 6 hours and buildTenderAlerts daily; no active run during the read. Schedule writers must be inventoried before the Cloud quiescence/release decision.
- Cloud release read-only run `41710857994` failed `STOP: KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT`. No fresh authenticated independent Cloud SQL, IAM, backup restore or runtime source-parity evidence was available.

## Scoring contract — each item receives 0/1/2 evidence grade
| Axis | Maximum contribution |
|---|---:|
| UI and route | 10 |
| API/backend linkage | 20 |
| Authorization/security | 25 |
| Automated tests | 15 |
| Authenticated/real runtime E2E | 30 |

Score = SUM(axis grade * axis weight) / 2. A grade of 1 is partial, 2 is directly supported in the axis, 0 is absent/unverified. Equal-weight section average **52.3/100** across 26 sections, not an empirical defect rate, code completion fraction, or GO score. Open P0 blocks release regardless of score.

## Category scorecard
| Domain | Evidence index /100 | Priority |
|---|---:|---|
| Landing/categories | 72.5 | P1 |
| Search/nearby | 72.5 | P1 |
| Google auth/session | 57.5 | P0 |
| Account/privacy | 72.5 | P1 |
| Professionals/verification | 57.5 | P0 |
| Classifieds | 57.5 | P1 |
| Store/catalog | 72.5 | P1 |
| Store purchase/settlement | 35.0 | P0 |
| Restaurant directory/menu | 72.5 | P1 |
| Restaurant order journey | 57.5 | P0 |
| Courier/delivery | 57.5 | P0 |
| Taxi trips | 47.5 | P0 |
| Background Push | 22.5 | P0 |
| Smart admin/moderation | 47.5 | P0 |
| B2B tenders | 72.5 | P1 |
| B2B subscriptions/alerts | 57.5 | P1 |
| B2B companies/assessments | 57.5 | P1 |
| B2B meetings/tasks | 47.5 | P1 |
| B2B sales/revenue | 47.5 | P0 |
| Billing/payments | 40.0 | P0 |
| Android | 42.5 | P1 |
| iOS | 5.0 | P1 |
| DevOps/runtime parity | 47.5 | P0 |
| RTL/UX/SEO | 62.5 | P1 |
| Privacy/data security | 35.0 | P0 |
| Automated/operational assurance | 42.5 | P0 |

## Important functionality distinctions — understand the lifecycle BEFORE fixing
1. `/platform/store` describes itself as a contact-oriented product catalog; `/platform/checkout` is a separate order/fulfillment path. Do NOT label the missing direct buy action a defect without agreeing the store's business contract and tracing its transaction flow.
2. The nav uses `/platform/mobility?type=taxi`; `/platform/taxi` does not exist in the observed Floot route table. This is NOT evidence of broken navigation. Legacy `pages/taxi.tsx` returns null. Investigate actual referrers before introducing aliases.
3. `/platform/admin` renders an initial client-side gate; a public HTML response is NOT proof that admin data is exposed. Its anonymous API returned 401. Test cross-role API responses.
4. Smart-admin approval execution is intentionally disabled, and driver-document upload has its own disabled gate. Do NOT enable either merely to increase a score.
5. PRs #353/#354 protect restaurant FCM token validation and rotation; #355 defines a pure eligibility policy. These are separate source changes, NOT an end-to-end token storage, worker, outbox, retry or real background delivery implementation.
6. B2B Smart Admin and platform professional approvals are distinct authority domains; do not merge their roles or side-effect permissions.

## P0 release gates (keep all held)
- Current immutable GitHub SHA→image digest→Cloud Run revision/traffic and runtime DB identity parity, including full writer inventory and tested recovery.
- Google login on iPhone and desktop with authorized role-separated real sessions and trace evidence.
- Policy/credential/locking/audit completion for smart-admin; include concurrent child writes and denial tests.
- Full taxi/customer/driver, food/merchant/courier, catalog/checkout/settlement journeys, rollback and negative-role cases.
- Closed/background alert delivery with iOS/Android capability limitations, registration ownership, persistent outbox, ACK/retry and token lifecycle.
- Independent cross-tenant IDOR/privacy, data retention, load/SLO, security and backup restore acceptance.

## Evidence and operating boundary
- Source audit, public anonymous GET, Floot read-only DB SELECT and selected spec tests only; no authenticated private sessions, systematic pentest or exhaustive visual/device audit.
- No production, Google Cloud scaling, DB writes, Floot publication, feature activation, PR merge or financial commitment performed.
- See audit at `docs/reports/RELEASE-READINESS-AUTOPSY-2026-11-06.md` and live PRs #344/#346/#348-#355 for current status. Re-fetch main and exact-head Actions before further action.


## Floot internal Google-popup preflight correction — 2026-11-06 (new verification)
- Floot editor (not public release) now preloads the approved Preview-backend health check, allowlisted Firebase web config, compat SDK, and NONE persistence when a signed-out Khedmah session is confirmed. Google provider popup/redirect is invoked **synchronously from the click handler** before handing its pending Promise to React Query for confirmed-session handling. The prior flow awaited multiple network requests before opening the Google popup, risking browser popup blocking.
- The Google button remains disabled if preflight is unconfirmed; a non-disclosing retry message is available. Origin allowlist, cross-origin redirect prohibition, server-owned session and least-privilege policy are unchanged.
- Regression coverage: synchronous popup initiation in `helpers/khedmahPreviewAcceptance.spec.tsx` and no unready Google exchange in `helpers/khedmahPublicNavigation.spec.tsx`. Explicit full Floot run: 139/139 spec files PASS; TypeScript check CLEAN.
- Floot checkpoint: `64bceac6-47aa-4ddc-8423-18b9b7dc74ff`. Internal detail: `static/__dev/notes/google-login-popup-preflight-2026-11-06.md`.
- Independent anonymous GET from `khedmah.uk`: preview health 200 connected to preview V2 f4; verified public Firebase web config 200; unsigned Khedmah session 401 as expected. The separate Floot B2B /_api/auth/session 401 is not diagnostic of the Khedmah session.
- **Not certified:** real Google redirect/popup on iOS and Android, completed signed-in session on the user's account, upstream credential exchange, source/digest parity to Cloud Run, or production. Public Floot release remains `2026-11-04T00:01:39.684Z`. No production mutation, Cloud Run change, database write, feature activation or Floot publish performed.
