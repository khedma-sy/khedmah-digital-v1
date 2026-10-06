# Khedmah Digital — Current State

## Live repository checkpoint — 2026-10-06 after PR #261

- Protected `main` is `7c58277ac04450f9eb5fb48c04c435d070443b56`, the guarded merge of PR #261.
- PR #261 adds the read-only Secret Manager IAM audit for all 17 permanent Production secrets. Exact main push checks are green for build, tests/verification, source inventory and code quality; PR Validation is skipped on push as expected.
- No pull requests are open at this checkpoint. Superseded issues #121 and #168 are closed; issue #199 remains the cloud/Production execution tracker.
- Repository closure now also requires the Floot/Google integration gate: one consistent domain, browser-session, OAuth/Firebase, Maps, CORS/CSRF and secret-boundary contract across GitHub, Google Cloud, Cloudflare and Floot.
- The next cloud operation remains a bounded read-only audit. No Production mutation is authorized by repository readiness.

Updated: 2026-10-05. This is a dated evidence checkpoint, not permission to execute a Production operation.

## Live reconciliation supplement — 2026-10-05 after PR #259

This is the current compact execution checkpoint. Older evidence below is historical and must not override this section.

- Live protected `main` is `308c0aa856943550cb565ab77e299607df1561e6`, the guarded merge of PR #259.
- PR #258 accepted head `bbac69fd456a157dd0894fcf87f1cf86ed6a9e85` and merged as `b364a67c68e17c38667db652e6a3e7d3884a3b32`; it removed stale execution handoffs.
- PR #259 accepted head `e15a372c9c6aded9a717a2ff2753a635b6f5e2ec` and merged as `308c0aa856943550cb565ab77e299607df1561e6`; it added the source-derived direct-IAM matrix for all 17 permanent Production secrets.
- Main post-merge checks are green for build, source inventory, code quality, and test/verification; PR Validation is skipped on push as expected.
- Canonical GitHub/WIF proof is complete. Do not repeat runtime-variable or WIF diagnosis as pending.
- The live blocker is Secret Manager direct/effective IAM reconciliation. `DATABASE_MIGRATION_URL` direct IAM matches the reviewed canonical set; `DATABASE_URL` is the first proven drift and contains both historical `khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com` and canonical `khedmah-v1-runtime@khedma-dl.iam.gserviceaccount.com` as accessors.
- Do not remove historical project/service-account/secret bindings merely to make certification pass. Any Production IAM mutation requires an explicit reviewed operation and owner authorization.
- Direct IAM, inherited/effective IAM, historical-principal continuity, actual PostgreSQL memberships, credential continuity, operation-fresh recovery evidence, and schema prerequisites remain separate gates.
- While the owner is mobile, continue repository-only work and defer Cloud Shell instructions and all Production mutations.
- Phase order remains strict: Phase 1 → Phase 2 Google readiness → Phase 3 Floot. Floot remains the experience layer and must not receive Cloud SQL passwords, Terraform authority, Production deployer/migrator credentials, or unrestricted Google keys.

