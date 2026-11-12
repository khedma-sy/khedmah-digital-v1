# Khedma Digital — Floot / GitHub release synchronization ledger

> **2026-11-12 LIVE CORRECTION:** [Floot live parity audit & transfer matrix](FLOOT-LIVE-PARITY-AND-LAUNCH-READINESS-2026-11-12.md) supersedes the 2026-11-10/11 statement that the Floot public release is still Nov 4. Floot web release `17944497863238012c746-3984-447f-b76c-d2cf67556dca`, 02:16:21Z 12 Nov, is published; 109 route files (37 canonical platform + 72 legacy/business/redirect), 32 Khedmah integrations and 159/159 helper specs PASS, TypeScript clean. **Documentation-only scoring update 36→47/100 PROVISIONAL** under the existing 10 fixed weights; do NOT change any P0 GO flag. Cloud backend parity, writer fence, actual restore, approvals, taxi ride and restaurant push still unproven. Sections below remain retained as historical evidence.


## 2026-11-11 — Owner Cloud Shell evidence saved to repository (NO-GO; schema and IAM gates)

**Canonical detailed receipt:** [Preview V2 owner read-only receipts — 2026-11-11](PREVIEW-V2-OWNER-READONLY-RECEIPTS-2026-11-11.md). This supersedes only older **claims of unverified state**, not the source-owned release requirements or safety gates.

| Newly established | Live finding | Release significance |
|---|---|---|
| SQL quota and 037 | Installed quota body exactly **025**, not 036; required routine/trigger shape intact; roles at target, verification-media predecessor, catalog `prerequisite-invalid` | **NO-GO** for migrating without writer fence, and for deploying backend requiring 037 |
| Regional jobs / schedulers | 9 schema Jobs last shown October 16, 30 sampled executions with completion timestamps, Scheduler `[]` in `europe-west1`, Cloud Tasks API `SERVICE_DISABLED` | Does **not** attest all writers stopped or every job succeeded |
| Backend / DB session snapshot | `00008-tg8` receives 100%; backend `MANUAL 1`; SQL sessions runtime/other migrator/other identities = `0` **at 15:41 UTC**; `pg_read_all_stats_member=false` | **`writer_quiescence_verified=false`**; no active/idle detail, no future writer fence |
| Frontend direct permissions | Service account `khedmah-pv2-frontend@khedmah-preview-v2-20261012.iam.gserviceaccount.com`; `NO_DIRECT_PROJECT_BINDINGS`; Policy Troubleshooter **`CANNOT_ACCESS`** for `cloudsql.instances.connect` on Preview DB | Denies that IAM permission in evaluated scope; does not rule out proxy, direct TCP/credentials, other writer paths |
| Candidate | 20/20 backend unit checks; build `43477d0a...`, immutable backend image `sha256:04c05...` **not deployed**; tool reports historical candidate `sha256:2146...` | Do **not** confuse images or infer 037 readiness from build success |

**Conservative evidence-readiness index remains 36/100 and release NO-GO** (not recalculated by this document). Most recent read-only owner receipt: 2026-11-11T15:41:16Z; Frontend Policy Troubleshooter returned `CANNOT_ACCESS` afterward (exact time not supplied). No SQL migration, Cloud Run deploy/scaling/traffic, IAM change or Floot public Publish occurred during these inspections. The single current documentation PR remains **DRAFT #368**; recheck CI on the new documentation commit.

---

## 2026-11-11 — Verified GitHub / Floot / Google handoff (NO-GO, no publication)

