# Next Safe Action — Khedmah

Snapshot: 2026-10-05. Re-read live refs and run status before acting. This is an execution dependency, not a Production mutation approval.

## Completed source prerequisites

PR #250, #249 and #251 are merged with their source/main evidence preserved. #251's first interrupted Preview and isolated successful retry remain recorded. PR #252 then merged normally into protected main `e61d1142c3aa9d03ae63798b6b0987bc799a879d` (merge commit timestamp `2026-10-05T08:30:08Z`), whose tree matches accepted head `01f1a9e934b130fee613e8f65cb55743a615b333`. All nine required contexts plus Google readiness passed on that head: 2442 tests, audit zero, then 64/64 primary, 72/72 supplementary, 32/32 mobile and Classifieds 200/200/200 on an empty fixture in Preview attempt 1. Current main's own Node/Test also passed, with 2442 tests and audit zero. #252 cleanup succeeded at `08:30:38 UTC`; #249/#251/#252 Preview services are retired. Do not reopen merged source prerequisites or rerun the old PREPARE. Evidence and limits: [CURRENT-STATE.md](CURRENT-STATE.md).

## Execute next: the pending historical service-account metadata read

1. Reconfirm live main, the separate live-secret certification repair, open PRs and Actions. A newer source SHA requires its own checks; #249, #251 and #252 are already merged.
2. Preserve the completed owner reads: latest existing inventory `khedmah-database-role-inventory-s7pck`; its 47 canonical records (D=5/M=12/R=30), zero duplicates and independently matching digest; matching protected manifest variable read today; three expected direct `DATABASE_MIGRATION_URL` IAM bindings; project IAM received `2026-10-05T08:12:04Z` (25 returned bindings/seven principals, etag `BwZc6odB8Zk=`, policy version 3); AliasManager definition received `08:27:40 UTC`; and CloudAssetPolicyAnalyzer definition received `08:36:48 UTC`. Both role definitions match declared names/permission sets, have stage `GA` and omit `deleted`. Full permissions and limits are in [PRODUCTION-RECONCILIATION.md](PRODUCTION-RECONCILIATION.md). These are not missing first steps.
3. Review the output of the **already-issued historical service-account metadata command** in [the current command](PRODUCTION-RECONCILIATION.md#first-command). It targets the missing-`h` deployer/runtime identities and returns email, unique ID and disabled state; validate each returned email against the exact intended identities; its output is pending. Do not infer current use, effective access or retirement readiness from those fields alone. Do not repeat completed custom-role/project/inventory/log/variable/direct-policy reads as a substitute.
4. After that result, continue one reviewed read-only command at a time through remaining current custom-role definitions/effective IAM, historical project-level secret access and identity usage, migration secret aliases/version states, SQL instance/backup/PITR and recovery evidence, actual PostgreSQL memberships and installed schema/catalog prerequisites. Neither the direct secret policy nor the returned project policy proves full effective IAM; policy versions are not secret versions. Blank Cloud SQL `databaseRoles` is not membership proof. Do not invent a schema ledger query.
5. Stop the dependent Production operation if any evidence is missing, stale, ambiguous or mismatched. Prepare one concrete operation only after all its gates and authorization are satisfied.

The owner is at a computer and has supplied the completed reads above. This workspace still has no direct GCP/Cloud Shell session; the next output is supplied by the owner from the reviewed command. A successful read of an old execution does not establish absence of subsequent drift. Re-read completed evidence only for a concrete freshness or change concern.

## Why a workflow dispatch is not the next read-only command

- Every mode of `production-database-role-bootstrap.yml` builds an image; INVENTORY and VERIFY also deploy/execute Cloud Run jobs.
- PREPARE checks the requested digest's syntax early, but creates a transition secret and rotates the migrator password before the later prepare SQL compares the actual manifest.
- The role workflow does not automatically validate a fresh backup, PITR, tested restore or effective IAM. Runtime containment recovery is a separate mechanism.
- A successful old inventory, enabled secret version, merged PR or green CI does not close those independent gates.

## Repository work in parallel

- Preserve merged #252's accepted head `01f1a9e934b130fee613e8f65cb55743a615b333`, containing MC-04 `5b21217bc610a656850755e9084169e56217b563`, Multer `a7864998ae8d1e1a933b7a38c03910f7b8b3e048` and runner `767e6cb9b26c2f530f998f341bc7180a4d418b41`. Those source gates, current main `e61d1142...`'s own Node/Test and #252 cleanup are complete. Source, local evidence and exact-head results are recorded in [CURRENT-STATE.md](CURRENT-STATE.md).
- Preserve the scope of #252's successful Preview and metadata/log-only artifact review. Its source gates do not close populated-journey, Production or Floot acceptance. Local evidence remains 41 selected MC-04 runner entries, 33 dependency compatibility/security entries and 80 targeted runner/assessment tests (including the ten new deadline cases), with appropriate builds/type checks; these counts describe separate scoped runs. The Production secret job remains dispatch-only.
- Complete the PR for candidate branch `fix/migration-alias-certification-policy-2026-10-05`, containing reviewed isolated live-secret alignment implementation `4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f`, created atop main `e61d1142...`, with its own exact-head CI/Preview. The source corrects the expected two-binding policy to Terraform's three, including the now-described canonical deployer AliasManager role. Two independent reviews reported no blockers; **59 local cases = 37 new offline CLI + 22 existing** passed, separately from main's 2442. Preserve inherited/effective-access rejection and Production gates; neither this repair nor metadata completion authorizes a live IAM change.
- Preserve the remaining MC-04 UI/recovery and MC-01 authority/SQL/browser gaps. Review the [conditional Floot transport proof](../floot-migration/AUTH-API-CONTRACT.md#candidate-b-compatibility-evidence) before adapter implementation; actual same-site nonproduction Safari/Chromium login, protected media, origin rejection and logout proof remains pending.
- MC-01 implementation `6648fc9f017ac449edc6603702b6ba279e7e8e54` is merged through #251. Its required source gates are complete; preserve the interrupted first Preview attempt and successful isolated retry. Do not reimplement it or use its retired Preview as the next handoff URL.
- The five-line shared-delete guard and 17 added HTTP cases have bounded local evidence: targeted 26/26, backend build green, and independent review without blockers. These do not inherit #249 Preview certification or establish live SQL/authentication/global-middleware/Floot acceptance.
- Preserve #249's completed checks as dated evidence: Preview recorded 64/64 and 72/72, mobile 32/32 and Classifieds 200/200/200 on an empty fixture; mail remained NOT READY, artifact bytes were not inspected, and the Preview has been cleaned up.
- Review [the implementation/acceptance backlog](../floot-migration/IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) and [media/Classifieds boundaries](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md). Recorded findings remain open until their policy, implementation and acceptance requirements are satisfied.
- Preserve the completed auth/profile/discovery/cart/fulfillment mappings. No silent change to pricing, disclosure, identity, role behavior, visual identity or scope is authorized by their documentation.

## Later dependency order

After current cloud reconciliation and the applicable authorization: fresh verified backup/recovery gate; protected role cutover; post-cutover isolation and inventory evidence; missing schema steps in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md); HARDEN; release readiness; approved deployment and acceptance.

This is not a queued batch of commands. Re-read source and operation-specific evidence each time. Do not generate confirmations with an old SHA. Do not copy Production credentials into Floot. Taxi trips and electronic payments retain their existing readiness gates.

## Validation scope

The earlier 2026-10-05 local check ran 18 workflow-contract cases and nine isolated Bash-runner cases against executable source from `a2a26f8...`: 27 passed, zero failed, Node.js v24.19.0; gcloud was mocked. MC-01 ran actual Nest HTTP tests with database, identity and storage doubles: nine Ad cases failed against the unguarded baseline (200 versus expected 403), eight controls passed, and the corrected targeted suite passed 26/26. Historical 12 decoder, 24 discovery/search, 24 cart and 52 lifecycle results retain their source/runtime limits. None certifies live GCP, Production SQL, actual cash collection or Floot browser compatibility. This session has performed zero Production mutations.