## Authority and branch location
- Repository: `khedma-sy/khedmah-digital-v1`.
- Production project: `khedma-dl`; approved region: `europe-west1`.
- Last re-read protected main: `308c0aa856943550cb565ab77e299607df1561e6`, the guarded merge of PR #259. PR #258 and #259 are merged; their accepted heads and purpose are recorded above. Main build, source inventory, code quality, and test/verification push checks are green; PR Validation is skipped as expected on push.
- The control documents and mapped contracts entered main with #249. The earlier missing-file/404 observation applied to `a2a26f8...`; it is no longer the current main state. The `AGENTS.md` entry point remains [the live roadmap checkpoint](../../ROADMAP-EXECUTION-2026-09-08.md).
- MC-01 is merged through #251; MC-04 decoder/dependency/runner work is merged through #252; live-secret alignment is merged through #253; and the bounded MC-04 429 presentation follow-up is merged through #254. Preserve each accepted head's independent evidence and limits.
- Main `b7b6d0aa...` Node CI [37273043005](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37273043005) and Test & Verify [37273043048](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37273043048) succeeded on their own SHA. All four substantive push checks passed; PR Validation was skipped as expected for push.
- Prior main `dba1b5ee...` separately passed [Node CI 37278400999](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37278400999) and [Test & Verify 37278401083](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37278401083), completing at `07:38:37` and `07:38:30 UTC`. All four substantive push checks passed; PR Validation skipped. That main test job reported 2415 passing cases and two inherited moderate dependency findings. Those dated results describe the earlier dependency tree, before #252's Multer repair.
- Exact #252 head evidence: [Node CI 37280529924](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37280529924), [Test & Verify 37280530070](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37280530070) and [Google readiness 37280530093](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37280530093) succeeded on `01f1a9e...`; root 1675 + backend 616 + frontend 151 = **2442 passing tests**, dependency audit zero. [Preview 37280530060](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37280530060) succeeded on attempt 1 at `08:23:26 UTC`: deployment job `111668859320` succeeded at `08:18:24`, then review job `111674591932` recorded **64/64 primary, 72/72 supplementary and 32/32 mobile**, plus Classifieds 200/200/200 on an empty fixture. This closes that head's source/Preview gates, not populated-journey or Floot acceptance.
- #252 artifact `11333495220` has reported digest `fc88e506d2999ad0b59dc96ae229b8e4b97628326153df2bec3cadb918b7acc0`. Only metadata and logs were reviewed; its archive bytes were not independently downloaded/hashed.
- Prior main `e61d1142...` independently passed [Node CI 37284024016](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37284024016) at `08:34:14 UTC` and [Test & Verify 37284023968](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37284023968) at `08:35:09 UTC`. Test job `111678533860` was independently checked: **2442 = 1675 root + 616 backend + 151 frontend**, zero failed/cancelled/skipped and dependency audit zero. These are that main's own results, separate from PR #252 and the scoped local repair suites below.
- [Closed-PR cleanup 37284024186](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37284024186) succeeded at `08:30:38 UTC`; job `111678534582` removed the #252 Preview services at `08:30:34`. Its logs confirm retirement; the former Preview links are no longer live handoff targets.
- Accepted [PR #253](https://github.com/khedma-sy/khedmah-digital-v1/pull/253) head `eb5918a2b4ddc25d1d4580e2da82fba40b949ec6` passed [Node CI 37285914753](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37285914753) at `08:52:53 UTC`, [Test & Verify 37285914804](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37285914804) at `08:53:17` and [Google readiness 37285914807](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37285914807) at `08:51:32` (validate-files job `111684650277`). Test job `111684650148` was independently reviewed: **2479 = 1712 root + 616 backend + 151 frontend**, zero failed/skipped and dependency audit zero. Codex completed with no review threads; no formal APPROVED review was recorded.
- [#253 Preview 37285914878](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37285914878) succeeded on attempt 1 at `09:15:03 UTC`; review job `111692153610` completed at `09:15:02`: **64/64 primary, 72/72 supplementary and 32/32 mobile**, plus Classifieds 200/200/200 with `ads=0`, `total=0`, `apiPage=1`. Artifact `11335950570` reports **60,295,806 bytes** and digest `344e6b3a3505fa48cfdda9ef2396bca17136eba2c505e12d4b9a341e1ddb02f3`; metadata/logs were reviewed, archive bytes were not downloaded. Empty-fixture source acceptance does not certify populated journeys or the new MC-04 UI head.
- Prior main `82283464...` independently passed [Node CI 37288933517](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37288933517) at `09:21:13 UTC` and [Test & Verify 37288933371](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37288933371) at `09:21:22`. The complete log of test job `111694477169`, which ended at `09:21:20`, confirms **2479 = 1712 root + 616 backend + 151 frontend**, zero failed/cancelled/skipped/todo and a zero-vulnerability final audit at `09:21:16`. Four substantive push contexts passed; PR Validation skipped as expected for push. These are this main's own results, separate from accepted #253 and the 20-case UI suite.
- [#253 cleanup 37288935703](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37288935703) succeeded at `09:16:50 UTC`; job `111694485115` finished at `09:16:49`, and its log confirms service removal at `09:16:46`. #253 Preview URLs are retired.
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
- The earlier audit also recorded [Identity readiness run 34870013974](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/34870013974) queued on a recovery-branch SHA from 2026-09-14 with no jobs returned. This historical queue observation is not current-main evidence or a statement that all current Actions are idle.
- This session has performed **zero Production mutations**. Owner-supplied current metadata below advances reconciliation without dispatching another role workflow.

## Completed read-only owner observations
The owner is at a computer and has supplied the following results. Preserve the completed evidence; do not restart with inventory, logs, protected-variable, direct-secret-IAM, project-IAM, AliasManager or CloudAssetPolicyAnalyzer reads as though no output had arrived.

| Observation received on 2026-10-05 | Reviewed result and limit |
| --- | --- |
| Latest inventory execution list and selected execution | `khedmah-database-role-inventory-s7pck`; start `2026-10-04T05:13:55.497181Z`, completion `2026-10-04T05:14:07.818024Z`, succeeded count 1. This is a newly received read of an existing execution, not a new execution today. |
| Execution-specific canonical manifest | 47 records: D=5, M=12, R=30; zero duplicates. Independently recomputed SHA `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf` matches the logged digest. |
| Protected `DATABASE_SYSTEM_ROLE_MANIFEST_SHA256` | Read today and matches the recomputed digest; variable metadata says updated `2026-10-03T16:12:33Z`. The variable's update time is not the execution time. |
| `DATABASE_MIGRATION_URL` direct secret IAM | Exactly the three expected direct bindings were reviewed; IAM policy version 1, etag `BwZc6oXwB6M=`, output received at `06:25:47 UTC`. This is policy metadata, not evidence of secret version 1 or complete effective IAM. |
| Project IAM output | Received `2026-10-05T08:12:04Z`; etag `BwZc6odB8Zk=`, IAM policy version 3. The returned JSON contains 25 bindings and seven principals, with no returned conditions or public principals. This completes the pending project-policy read within its returned scope, not full effective-IAM verification. |
| AliasManager custom-role definition | Received `2026-10-05T08:27:40Z` (`11:27:40` Damascus). Name `projects/khedma-dl/roles/khedmahDatabaseMigrationAliasManager`, stage `GA`, included permissions exactly `secretmanager.secrets.get` and `secretmanager.secrets.update`; `deleted` was absent. The readable result completes this role-definition read and matches the declared permissions; it does not establish complete effective access. |
| CloudAssetPolicyAnalyzer custom-role definition | Received `2026-10-05T08:36:48Z`. Name `projects/khedma-dl/roles/khedmahCloudAssetPolicyAnalyzer`, stage `GA`, `deleted` absent; exactly `cloudasset.assets.analyzeIamPolicy`, `cloudasset.assets.searchAllIamPolicies`, `cloudasset.assets.searchAllResources` and `iam.roles.get`. This completes the definition read and matches declared source, without proving complete effective access. |

The project output includes `roles/secretmanager.secretAccessor` for historical `khedma-v1-deployer` and `khedma-v1-runtime` service accounts in `khedma-dl`. Their effective access, current use and retirement requirements remain open; no binding was changed. Canonical deployer `roles/iam.serviceAccountUser` and `roles/run.admin` match [the declared bootstrap source](../../infra/iac/bootstrap/main.tf); their presence is not newly discovered source drift. Remaining custom-role definitions, attachment/impersonation scopes, inherited/denied access and actual usage still need evidence.

The historical service-account metadata read is complete: both missing-`h` identities exist, returned stable unique IDs and are enabled. Subsequent Cloud Run, Cloud Asset and Audit reads established that the historical deployer remained actively used through 2026-10-04. Canonical GitHub/WIF proof is now complete; the remaining live blocker is Secret Manager direct/effective IAM reconciliation. Do not retire historical identities or bindings without explicit reviewed authorization.

The selected manifest review is complete for that execution. It does not prove absence of later database drift; revalidation should follow a concrete freshness/change requirement rather than repeat already reviewed evidence without cause.

The owner also previously ran the Cloud SQL user-list query:

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

The returned review history contains COMMENT reviews on older head `d053350...`, not an independent APPROVED review for `308bc00...`. The Codex P1 request to update the same live roadmap checkpoint was addressed by merged #249. Source merge and green CI do not certify Production cutover.

## Production gate audit — open
Detailed gate requirements, completed observations and the next unresolved metadata-only read are in [PRODUCTION-RECONCILIATION.md](PRODUCTION-RECONCILIATION.md).

- Current role workflow has no backup input, backup freshness check or restore/PITR validation. Its runtime-containment recovery is not a tested backup restore.
- Canonical active-account and service-account-existence checks do not establish the current effective Secret Manager/IAM permissions.
- Direct secret IAM, returned project IAM, AliasManager/CloudAssetPolicyAnalyzer definitions and the selected execution's manifest comparison have been reviewed. Metadata for the two historical service accounts is the already-issued pending read; remaining custom-role/effective IAM, identity usage/retirement, aliases/version states, backup/PITR/restore evidence, actual PostgreSQL memberships and installed schema remain unverified. Historical project-level secret access is an unresolved reconciliation finding, not authorization to retire identities or bindings.
- The former source mismatch on main `e61d1142...` is corrected through #253: [live-secret certification](../../scripts/validate-production-live-secret-certification.sh) now expects the three direct `DATABASE_MIGRATION_URL` bindings declared by [Terraform](../../infra/iac/bootstrap/main.tf) and observed by the owner. This source alignment does not prove full effective IAM or authorize any live binding change; the remaining cloud gates stay open.
- PREPARE may legitimately start without an `active` alias and inspect enabled numeric versions. Metadata does not prove any selector authenticates.
- `Rotate migration password before runtime cutover` creates a transition secret version and changes the migrator password before the later `prepare` SQL phase compares the actual system-role manifest. A syntactically valid hash is not prior proof of a match. Review the current manifest and recovery evidence before any dispatch.
- All database role workflow modes build an image; INVENTORY/VERIFY also deploy and execute Cloud Run jobs. Read existing execution/log/secret/backup metadata first. Do not dispatch a Production workflow merely because its SQL is read-only.

## Live-secret certification alignment — merged source

- Implementation [`4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f`](https://github.com/khedma-sy/khedmah-digital-v1/commit/4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f) was created atop main `e61d1142...`; source tree `9019204ad3131a478b330b54b505d3b964c70db8`. It adds the canonical deployer's declared AliasManager role to the expected direct migration-secret policy while preserving the separate inherited/effective-access checks. PR #253 merged it into main `82283464...` after its own exact-head source/Preview gates passed; do not resume this source repair as pending.
- Reviewed blobs: [validator](../../scripts/validate-production-live-secret-certification.sh) `654e05d7f7ba701792e001d844477cec4e42bed7`; [certification tests](../../tests/google-production-readiness-live-certification.test.mjs) `ceee448afe9639335613c2feb975752c8b830de5`. Both independent source reviews completed with no blockers.
- Local command `node --test tests/google-production-readiness-live-certification.test.mjs tests/production-new-account-gates.test.mjs` passed **59/59**, zero failed/skipped: **37 new offline CLI cases + 22 existing cases**. The canonical three-binding fixture fails the actual baseline allowlist. These are isolated source/CLI results with cloud fixtures, not live IAM, secret payload, deployed behavior or Floot proof; do not add this separate scoped suite to a CI aggregate. No Production mutation occurred.

## PR #249 — merged control and integration preparation
PR #249 merged at `2026-10-05T06:33:40Z`, producing main `b7b6d0aa6c06d7b9650158f5e49569656eb8aa4d`. All nine required check contexts were verified on its exact head `cf6245e934d2c3251492412c559420e2a3ea60cc`.

| Exact #249 head evidence | Result and scope |
| --- | --- |
| [Node CI 37270869049](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37270869049), [Test & Verify 37270869162](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37270869162), [PR Preview 37270869066](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37270869066) | SUCCESS on `cf6245e...`; this supersedes the old-head Preview quota failure below. |
| Preview report | Recorded 64/64 and 72/72, mobile 32/32, Classifieds HTTP 200/200/200 with an empty fixture. This does not prove populated owner/media/order journeys or Floot acceptance. |
| Artifact `11329086747` | Metadata inspected only; artifact bytes were not downloaded or independently verified. Preview mail readiness remained **NOT READY**. |
| [Closed-PR cleanup 37273043068](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37273043068) | SUCCESS at `06:34:08 UTC`; the former #249 Preview is no longer a live handoff target. |

The execution plan, schema gates, Google/Floot boundaries and mapped contracts are now on main. New implementation/documentation heads still require their own checks.

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

Merged #249 also added [the implementation/acceptance backlog](../floot-migration/IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) and [the media/Classifieds contract](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md). Findings remain open until the stated implementation, policy and acceptance evidence exists. Source mapping alone did not correct deployed behavior.

The full schema-lineage correction remains in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md). #249 was documentation-only relative to its base. The separate MC-01 implementation below must not inherit #249's test or Preview certification. PR-triggered Preview may build/deploy isolated nonproduction resources; it is separate from Production authorization.

## MC-01 — PR #251 merged; first failure and successful retry preserved

- Implementation: `6648fc9f017ac449edc6603702b6ba279e7e8e54` on `fix/media-classifieds-delete-boundary-2026-10-05`; a five-line shared-delete guard in [media.service.ts](../../apps/backend/src/media/media.service.ts) and 17 new cases in [media-delete-http.test.ts](../../apps/backend/src/media/media-delete-http.test.ts).
- Reviewed blobs: service `234146c4e2d2a214313f579c5ab4faae91af1c9b`; tests `2cf556b7f057c3e7f536d231b0e12497426d4a62`. The guard rejects Ad media at the shared delete boundary; dedicated Classifieds revision/state/receipt handling remains authoritative.
- Local evidence on Node.js `v24.19.0`: targeted **26/26 passed**, backend build passed. Red baseline: nine Ad deletion cases returned 200 instead of required 403; eight controls passed. An independent reviewer reported no blockers.
- These tests exercise actual Nest HTTP handling with database, identity and storage doubles. They do not prove real SQL, live authentication, the complete global middleware stack, deployed behavior or Floot compatibility.
- PR #251 exact head `1ca322cb9e75eb4346860ba706dae7be7ac7e51e` passed [Node CI 37274441964](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37274441964) and [Test & Verify 37274441985](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37274441985): root 1665 + backend 609 + frontend 141 = **2415 passed**, zero failed/skipped. These successes do not erase the inherited moderate dependency warning recorded below.
- [Preview 37274442010](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37274442010), first attempt: quality, baseline resolution and isolated deployment passed. Review job `111653802009` was cancelled at `07:22:50 UTC` after its 12-minute limit. Primary capture passed 64/64; the basic Classifieds check passed at `07:12:12 UTC`, page/proxy/backend 200/200/200, empty fixture. Only four supplementary screenshots were preserved, the last at `07:12:22`; no supplementary manifest or mobile acceptance exists for that attempt. The exact awaited operation that stalled is not established.
- Partial artifact `11330608422` was downloaded and its **27,298,280 bytes** independently verified against logged SHA-256 `7a4cb460a304bd1599934bf5b35f70ec19ac0fabfae94339cbf05430c3973b87`. Both saved manifests bind head `1ca322...` and checkout `2d9cd637d29f9c07790dc6166d828df78b9b7e8a`. Do not convert those partial results or four screenshots into 72-scenario acceptance. Preview mail remained NOT READY.
- One isolated retry of the cancelled evidence job ran on the unchanged head, retaining the successful build/deployment. [Attempt 2](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37274442010/attempts/2), review job `111658564869`, succeeded at `07:31:23 UTC`: **64/64 primary, 72/72 supplementary and 32/32 mobile**, plus Classifieds 200/200/200 on an empty fixture. This does not identify the first attempt's exact stalled operation. The bounded supplementary-runner follow-up below subsequently entered main through #252.
- Successful artifact `11330897577`, created `07:31:19 UTC`, is distinct from the partial artifact above. Its reported 60,823,496 bytes and digest `b7882ff3f10c087af06ca50e7066aeeff0bee0b91cfadb45e57226ee9989df7f` agree between GitHub metadata and upload logs; its archive bytes were not independently downloaded/hashed. Both artifact IDs are retained, never selected merely by their shared name.
- After a fresh main/head/check/review read, all nine required contexts from app `15368` were successful and normal merge with the exact expected head produced `dba1b5ee94b69ffbc305ddfeff6a3b99c5661ae2` at `07:33:24 UTC`. Codex had no findings and formal reviews/threads were empty; an agent review or bot reaction was not represented as a formal APPROVED review.
- [Closed-PR cleanup 37278401774](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37278401774) succeeded at `07:33:54 UTC`; the #251 Preview services are retired. Wider real identity/SQL/full middleware/browser/Floot acceptance remains OPEN, and no Production deployment is certified.

## MC-04 — Classifieds error decoder source repair

- Implementation [`5b21217bc610a656850755e9084169e56217b563`](https://github.com/khedma-sy/khedmah-digital-v1/commit/5b21217bc610a656850755e9084169e56217b563) is merged through #252, whose own source/Preview gates are complete. The client now reuses `readApiError` for canonical, legacy and malformed responses while retaining HTTP status, request keys, revisions, bodies and one-attempt behavior.
- Local evidence: **18 frontend + 12 backend + 11 root runner entries = 41**, zero failed/skipped; full frontend TypeScript check passed. The HTTP fixture runs the actual Nest controller, global filter and client with injected service failures. It is not real identity, SQL, complete middleware or browser/Floot acceptance.
- Independent review reported no blockers. The server filter still owns redaction; the decoder does not sanitize arbitrary third-party payloads or reconstruct suppressed domain codes. Broader recovery acceptance remains OPEN. Exact blobs and cases are in [the decoder follow-up](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md#mc-04-implementation-follow-up--2026-10-05).
- Separate [MC-04 429 implementation](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md#mc-04-429-presentation-follow-up--2026-10-05) `08b116a84b713d646b70d20c46136ab1181e0775`, parent `eb5918a2...`, tree `361e374435a456467b514c6f4dc3768f5f94b155`: three runtime line replacements remove status-only quota inference from new-Ad/editor catch handlers and the new-Ad quota branch's unconditional saved-draft/no-duplicate claim. Node.js `v24.19.0` ran **20/20 = nine new + 11 existing cases**; same final baseline lifecycle fixture produced eight semantic failures/four passes, and frontend type checking passed. Final independent review received at `09:09 UTC` reported no blockers. The actual-TSX harness uses mocked API and in-memory request-key storage, not real browser/SQL acceptance; own-head gates remain pending. Explicit-code compatibility, error contract, policy, keys/revisions/state and retries remain unchanged; other generic fallback no-duplication copy and broader MC-04/MC-05/Floot recovery remain OPEN.

## Dependency security — bounded Multer update

- Published implementation: [`a7864998ae8d1e1a933b7a38c03910f7b8b3e048`](https://github.com/khedma-sy/khedmah-digital-v1/commit/a7864998ae8d1e1a933b7a38c03910f7b8b3e048), following MC-04. Only [package.json](../../package.json) and [package-lock.json](../../package-lock.json) change: existing Multer override `2.3.0` to `2.4.0`, its verified registry resolution/integrity, and removal of six unused dependencies from its removed `concat-stream` subtree. Nest remains `11.2.3`; no workflow, install-script or framework change.
- [Maintainer advisory GHSA-3pph-fpjx-jg34](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34) describes aborted disk-storage uploads leaving orphaned files, affecting `>=2.2.0,<2.4.0` and patched in `2.4.0`. The two moderate audit entries represented Multer and its transitive effect on the Nest adapter. They pre-existed MC-01: #249 Test job `111637373300` and main `b7b6d0aa...` Test job `111643952230` already reported them.
- Fresh local native npm `11.9.0` installation with scripts disabled resolved Multer `2.4.0` from Nest's own context. The subsequent audit reported **zero known vulnerabilities** in its audited dependency scope, compared with two moderate baseline entries; this is a dated dependency scan, not a complete security certification.
- Backend build, **30 HTTP/security cases and three existing install-policy tests** passed. Package blobs: manifest `1ca0ed19772a9b108c4492d804bdb36c37824c2c`; lock `29ad425aead5b9d89f1d8bcc438a982bdf14b348`. Independent security review reported no blockers; the grouped #252 head subsequently passed its own CI and Preview and entered main, as recorded above.
- Installer limit: a temporary compatible npm `10.9.3` invocation generated the accepted lock. npm `11.9.0` lock regeneration ignored the root override, and its `ls` diagnostic flags the upstream exact `2.2.0` declaration for both baseline `2.3.0` and repaired `2.4.0`. Those regeneration results were discarded; fresh native installation, runtime resolution, audit, build and tests verified the accepted lock. No project toolchain pin or vendor metadata was changed.
- Source searches found no application Multer multipart/interceptor/disk-storage wiring; existing media uploads use JSON/base64. Deployed exploitability was not established, and no Production rollout occurred.

## Supplementary Preview runner — bounded capture and preserved evidence

- Published implementation: [`767e6cb9b26c2f530f998f341bc7180a4d418b41`](https://github.com/khedma-sy/khedmah-digital-v1/commit/767e6cb9b26c2f530f998f341bc7180a4d418b41). Three files: [capture runner](../../scripts/capture-sixth-audit-evidence.mjs), [Classifieds CLI caller](../../scripts/check-classifieds-preview-acceptance.mjs) and [deadline regressions](../../tests/sixth-audit-deadlines.test.mjs). Reviewed blobs respectively: `dd8a18f59d4779d8387fe8d237af06dd1a572ee0`, `e4e226b112e3ee8ef4414dce209fba3a215f4adb`, `cf3f2c7467034f88396951dd9e7831c4b019899a`.
- Preserve all **72 scenarios**, their order and existing readiness, auth-shell, RTL, contrast, focus, reduced-motion and layout requirements. The workflow's 12-minute limit is unchanged. Fixed runner limits are 480 seconds overall, 45 seconds for each scenario's capture work, 30 seconds for browser launch, 12 seconds for screenshots and five seconds for each cleanup. Screenshot/cleanup allowances are separate from capture work but remain inside the overall limit; no CLI environment override was added.
- Atomic manifests begin with all obligations failed/not run and save the active phase before each await. Only a result accepted before its deadline may publish; late screenshot bytes receive no file path and late page errors cannot alter finalized records. Context cleanup failure stops further capture; aggregate success requires all 72 captures and browser cleanup to succeed. CLI-only termination handles incomplete cleanup/global expiry; imported `main()` does not terminate its host or set the host exit code.
- Local Node.js `v24.19.0` evidence: **80/80 targeted tests**, zero failed/cancelled/skipped; the final corrected ten deadline tests, already included in that total, separately passed 10/10. All three files passed syntax checks and whitespace validation. Two independent lifecycle/security reviews reported no remaining blockers; the final reviewer checked exact blobs, logs and the comparison result.
- The original byte-exact CLI and repaired CLI both reached a held browser-close operation in the same controlled fixture. The original exceeded an external one-second observation limit without a final manifest; the repaired CLI exited 1 with `BROWSER_CLOSE_FAILED` and all 72 records. The fixture shortens its observation timer; runtime limits are unchanged. Those browser/process doubles do not identify the original #251 stalled await or supply browser acceptance. The separate complete #252 Preview passed on the final combined head, as recorded above.

## Automatic workflow boundary for this follow-up

At reviewed main `b7b6d0aa...`, with the same workflow definitions on `dba1b5ee...`, the decoder/dependency/capture changes trigger ordinary main CI and guarded PR Preview cleanup on merge, with no configured automatic Production deployment. The root package change also triggers Google readiness's repository checks and unconfigured Android debug build on the PR; its Production secret job requires `workflow_dispatch`. PR Preview does build/deploy isolated nonproduction resources. No workflow definition changes in this follow-up. This source audit does not certify effective environment/IAM settings or out-of-repository triggers, and closes no Production gate.

## Floot transport finding — conditional, not implemented

[Candidate B evidence](../floot-migration/AUTH-API-CONTRACT.md#candidate-b-compatibility-evidence) identifies a same-site HTTPS frontend/API origin pair as viable in principle. Cross-site `floot.app` authentication remains subject to third-party-cookie restrictions; exact CORS/CSRF, media URL resolution, logout and Firebase behavior need real Safari/Chromium proof on an approved nonproduction arrangement. The existing Business Desk source uses its own authentication; it is not a completed Khedmah integration. Target project, plan and domain arrangement remain open; no Floot resource or DNS was changed.

## Other PRs
- #247: closed as superseded by #248; not merged.
- #172: closed after requirements salvage; old code/migration must not be merged wholesale. Retained requirements: `docs/floot-migration/INTELLIGENCE-CONTROL-SALVAGE.md`.

## Earlier infrastructure evidence — revalidate when needed
- Handoff recorded successful Terraform bootstrap, post-apply verification, and a no-change plan. Do not repeat bootstrap APPLY.
- Handoff recorded PITR enabled and a successful on-demand backup. This is not proof of a fresh backup or a tested restore today.
- [INVENTORY run 37179237640](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37179237640) succeeded on old main `5a961be...`; logs tie it to `khedmah-database-role-inventory-s7pck`. Its 47-record manifest was re-read/recomputed on 2026-10-05 and matched the current reviewed protected variable, as recorded above; no new inventory execution was dispatched.
- Direct secret IAM, returned project IAM and AliasManager/CloudAssetPolicyAnalyzer metadata are reviewed; remaining custom-role/effective IAM, current alias/version metadata, recovery evidence, actual PostgreSQL memberships and installed schema prerequisites remain open before cutover.
- Do not assume baseline 001–020 or retained migrations 021/022/024 are complete because a later workflow is named 025–034. Follow SCHEMA-RELEASE-GATES.md, including the intentional 023 gap.

## Product and migration boundaries
- Keep GitHub/GCP backend, database, identities, and infrastructure; Floot is the proposed experience-layer migration, not a certified completed integration.
- No Floot migration or custom-domain cutover was executed in this work session.
- Taxi trips and electronic payments remain behind their existing approval/readiness gates.
- The approved visual identity is existing input, not a request for a redesign.

## Progress reporting
The owner supplied the current planning indicator **`11 / 160`**, leaving **149 by arithmetic**. Earlier #249 text recorded `10 / 160`; retain that discrepancy explicitly rather than inventing a measured one-unit completion. The indicator is not measured elapsed labor, a remaining-hours estimate or a verified product-completion percentage. Do not increment it for waiting, chatting, CI or this checkpoint; report the completed gates/tests separately.

## One next action
See [NEXT-ACTION.md](NEXT-ACTION.md). #250, #249, #251, #252 and #253 are merged; #253's source gates, current main's own Node/Test and Preview cleanup passed. The inventory/manifest/protected-variable/direct-secret-IAM/project-IAM/AliasManager/CloudAssetPolicyAnalyzer reads above are complete. Resume with the **historical service-account metadata read issued at 08:39 UTC**, whose result remains pending at this checkpoint. The owner executes one reviewed Cloud Shell command at a time because this workspace has no direct GCP session. In parallel, re-read the live PR state for reviewed MC-04 implementation `08b116a8...`: assemble/publish its checkpoint if needed and complete its own exact-head gates while open; if already merged, verify the resulting main and resume the pending owner metadata. Do not dispatch PREPARE, INVENTORY or VERIFY to bypass unresolved metadata or recovery gates.