| Dimension | Fresh receipt | Classification / remaining gate |
|---|---|---|
| GitHub main | `2cae37037da91e2a75f0d482f04d9773a5bdde10`, merge #367; #359's quote source is already merged | **M**, not serving |
| Draft release docs | Only open PR #368, head `f017f997069727820e85e5813ed01c29175bb751` before this documentation commit, 3 exact-head workflow successes and 0 submitted reviews | Documentation-only; must recheck CI on new head |
| Floot Editor | version `1794384251846`; 155 ordinary Jasmine + 2 hooks **157/157 PASS**, TypeScript clean | **E**, not live UAT |
| Floot Published | November 4, release `1793750504473f0272d7f-c673-4f61-acff-130b2f13d3e9`, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`, domains `khedmah.uk`, `www.khedmah.uk` | **L**, older; do not publish blindly |
| Public GET parity | 16 Editor/live pairs: 14 matching HTTP statuses; legacy classified adapter **200/502** Editor/live, KORA anonymous **401/404**; canonical classified adapter **200/200** | **L**, endpoint-only, no full journey |
| Google Cloud Preview | Owner Cloud Shell verified backend revision `00008-tg8` at 100%, frontend ready `00003-pzm`; backend `f4f8ce2`. GET health/ready **200**, unauth session **401** | **L**, old serving image; independent immutable digest gate still needed |
| Cloud SQL | Owner read: instance RUNNABLE, backups Nov 9/10/11 SUCCESS, PITR true, encrypted-only SSL, public IPv4; 9 schema Jobs' latest listed October 16 completions successful | Partial **L**; NO writer-zero / current schema / isolated-restore proof |
| Quote mismatch | `f4f8ce2` lacks `expectedQuote` processing; main has validation and atomic SQL check, Editor forwards it. [P0 #369](https://github.com/khedma-sy/khedmah-digital-v1/issues/369) | **B** for safe launch pending isolated backend + authenticated 409 E2E |

**Readiness accounting:** keep the ledger's official **36/100** evidence score until all fixed-weight dimensions are deliberately recertified; a prior conversation's 38/100 was provisional after Cloud Shell reads. The new Cloud receipts improve evidence but **do not** close full writer/restore/roles requirements or override **NO-GO**. P0 owners: **CTO/BE/DevOps** backend compatibility; **DBA/SRE/Security** writer fence/isolated restore; **QA/SDET/Product** cross-role order, Google OAuth/mobile, taxi/push/admin acceptance. No new code fix, no additional Floot checkpoint, no production modification or merge. The PR comment receipts and issue #369 supply granular test/evidence details.

---

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
| Protected main, PR workflow and CI | 8 / 10 | main and #368 exact-head CI green; #368 still DRAFT with zero independent APPROVED reviews |
| Floot editor UI/code/test readiness | 7 / 10 | 109 routes; TypeScript clean; 155 specs pass when serial rerun, but concurrency-sensitive quote spec and missing device rendering |
| Floot published parity | 3 / 15 | 2026-11-04 publish is older, 55 helper/endpoints diverged, two sampled route mismatches |
| Google auth, roles, isolation | 2 / 10 | unauthenticated routes deny as expected, no positive cross-role/mobile acceptance |
| Cloud Run, SQL, isolated restore and rollback | 3 / 15 | health 200 only; image/traffic/writer/restore/schema gates unproven |
| Store, classifieds, restaurant and commerce journey | 3 / 10 | public read routes and unit specs, no full customer→merchant→courier reconciled run |
| Taxi, driver documents, Smart Admin | 2 / 10 | safety contracts/source, operational mutation deliberately disabled |
| Background order and courier notifications | 1 / 5 | foreground 30-second polling/ring; closed-app device push not proved |
| Business Desk, tenders and entitlements | 3 / 5 | public tenders and source implementation; no subscriber/payment/alerts journey |
| SDET/UAT, device UX and observability | 4 / 10 | 155/155 spec files pass sequentially, TypeScript clean; no signed mobile/desktop E2E or SRE rollback |
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
| R12 | P1 | Parallel Jasmine tool invocations on the same Floot project caused conflicting test state (mocked fetch/localStorage). Full rerun in eight strictly sequential batches **155/155 spec files PASS, 0 FAIL**. No proven checkout product defect; require serialized test execution until runner isolation is demonstrated | SDET / FE | stable isolated CI reruns and no stale location/price acceptance across address/quantity changes |
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

## QA execution correction — 2026-11-10

- **Definitive observed run:** eight `mcp__Floot__run_tests` calls invoked **sequentially**, batches of 20, last batch 15: **155 PASS / 0 FAIL**, including checkout delivery quote and all Business Desk files. TypeScript also clean.
- **Avoid concurrent runs in this same Floot project.** Running multiple `run_tests` calls concurrently led to repeatable shared-state failures in the quote test's asynchronous prerequisite. A temporary 8-second test timeout change was trialled, did **not** fix concurrent collisions, and was **reverted**. Do not label the test fail fixed by a larger timeout, and do not equate isolated Jasmine success with cross-account/order E2E acceptance.
- The score remains **36/100** because this verification does not close the live Google auth, Cloud SQL, checkout acceptance, device push or rollback gates.

## Hourly evidence — 2026-11-10 01:55 UTC (automation run 1)

- **GitHub fresh:** protected main `2cae37037da91e2a75f0d482f04d9773a5bdde10` unchanged; exactly **one open PR**, [#368](https://github.com/khedma-sy/khedmah-digital-v1/pull/368), head `ebb90de4180dfa1ea119aaa471813167a4ee73ba`, still **DRAFT** and **zero reviews**. All 6 applicable exact-head check-runs completed **SUCCESS**, 6 non-applicable jobs **SKIPPED**. Main's 4 applicable checks also SUCCESS; no permission to merge follows.
- **Floot editor:** version `1794273045532`, 155 spec files inventory, TypeScript `clean` on current source. The last verified complete **sequential** run was 155/155 PASS; it was **not rerun in full** in this hourly cycle. `khedmahApprovalExecution.enabled=false` and `khedmahForegroundRing` refuses hidden-tab sound by source read.
- **Published:** still 2026-11-04T00:01:39.684Z / `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`, domain `khedmah.uk` and `www.khedmah.uk`. 55 changed helper/endpoint files **not live**. Published `discoverSources` every 6 hours (next 2026-11-10 03:00 UTC) and `buildTenderAlerts` daily (next 05:00 UTC) continue executing old release code. Published background check at 01:55 UTC reported no active run, and no cut-off run in the last 7 days; this is not proof of alert delivery.
- **Floot-managed database SELECT:** 86 tenders, 0 client-access bindings, 0 alert deliveries, 0 service payments. These counts do not prove or disprove live subscription eligibility, and this database is **not Cloud SQL**.
- **Mobile visual check:** Floot screenshot job timed out after 15 minutes waiting for an open user preview tab. **No screenshot captured.** Do not mark mobile/RTL acceptance.
- **Cloud Run / Cloud SQL:** no authenticated fresh GCP access receipt in this cycle. Prior backend `f4f8ce2` and SQL backup/schema information are dated; exact serving image/traffic, writer fence, isolated restore and release authorization **still unverified**.
- **Score:** **36/100 (Δ 0)**, **NO-GO**. Score did not increase for CI success or test-source presence because independent release gates and live parity are still missing. Evidence confidence: high for GitHub and Floot metadata, partial for anonymous/live logs, unavailable for authenticated GCP and device acceptance.
- **Action this run:** repaired the stale ledger's CI and 155-spec wording; source-only documentation on #368 + Floot editor note, no functional code change, no production mutation. **Next Safe Action:** obtain read-only independently signed Cloud Run serving image/revision/traffic + Cloud SQL writer-quiescence/schema/isolated restore receipt before compatible Preview acceptance.

## Hourly evidence — 2026-11-10 03:05 UTC (automation run 2)

- **GitHub live:** protected `main=2cae37037da91e2a75f0d482f04d9773a5bdde10`; exactly one open PR, [#368](https://github.com/khedma-sy/khedmah-digital-v1/pull/368), exact head `af287b09538606750d9f04d237f8ac2b405d834d`, **DRAFT**, zero submitted reviews. Exact-head **six SUCCESS, six SKIPPED** checks and three workflow runs SUCCESS. Main's four applicable checks SUCCESS; no independent approval.
- **Floot Editor:** version `1794275739453` at inventory before this run's safety-regression write, 155 original spec files, 109 previously counted routed pages. New **`helpers/khedmahReleaseGateRegression.spec.tsx`** protects the immutable disabled Smart Admin and driver-document upload gates with authenticated-looking requests and asserts **503 + no upstream fetch**. This is a source-only test, NOT activation. **156/156 Jasmine spec FILES PASS** in eight strictly sequential batches (20×7 +16), TypeScript `clean`.
- **Floot Published:** still **2026-11-04T00:01:39.684Z**, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`; `khedmah.uk` and `www.khedmah.uk` attached. No public publish, no new code live.
- **Google Preview public GET, 2026-11-10 03:02 UTC:** `/api/v1/health` **200**, reports `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`; `/api/v1/health/ready` **200** with `database:ok`; anonymous `/api/v1/auth/session` **401**, `/api/v1/categories` **200**. This is NOT authenticated Cloud Run serving image/traffic, SQL schema, all-writer isolation or restore evidence.
- **Floot published schedule, fresh logs:** `discoverSources` invoked **03:00:09 UTC**, completed **03:01:28 UTC** with `success:true` and duration 78.758 seconds; executes Nov 4 published code, NOT current editor code. `buildTenderAlerts` next scheduled **05:00 UTC**. No push sends in sampled window.
- **Floot database SELECT:** 86 tenders, 68 discovery runs, 0 client access bindings, 0 alert deliveries, 0 service payments. These are **Floot DB** rows, not Cloud SQL. A successful scheduled discovery is not evidence of successful alerts or paying customers.
- **Score unchanged:** GitHub 8/10, Editor 7/10, Published parity 3/15, Auth 2/10, Cloud 3/15, Commerce 3/10, Taxi/Admin 2/10, Push 1/5, Business 3/5, QA/UAT 4/10 = **36/100 (Δ0), NO-GO**. High confidence for current GitHub/Floot metadata and source tests; partial for anonymous HTTP and published logs; unavailable for authenticated GCP, device E2E, Cloud SQL restore.
- **Top P0:** (1) serving backend/editor contract compatibility (CTO/BE/DevOps), (2) Cloud SQL writer fence/schema and isolated restore (DBA/SRE/Security), (3) real cross-role Google/customer→merchant→courier/driver/admin acceptance and background notifications (QA/SDET/PM). **Next Safe Action:** independently signed **read-only** Cloud Run image/revision/traffic and Cloud SQL writer-quiescence/schema/isolated restore receipt before any release decision. No production mutation.

