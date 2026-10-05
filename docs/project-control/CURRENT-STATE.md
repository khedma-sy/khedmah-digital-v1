# Khedmah Digital — Current State

Updated: 2026-10-05. This is a dated evidence checkpoint, not permission to execute a Production operation. Live GitHub refs, run results and source were re-read for this update.

## Authority and branch location
- Repository: `khedma-sy/khedmah-digital-v1`.
- Production project: `khedma-dl`; approved region: `europe-west1`.
- Last re-read protected main: `a2a26f8b27e63a2e041e43d5657cf2ce78700c24` (PR #250 merged at 2026-10-05 05:34:48 UTC).
- These control documents are on `chore/project-control-floot-readiness-2026-10-04`, PR #249. They are NOT yet merged into main.
- A read of `docs/project-control/CURRENT-STATE.md` on the main SHA above returned 404; the recursive tree also confirms it is absent. Read this PR branch until it is merged. The entry point required by `AGENTS.md` remains [the live roadmap checkpoint](../../ROADMAP-EXECUTION-2026-09-08.md), synchronized in this same change.
- PR #250 is merged; PR #249 is the only open PR observed. This documentation update incorporates the new main into #249 without changing executable source relative to that main.
- Re-read main, the current PR head and its exact-SHA checks before acting. Never use a previous SHA's green checks to certify a newer head.

## Computer-available operating mode — active
The owner confirmed on 2026-10-05 that they are back at a computer and can execute Cloud Shell commands when requested.
- Read-only Cloud Shell checks may resume one short reviewed command at a time.
- This is NOT blanket approval for PREPARE, HARDEN, migrations, Terraform APPLY, Production deployment, password rotation, IAM/secret changes, DNS changes, or any other mutation.
- Re-read exact main/PR heads and live evidence before every cloud command.
- Continue GitHub code review, CI, tests and documentation while mutation gates remain open.

## Production database state — cutover not proven
Latest GitHub workflow dispatch re-read: [PREPARE run 37183178537](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37183178537), on `5a961be5035dce1197ba2d0c65519e86f65ca4c6`. No later dispatch was returned, including after the #250 merge. This does not rule out out-of-band cloud changes.
- Identity guard and image build succeeded.
- Failed at `Classify resumable prepare role state`.
- Password rotation, role PREPARE/cutover, restart/containment, final credential rotation, isolation verification, and active-alias commit were skipped.
- This failure was before database/secret cutover, NOT before all cloud activity: the bootstrap image was built.
- Do not rerun this failed Production workflow as a retry shortcut.
- GitHub returned no in-progress or waiting run at this audit. An old [Identity readiness run 34870013974](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/34870013974) is queued on a recovery-branch SHA from 2026-09-14 with no jobs returned. It is not current-main evidence and was not changed.

## Completed read-only owner observation
The owner already ran the Cloud SQL user-list query. Do not ask for the same table again as though it were missing.

| User | Type | Displayed databaseRoles |
| --- | --- | --- |
| khedmah_app | BUILT_IN | blank |
| khedmah_migrator | BUILT_IN | blank |
| postgres | BUILT_IN | blank |

Blank Admin API metadata does not prove PostgreSQL membership or absence of privileges. Actual Production PostgreSQL memberships remain unverified in this session. The merged #250 probe reads PostgreSQL membership, but its enclosing workflow builds an image and deploys/executes Cloud Run jobs. It is not a metadata-only cloud operation and remains held until its gates are reviewed.

## PR #250 — merged source and exact-SHA evidence
Final implementation head: `308bc00c880ce5cbc1ff7dcb04c657ae426b3f19`; merge: `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`.

The implementation classifies `initial`, `resume` and `completed` from PostgreSQL memberships, retains the exact Cloud SQL user/type allowlist, tries enabled migration credential selectors without rotating them during classification, rejects invalid memberships, and preserves the caller's errexit mode. Expected membership arrays now use the same sorting as observed arrays; the custom-role-name regression is present. The P2 review thread is resolved.

| Source SHA | Independently re-read GitHub runs | Result |
| --- | --- | --- |
| Final #250 head `308bc00...` | [Node CI 37266387832](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37266387832), [Test & Verify 37266387918](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37266387918), [PR Preview 37266387803](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37266387803) | SUCCESS |
| Merged main `a2a26f8...` | [Node CI 37268416230](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37268416230), [Test & Verify 37268416222](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37268416222) | SUCCESS; PR Validation is skipped for the push event, not a missing PR approval |

On the executable source from this main, local Node.js v24.19.0 ran the 18 workflow-contract cases plus nine isolated Bash-runner cases: **27 passed, zero failed**. The runner intercepts gcloud with mocks; this is not a live PostgreSQL, IAM or recovery test.

The returned review history contains COMMENT reviews on older head `d053350...`, not an independent APPROVED review for `308bc00...`. The Codex P1 request to update the same live roadmap checkpoint remained relevant after merge and is addressed in this documentation change. Source merge and green CI do not certify Production cutover.

## Production gate audit — open
Detailed gate requirements and the first metadata-only command are in [PRODUCTION-RECONCILIATION.md](PRODUCTION-RECONCILIATION.md).

- Current role workflow has no backup input, backup freshness check or restore/PITR validation. Its runtime-containment recovery is not a tested backup restore.
- Canonical active-account and service-account-existence checks do not establish the current effective Secret Manager/IAM permissions.
- PREPARE may legitimately start without an `active` alias and inspect enabled numeric versions. Metadata does not prove any selector authenticates.
- `Rotate migration password before runtime cutover` creates a transition secret version and changes the migrator password before the later `prepare` SQL phase compares the actual system-role manifest. A syntactically valid hash is not prior proof of a match. Review the current manifest and recovery evidence before any dispatch.
- All database role workflow modes build an image; INVENTORY/VERIFY also deploy and execute Cloud Run jobs. Read existing execution/log/secret/backup metadata first. Do not dispatch a Production workflow merely because its SQL is read-only.

## PR #249 — source-backed control and integration preparation
This PR holds the execution plan, schema gates, Google/Floot boundaries and next action. Its documents are not on main yet. Any new documentation commit requires its own CI check; do not reuse an earlier documentation head's green results.

Completed repository-only preparation, pinned to main `5a961be...`:
- [Authentication transport contract](../floot-migration/AUTH-API-CONTRACT.md): eight current authentication endpoints, frontend-origin `/api/v1` rewrite, Firebase ID token to Khedmah cookie exchange, and cookie/origin requirements.
- [Errors, personal profile and Operations Product access](../floot-migration/ERROR-PROFILE-ACCESS-CONTRACT.md): shared error envelope/decoder, two personal-profile routes, six Operations Product routes, eight operational roles and their seven permission names.
- The second contract explicitly distinguishes pending change/rollback requests from executed infrastructure actions; configuration summaries from live cloud health; and in-process Operations Product queues from a proved durable approval system. It does not claim all audit storage is memory-only.
- Twelve targeted decoder cases passed locally against the exact source blob `1a29eecfbad616c567bf0278b6004a2b0ddea4da`, using Node.js v22.16.0 and no network/cloud/database. This is not a backend/RBAC/HTTP/Floot acceptance test.
- [Category and public discovery contract](../floot-migration/DISCOVERY-API-CONTRACT.md): database category authority, six public list/detail/search routes, unified query fields, distinct professional endpoint, independent collection pagination, capped map behavior, URL state and open validation-parity findings.
- Twenty-four pure frontend discovery/search helper tests passed locally on exact blobs `772e1bd5f4dc1133ba7efe60ab4fd8f2a33c1b57` and `0b87ad933ae827f614c453557fafb1a705c5968d`, with Node.js v22.16.0 and TypeScript 5.8.3 transpilation. This is not backend, database, React/browser or Floot acceptance.
- [Restaurant, cart and order-entry contract](../floot-migration/FOOD-CART-ORDER-CONTRACT.md): partial restaurant discovery, public product cap, nominal cart/storage behavior, promotion quotation versus initial creation, server-owned prices and user/key retries. Full fulfillment and actual payment collection remain outside that slice.
- Twenty-four local cart tests passed on exact blob `8f33c668d77a1051d7c53662e065da753015401d` with Node.js v22.16.0. Twenty cover normal/current behavior; four characterize limitations (empty IDs, duplicates, storage-error propagation, fractional deltas). Passing characterization tests do not certify those limitations as acceptable. No executable repository file was changed.
- Food findings retain the 100-product cap, menu/business category and currency differences, storage failure handling, and unverified account-switch/privacy recovery. Quote response, placed order, customer confirmation and cash collection must not be conflated.
- [Fulfillment lifecycle contract](../floot-migration/FULFILLMENT-LIFECYCLE-CONTRACT.md): actor-resolved transitions, courier eligibility, SQL-intended transaction/notification boundaries, tracking and field disclosure, notification APIs, polling and cash-confirmation limits.
- Fifty-two isolated local service tests passed on three byte-verified source blobs; 30 of them check 300 role/from/to combinations. Identity/session extraction, Nest wrappers and repositories were doubles; real action validation ran. The pre-accept delivery-address disclosure test is characterization, not policy approval. This does not certify PostgreSQL races, real auth, HTTP, browser delivery or physical cash.
- Explicit open findings include pre-accept address/note/coordinate disclosure, 100-order caps, tracking/polling freshness, and reported versus reconciled cash. See the lifecycle contract; no silent runtime correction was made.
- Floot routing/header compatibility, domain authorization, browser acceptance and any new credential requirement remain open; the documents do not claim an integration is live.

At the start of this reconciliation, #249 was Draft/behind main at `11cb5ac8e2b1cb2ad46e40cfc61692192a9d2c85`. [Node CI 37266433453](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37266433453) and [Test & Verify 37266433477](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37266433477) succeeded. [PR Preview 37266433514](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37266433514) failed in `deploy-preview`: job `111625180120` reports Cloud Build HTTP 429, `GetRequestsPerMinutePerProject`, limit 60/min. Quality gates and staging-baseline resolution passed; review-evidence was skipped. This is a recorded Preview quota failure, not current-head acceptance or a reason to waive the failed check.

This grouped update also adds [the implementation/acceptance backlog](../floot-migration/IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) and [the media/Classifieds contract](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md). Findings remain open until the stated implementation, policy and acceptance evidence exists. No deployed behavior has been silently corrected.

The updated #249 head must obtain its own Node CI, Test & Verify and complete Preview evidence. Let those checks finish; do not repeatedly commit status-only notes or reuse the old head's results. PR-triggered Preview may build/deploy isolated nonproduction resources; it is separate from Production authorization.

The full schema-lineage correction remains in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md). No executable repository file is changed by this documentation slice. Previously mapped contracts are preserved; documented parsing, disclosure and storage limitations are not silently repaired or claimed closed.

