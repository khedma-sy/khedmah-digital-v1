# Khedmah Digital — Current State

Updated: 2026-10-04. This is a dated evidence checkpoint, not permission to execute a Production operation.

## Authority and branch location
- Repository: `khedma-sy/khedmah-digital-v1`.
- Production project: `khedma-dl`; approved region: `europe-west1`.
- Last re-read protected main: `5a961be5035dce1197ba2d0c65519e86f65ca4c6` (merged PR #248).
- These control documents are on `chore/project-control-floot-readiness-2026-10-04`, PR #249. They are NOT yet merged into main.
- Active fix: `fix/database-role-prep-state-probe-2026-10-04`, PR #250.
- Re-read main, both PR heads, and their exact-SHA checks before acting. Never use a previous SHA's green checks to certify a newer head.

## Computer-available operating mode — active
The owner confirmed on 2026-10-05 that they are back at a computer and can execute Cloud Shell commands when requested.
- Read-only Cloud Shell checks may resume one short reviewed command at a time.
- This is NOT blanket approval for PREPARE, HARDEN, migrations, Terraform APPLY, Production deployment, password rotation, IAM/secret changes, DNS changes, or any other mutation.
- Re-read exact main/PR heads and live evidence before every cloud command.
- Continue GitHub code review, CI, tests and documentation while mutation gates remain open.

## Production database state — not yet cut over
Last known Production role workflow: run `37183178537`, requested mode PREPARE on `5a961be...`.
- Identity guard and image build succeeded.
- Failed at `Classify resumable prepare role state`.
- Password rotation, role PREPARE/cutover, restart/containment, final credential rotation, isolation verification, and active-alias commit were skipped.
- This failure was before database/secret cutover, NOT before all cloud activity: the bootstrap image was built.
- Do not rerun this failed Production workflow as a retry shortcut.

## Completed read-only owner observation
The owner already ran the Cloud SQL user-list query. Do not ask for the same table again as though it were missing.

| User | Type | Displayed databaseRoles |
| --- | --- | --- |
| khedmah_app | BUILT_IN | blank |
| khedmah_migrator | BUILT_IN | blank |
| postgres | BUILT_IN | blank |

Blank Admin API metadata does not prove PostgreSQL membership or absence of privileges. Actual Production PostgreSQL memberships remain unverified in this session. PR #250 introduces a database-read-only membership probe; deploying/executing its Cloud Run job would still be cloud activity and remains held.

## PR #250 — current exact head and review gate
The previously green head was `d053350c095877e5c693acd7cc9f512be763577a`, but it is no longer the current head.

A P2 review finding identified that observed PostgreSQL memberships are sorted while the expected three-membership arrays used a fixed lexical order. This could reject a valid PREPARE state if Production overrides the custom role names with a different lexical order.

The fix branch has been updated to sort expected membership arrays using the same ordering and to add a PostgreSQL regression with custom role names that sort on opposite sides of `cloudsqlsuperuser`. Re-read the latest PR #250 head and its exact-SHA checks before treating the fix as ready.

The current head captures the probe execution exit code without changing the caller's errexit mode and adds nine isolated Bash-runner regressions. Earlier local targeted evidence was 5 passed / 4 failed before the fix and 9 passed / 0 failed after it; these mocks are not live Google validation.

The current-head workflows have been re-read as SUCCESS, including the previously verified nine required contexts:
- Node.js CI `37193917916`: Source inventory (read-only), build (24.x).
- Test & Verify `37193917877`: Run Tests & Verification (24.x), PR Validation, Code Quality Checks.
- PR Preview `37193917959`: quality-gates, resolve-staging-baseline, deploy-preview, review-evidence.
- The head-bound Preview report records mobile interactions 32/32 and Classifieds acceptance success. Optional cleanup-preview was skipped, not a failed required check.

A bounded COMMENT review was submitted for this exact head (review ID `5405530080`). PR #250 was moved from Draft to Ready for Review on 2026-10-04. Its head was unchanged and it was NOT merged. This COMMENT is not an independent approval and is not Production authorization.

Previous head `2311bdca6fcc0b368104475263e588fd121e22f2` also had green results, but those are not used to certify the current head. The current evidence above is separately verified.

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

Before this grouped lifecycle update, documentation head `d68261c9a0c027057b0ed49ab9aae604e7e1a41a` had Node.js CI `37212409867` and Test & Verify `37212409859` successful. PR Preview `37212409862` was still in progress: quality-gates and resolve-staging-baseline succeeded, deploy-preview was running. These are prior-head observations, not certification of a newer documentation head. Let new checks finish instead of repeatedly committing status-only notes.

The full schema-lineage correction remains in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md). No executable repository file is changed by this documentation slice. Previously mapped contracts are preserved; documented parsing, disclosure and storage limitations are not silently repaired or claimed closed.

## Other PRs
- #247: closed as superseded by #248; not merged.
- #172: closed after requirements salvage; old code/migration must not be merged wholesale. Retained requirements: `docs/floot-migration/INTELLIGENCE-CONTROL-SALVAGE.md`.

## Earlier infrastructure evidence — revalidate when needed
- Handoff recorded successful Terraform bootstrap, post-apply verification, and a no-change plan. Do not repeat bootstrap APPLY.
- Handoff recorded PITR enabled and a successful on-demand backup. This is not proof of a fresh backup or a tested restore today.
- INVENTORY run `37179237640` succeeded. Previously approved system-role manifest: `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`.
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
See [NEXT-ACTION.md](NEXT-ACTION.md). Finish the P2 review fix on PR #250 and require fresh exact-head green CI before merge consideration. After that, resume read-only Production reconciliation from Cloud Shell one command at a time. Review-ready PR status is separate from merge/deployment permission.