## Hourly evidence — 2026-11-10 03:55 UTC (automation run 3)

- **GitHub live:** protected main `2cae37037da91e2a75f0d482f04d9773a5bdde10`, exactly **one open PR** [#368](https://github.com/khedma-sy/khedmah-digital-v1/pull/368), head **`a69d5c5e0979dfa17e5f7db1a663d0932a7c8941`** before this documentation update, still **DRAFT**, **0 submitted reviews**. Exact-head checks **6 SUCCESS / 6 SKIPPED**, main **4 SUCCESS / 1 SKIPPED**. This ledger update creates a **new PR head requiring fresh checks**.
- **Repository control documents:** `CURRENT-STATE.md` and `NEXT-ACTION.md` on main still lead with November 9 observations (`cc8d498`, 14 open PRs); their counts are **historical** and superseded by live GitHub checks above. Do not rewrite main without review.
- **Floot Editor:** current inventory before test change `1794279885993`, **156 spec files**; safety-regression `helpers/khedmahReleaseGateRegression.spec.tsx` now also checks both sensitive POST routes reject forged Origin (403) and query-string enable switches (400), with no upstream `fetch` and private no-store responses. No sensitive execution toggle was enabled. Targeted 4/4 spec files PASS; **full 156/156 PASS** in eight **sequential** batches (20×7 +16), no concurrent test tool calls. TypeScript check must be read independently after editor note update.
- **Floot Published:** still **2026-11-04T00:01:39.684Z** digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`, attached `khedmah.uk` and `www.khedmah.uk`. Latest editor test and guard changes are **NOT live**; publishing forbidden until reviewed release gates.
- **Floot DB READ-ONLY:** **86 tenders**, **69 discovery runs** (previous 68), **0 client-access bindings**, **0 alert deliveries**, **0 service payments**. This is **not Cloud SQL**. Discovery counter change does not establish paid delivery or any actual alert.
- **Google Preview:** no fresh authenticated Cloud Run/Cloud SQL read or independently signed serving revision/image/traffic, writer quiescence, schema, isolated restore in this cycle. Previous anonymous health `f4f8ce2` is a historical receipt only; do not assert current serving revision from it.
- **Score 36/100, delta 0, NO-GO:** GitHub 8/10, Floot Editor 7/10, published parity 3/15, auth 2/10, Cloud/SQL 3/15, commerce 3/10, taxi/admin 2/10, push 1/5, Business 3/5, QA/UAT 4/10. Evidence high for GitHub/Editor source tests/publish metadata, partial for Floot DB, unavailable for current authenticated GCP and live role/device acceptance. G0–G8 not proven.
- **P0 top three:** (1) serving backend/editor contract compatibility — CTO/BE/DevOps; (2) SQL writer fence/schema/isolated restore — DBA/SRE/Security; (3) live cross-role Google/order/taxi/Smart Admin/closed-device notifications — QA/SDET/PM.
- **Next Safe Action (one):** obtain independently signed **READ-ONLY** Cloud Run exact serving revision/image/traffic and Cloud SQL writer-quiescence/schema/isolated restore evidence. No merge, public Floot publish, Cloud/SQL mutation, or activation.

## Safe Floot transfer attempt — 2026-11-10 09:25 UTC (NO-GO)

- New code change **ONLY in Floot editor**: owner's professional availability selector now labels itself `التوفر الذي تعلنه للعملاء (ليس حالة الاتصال المباشر)`, preserving all enum values and existing write/role checks; added regression in `helpers/khedmahManagementUi.spec.tsx`. This extends merged #367's declared-vs-online distinction and is not represented as a GitHub code commit.
- Floot editor source before handoff docs `1794302563642`: TypeScript clean; **156/156 Jasmine spec files PASS in 8 sequential batches**. Other staged source only; **no public publish**.
- Floot published release still dated Nov 4, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`. Direct read-only route differential: canonical classifieds listing 200/1 on both tiers; legacy classifieds 502 published/200 editor; KORA module 404 published/401 anonymous editor. One published health probe 502, followed by three 200/`upstreamStatus:ok` replies per tier; flag intermittent sample, not continuous outage. Backend health still self-reports `f4f8ce2`; this is NOT Cloud Run exact serving-image/SQL attestation.
- Floot branch/fork with isolated schema-only DB **failed without any change**: branching not enabled for account. Thus no safe-only branch artifact can be isolated through the available Floot tools. Current Floot Publish sends the **entire editor code and scheduled jobs** live; it is not a file-selective deployment. A live publish would bring ~56 changed helper/endpoints and worker logic without compatibility/restore/review gates.
- Saved editor-only safe release handoff at `static/__dev/releases/SAFE-PUBLISH-HANDOFF-2026-11-10.md`. **Release decision 36/100 (delta zero), NO-GO**; G0/G3/G7, independent approvals, cross-role UAT, Cloud SQL writer/quiescence/isolated restore and rollback gates remain unproven.
- Next Safe Action: obtain a supported isolated Nov-4 baseline/safe-only publish artifact or a reviewed complete pending-code matrix plus signed runtime/SQL gates; only then consider an expressly authorized reversible public publish. No Cloud/SQL mutation or paid/taxi/admin/push activation.

## Safe professional guidance correction — 2026-11-10 (Editor only)

- Floot owner professional page previously showed a generic prompt to send for review **even if the server already returned approved or pending**. Changed `components/KhedmahProfessionalManage.tsx` to show state-specific instructions: approved -> view published card; pending -> no duplicate submission; rejected/suspended/missing eligibility -> cautious, non-assumptive language; draft -> ordinary completion guidance. Permissions, moderation/approval flags, API requests and availability enum are unchanged.
- Updated regression `helpers/khedmahManagementUi.spec.tsx`: verified approved/pending guidance does not show stale prompt, and draft advice remains accurate. Three targeted specs PASS; **156/156 Floot Jasmine spec files PASS in eight *serial* batches**; TypeScript clean. **Only Floot editor source changed**: not a GitHub implementation commit and not live.
- Both tiers' health GET 200 reporting older backend `preview-pr-274-f4f8ce2...`; canonical classifieds 200+one ad both; legacy classifieds 502 live vs 200 editor; KORA anonymous 404 live vs 401 editor. Live release still `2026-11-04T00:01:39.684Z`, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`. Floot DB counts (not Cloud SQL): tenders 89, discoveries 70, alert preferences/deliveries 0, client access 0, payments 0.
- **NO-GO, readiness 36/100 unchanged:** Floot Publish would deploy all 56 newer helper/endpoint changes and scheduled worker code; source-isolated Floot branches unavailable, independent backend/SQL writer, restore and cross-role real-device gates absent. Avoid public publish, merge or sensitive activation. Next Safe Action: certify an isolated, reversible safe-only Floot artifact or full-serving compatibility and recovery gates.

## Safe UI-only isolation manifest — 2026-11-10 10:36 UTC (Editor preparation, NO-GO)

- Live source facts: protected `main=2cae370`; only open PR #368, draft head at inspection `1638e849`, six exact-head checks successful and six skipped, no independent approval. `CURRENT-STATE.md` and `NEXT-ACTION.md` on main contain historical Nov-09 PR counts and must not be used as current status.
- Floot editor at inspected source version `1794306690043`: **157 Jasmine spec files; 157 PASS/0 FAIL in eight strictly sequential batches (20×7 + 17)**, TypeScript clean. Newly present nearby geolocation accessibility spec already existed at the start of this inspection (do not misattribute concurrent change). Floot currently reports **57 helper/endpoint files changed** since 4-Nov publication.
- Created **EDITOR-ONLY** `static/__dev/releases/SAFE-UI-ALLOWLIST-2026-11-10.md` with file SHA256 hashes and allowed *UI text/conditional-rendering hunks* for professional declared availability, owner review guidance, nearby city fallback and public search/provider cards. Entire owner modules include writes, so **whole-file cherry-picking is not a safe release**. Legacy classifieds endpoint fix is a separate server-side candidate and cannot be bundled under UI-only signoff. This file is not an isolated publish artifact; Floot `static/__dev` files are excluded from the production build.
- Both Floot published/editor anonymous read checks: Preview health **200/200** reporting backend `f4f8ce2` (not an authenticated Cloud Run image/traffic/SQL attestation); canonical classifieds **200/200** one ad; legacy classifieds **502 published vs 200 editor**; KORA module **404 published vs 401 editor**. Floot DB READ-ONLY: 89 tenders, 70 discoveries, zero client access, alert preferences, alert deliveries and service payments. Published log shows legacy route request and stream completion, not a confirmed low-level 502 cause.
- Floot published release remains `2026-11-04T00:01:39.684Z`, sourceDigest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`, domains `khedmah.uk`/`www.khedmah.uk`. Floot branches were rejected as unavailable for this account; the tool does not provide last-live release bytes/manifest. **NO PUBLIC PUBLISH**: Floot publishing replaces the entire currently edited app and active scheduled-job code, including unreviewed 57 helper/endpoints.
- Decision `36/100` (delta 0), `NO-GO`: G0–G8 recovery, writer isolation, release compatibility, independent role/device UAT and approvals are still unproven. **One Next Safe Action:** securely retrieve the Nov-4 Floot Version History source manifest/bytes AND obtain a supported isolated-branch/safe-only publish path, then validate a reviewed hunk-level diff and signed independent gates before any public publish.

## Hourly reporting contract

Every run reports current GitHub main/PRs/Actions, Floot editor version, Floot live release digest, Preview backend version, 36/100 baseline score with delta according to the *same 10 weights*, status per launch-critical module (M/E/L/S/B/U), top 3 P0 failures, actual safe fixes/tests/checkpoints/links, findings newly resolved or reopened, and **one Next Safe Action**. Do not overwrite prior evidence or convert uncertain data into completed claims.

## Hourly read-only verification — 2026-11-10 06:01 UTC

- GitHub protected main `2cae37037da91e2a75f0d482f04d9773a5bdde10`; only open PR #368, DRAFT head `ae215c8404bafabd229f33f34ccbc9975ce4c524`, 6 SUCCESS/6 SKIPPED exact-head checks, zero independent submitted reviews. Main checks 4 SUCCESS/1 SKIPPED.
- `CURRENT-STATE.md` and `NEXT-ACTION.md` on main still lead with 2026-11-09 and old `cc8d498`/14-PR references: historical, not live authority.
- Floot editor version `1794283046045`, 156 spec files; 8 **sequential** test batches (20×7+16) **156 PASS/0 FAIL**. Floot published 2026-11-04T00:01:39.684Z, source digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`; 56 helper/endpoint files newer than publish. Domains `khedmah.uk` and `www.khedmah.uk` remain attached.
- Published scheduled `discoverSources` next 09:00 UTC 2026-11-10, `buildTenderAlerts` next 05:00 UTC 2026-11-11. No running jobs at 06:01 UTC. Database READ ONLY: tenders 86, discovery runs 69, client access 0, alert preferences 0, alert deliveries 0, service payments 0, user tender submissions 0. Scheduled execution does not establish delivery.
- No new authorized Cloud Run/Cloud SQL image/traffic/writer/isolated-restore attestation; historical backend `f4f8ce2` remains unverified this hour. No signed real-device UAT. Score **36/100 unchanged; NO-GO**. No production mutation, publish or merge.
- Next Safe Action: independent read-only Cloud Run image/traffic plus all SQL writers, current schema and isolated restore evidence.

## Hourly read-only verification — 2026-11-10 07:06 UTC

- GitHub protected `main=2cae37037da91e2a75f0d482f04d9773a5bdde10`. Only open PR #368 is DRAFT at `e3f68c606e06bdb456d1a6b9968c3ee6b0b4c75b`, zero GitHub reviews. Exact-head checks: 6 SUCCESS / 6 SKIPPED; 3 exact-head workflows SUCCESS. No merge approval. Main: 4 SUCCESS / 1 SKIPPED. `CURRENT-STATE.md` and `NEXT-ACTION.md` still start with historical Nov 9 `cc8d498` and 14 open PRs; do not treat their counts as current.
- Floot editor version `1794290564880`; 156 Jasmine spec files, **156 PASS / 0 FAIL** in eight strictly **sequential** batches (20×7+16). TypeScript clean. No new functional defect isolated in this cycle; do not fabricate a code fix.
- Published release still `2026-11-04T00:01:39.684Z`, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`; 56 changed helper/endpoint files are **EDITOR-ONLY**. Custom domains `khedmah.uk`, `www.khedmah.uk` attached. No public publish performed.
- Background read at 07:06:31 UTC: no running jobs, `discoverSources` next 09:00 UTC today; `buildTenderAlerts` next 05:00 UTC tomorrow. Published schedules use Nov 4 code. Floot DB SELECT: 86 tenders, 69 discovery runs, 0 alert preferences, 0 alert deliveries, 0 client access, 0 service payments, 0 user submissions. These are not evidence of working subscriptions/notifications.
- Preview Cloud Run **not authenticated/inspected this cycle**; previous `f4f8ce2` is historical, not freshly attested. No current Cloud SQL writer/schema/isolated restore evidence or cross-role/mobile acceptance. No new change in production score: **36/100 (delta 0), NO-GO**. Evidence confidence: source checks HIGH; editor tests HIGH; Floot publish metadata HIGH; business database SELECT HIGH for counts only; Cloud Run/SQL/real-device E2E UNAVAILABLE.
- Top P0: serving image and contract parity (CTO/BE/DevOps); writer fence/current schema/isolated restore (DBA/SRE/Security); Google auth, cash order, taxi, approvals and closed-device notifications real UAT (QA/SDET/PM). **One Next Safe Action:** independent, authorized READ-ONLY Cloud Run serving image/revision/traffic and Cloud SQL writer/schema/isolated-restore attestation. No production mutation.

## Hourly read-only verification — 2026-11-10 08:02 UTC

- Protected `main=2cae37037da91e2a75f0d482f04d9773a5bdde10`; only open PR #368 DRAFT at `f9bba00ab7d9da703500d5bfa305405b118bd841`, no submitted reviews. Three exact-head PR workflows SUCCESS (Node.js CI 42773039664, Test & Verify 42773039708, PR Preview 42773040070). Main CURRENT-STATE/NEXT-ACTION front matter still dated 2026-11-09, not current PR inventory.
- Floot editor `1794294418358`, TypeScript CLEAN; 156/156 Jasmine files PASS, 0 FAIL in eight strictly sequential batches (20x7 + 16). No functional code change or regression spec added: no new reproducible defect isolated; test success does not prove publish.
- Floot published metadata unchanged: 2026-11-04T00:01:39.684Z, digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`, domains `khedmah.uk` and `www.khedmah.uk`. Editor-only safety fixes remain unpublished. Published logs show SSR GET / -> /platform at 07:13 UTC, not full route/device UAT.
- Floot published background read at 08:01:58 UTC: no running jobs, `discoverSources` next 09:00 UTC, `buildTenderAlerts` next 2026-11-11 05:00 UTC. Floot database SELECT: 86 tenders, 69 discovery runs, 0 alert preferences, 0 alert deliveries, 0 client access, 0 service payments, 0 user tender submissions. Floot database is not Cloud SQL.
- Google Cloud authenticated serving revision/image/traffic and Cloud SQL writer/schema/isolated restore not available this cycle; historical `f4f8ce2` is NOT a new attestation. No independent role/device UAT. Weighted score 36/100 (delta 0), NO-GO; G0-G8 unproven. P0 owners: CTO/BE/DevOps for runtime compatibility; DBA/SRE/Security for SQL isolation/restore; QA/SDET/PM for cross-role Google/orders/taxi/approvals/closed-device alerts.
- Next Safe Action: independent authorized READ-ONLY Cloud Run serving revision/image/traffic and Cloud SQL all-writer/schema/isolated restore receipt. No merge, public Floot publish, Cloud/SQL mutation, financial/taxi/FCM/Smart Admin activation.

## Hourly evidence — 2026-11-10 09:59 UTC

- Live GitHub main `2cae37037da91e2a75f0d482f04d9773a5bdde10`; only open PR #368 DRAFT at `c51688b25a10e1c04010f040b7a094b3db082b20`, zero independent reviews. Exact-head checks **6 success, 6 skipped**; CI passing is not release authorization. Main `CURRENT-STATE.md` and `NEXT-ACTION.md` still lead with Nov-9 stale main `cc8d498` and 14 PRs; not live.
- Floot Editor `1794302846383`; TypeScript **CLEAN** and **156/156 Jasmine files PASS** in 8 sequential batches (20×7+16), no concurrent `run_tests`. Previously added professional self-declared availability clarification and regression remain staged. No new code fix was necessary this cycle; no false PR churn.
- Published Floot remains Nov 4 `2026-11-04T00:01:39.684Z` digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`; `khedmah.uk` and `www.khedmah.uk`. Safe editor-only UI change and 56 changed helper/endpoints are **NOT LIVE**. Floot fork remains unavailable; safe-only publication cannot be isolated. Background at 09:59 UTC: no active runs; discoverSources next 15:00 UTC; buildTenderAlerts next Nov-11 05:00 UTC, still using Nov-4 published code.
- Last 09:25 UTC anonymous published/editor health probes showed one transient published 502 then 3 consecutive 200 per tier with upstream `f4f8ce2`; no authenticated Cloud Run image/traffic/SQL writer/isolated restore evidence this cycle. No independent real-device role/order/driver/Smart Admin/push acceptance.
- Score unchanged **36/100 (delta 0), NO-GO**; fixed weighted split GitHub 8/10, Editor 7/10, Published 3/15, Auth 2/10, Cloud/SQL 3/15, Commerce 3/10, Taxi/Admin 2/10, Notifications 1/5, Business 3/5, QA/UAT 4/10. Evidence verified for GitHub CI, Floot source tests, published release metadata; incomplete for cross-tier E2E; unavailable for authenticated Google Cloud and real-device UAT.
- P0 owners: (1) CTO/BE/DevOps — backend serving image and contract compatibility; (2) DBA/SRE/Security — SQL writers/schema/isolated restore; (3) QA/SDET/Product — independent Google auth, commerce, taxi, approval and closed-device notification acceptance. **Next Safe Action:** obtain independently authorized read-only Cloud Run serving revision/image/traffic plus Cloud SQL writer/schema/isolated restore receipts, then review the safe-only release artifact. No merge, public publish or production mutation.


## 2026-11-11 — Frontend Cloud SQL IAM effective-denial (NO-GO)

- Owner Cloud Shell read-only: Frontend identity `khedmah-pv2-frontend@khedmah-preview-v2-20261012.iam.gserviceaccount.com`, exact project member `NO_DIRECT_PROJECT_BINDINGS`. Policy Troubleshooter for `cloudsql.instances.connect` on `//cloudsql.googleapis.com/projects/khedmah-preview-v2-20261012/instances/khedmah-preview-v2-db` returned `overallAccessState=CANNOT_ACCESS`. This does not exclude DB password/IP or indirect Backend writes. No IAM mutation.
- Owner SQL read-only snapshot 2026-11-11T15:41:16.222054Z: `runtime_sessions_total=0`, `migrator_sessions_other=0`, `other_sessions_by_identity=0`; `pg_read_all_stats_member=false`; `writer_quiescence_verified=false`. Backend `00008-tg8` MANUAL 1 at 100%, NOT fenced. Cloud Tasks API `SERVICE_DISABLED`, not confirmed zero queues.
- GitHub main `2cae37037da91e2a75f0d482f04d9773a5bdde10`; only open DRAFT #368 head `31b72df28db301556b74827c4620d92e8124ce5f` **before this commit**, 3/3 completed successful PR workflows. Floot Editor `1794411992639` before ledger update; targeted sequential Jasmine **4/4 PASS** (adapter security, public classifieds, professional availability and management). Full suite NOT rerun; public Floot still last verified 2026-11-04, `khedmah.uk` / `www.khedmah.uk`.
- Backend `f4f8ce2` still lacks `expectedQuote`, new `sha256:04c05ae5...` build-only; SQL 036/037 prerequisites invalid. **NO-GO; official 36/100 delta 0**. P0: CTO/BE/DevOps old quote contract; DBA/SRE/Security writer/restore; QA/SDET/Product role/mobile/device UAT. Next safe action: independently enumerate all writer paths and effective DB permissions and certify isolated restore target. No Cloud Run deployment/scaling, SQL writes, production Floot publish or merge.