## Other PRs
- #247: closed as superseded by #248; not merged.
- #172: closed after requirements salvage; old code/migration must not be merged wholesale. Retained requirements: `docs/floot-migration/INTELLIGENCE-CONTROL-SALVAGE.md`.

## Earlier infrastructure evidence — revalidate when needed
- Handoff recorded successful Terraform bootstrap, post-apply verification, and a no-change plan. Do not repeat bootstrap APPLY.
- Handoff recorded PITR enabled and a successful on-demand backup. This is not proof of a fresh backup or a tested restore today.
- [INVENTORY run 37179237640](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37179237640) succeeded on old main `5a961be...`; logs tie it to execution `khedmah-database-role-inventory-s7pck`. Previously recorded approved system-role manifest: `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`. This recorded value is not a newly retrieved cloud manifest.
- Latest execution-specific manifest comparison, Secret Manager IAM, current alias/version metadata, recovery evidence, and actual schema prerequisites must be checked before any cutover.
- Do not assume baseline 001–020 or retained migrations 021/022/024 are complete because a later workflow is named 025–034. Follow SCHEMA-RELEASE-GATES.md, including the intentional 023 gap.

## Product and migration boundaries
- Keep GitHub/GCP backend, database, identities, and infrastructure; Floot is the proposed experience-layer migration, not a certified completed integration.
- No Floot migration or custom-domain cutover was executed in this work session.
- Taxi trips and electronic payments remain behind their existing approval/readiness gates.
- The approved visual identity is existing input, not a request for a redesign.

## Progress reporting
Carry forward the owner's last planning indicator: `10 / 160` estimated work units expressed as hours. This is not measured elapsed labor, and 6.25% is not a verified percentage of the whole product. Do not increment it merely for waiting, chatting, or rerunning CI. Report exact completed gates/tests alongside it.

## One next action
See [NEXT-ACTION.md](NEXT-ACTION.md). The #250 source step is complete. Resume metadata-only Production reconciliation by listing existing inventory executions in the explicit project/region, then review the selected execution before the next command. No Cloud Shell/GCP session is available in this workspace; current cloud evidence requires the owner's command output or an authorized cloud connection. Finish current-head #249 checks in parallel. Do not dispatch PREPARE, INVENTORY or VERIFY as a shortcut around missing metadata or recovery evidence.
