# Next Safe Action — Khedmah

Snapshot: 2026-10-05. Re-read live refs and run status before acting. This is an execution dependency, not a Production mutation approval.

## Completed source prerequisites

PR #250 and #249 are merged, with their source and main checks separately verified. PR #251 then merged at `2026-10-05T07:33:24Z`, producing protected main `dba1b5ee94b69ffbc305ddfeff6a3b99c5661ae2`. Its nine required contexts passed on exact head `1ca322cb9e75eb4346860ba706dae7be7ac7e51e`: 2415 tests, then 64/64 primary, 72/72 supplementary and 32/32 mobile cases in one isolated evidence retry after the first attempt timed out. Preserve both attempts; no requirement was waived. Both #249 and #251 Previews have been cleaned up and are no longer live. Do not reopen the merged source prerequisites or rerun the old PREPARE. Evidence and limits: [CURRENT-STATE.md](CURRENT-STATE.md).

## Execute next: the pending corrected project-IAM read

1. Reconfirm live main, the MC-04/dependency/runner follow-up branch or PR, open PRs and Actions. A newer source SHA requires its own checks; #249 and #251 are already merged.
2. Preserve the completed owner reads: latest existing inventory `khedmah-database-role-inventory-s7pck`; its 47 canonical records (D=5/M=12/R=30), zero duplicates and independently matching digest; matching protected manifest variable read today; and the three expected direct `DATABASE_MIGRATION_URL` IAM bindings. Full timestamps/limits are in [PRODUCTION-RECONCILIATION.md](PRODUCTION-RECONCILIATION.md). These are not missing first steps.
3. Review the output of the **corrected project-IAM jq command** in [the current command](PRODUCTION-RECONCILIATION.md#first-command). The first filter attempt had an extra token; no accepted project-IAM result has arrived. Do not repeat the completed inventory/log/variable/secret-policy reads as a substitute.
4. After that result, continue one reviewed read-only command at a time through current custom-role definitions/effective IAM, migration secret aliases/version states, SQL instance/backup/PITR and recovery evidence, actual PostgreSQL memberships and installed schema/catalog prerequisites. A direct secret policy is not full effective IAM; IAM policy version 1 is not a secret version. Blank Cloud SQL `databaseRoles` is not membership proof. Do not invent a schema ledger query.
5. Stop the dependent Production operation if any evidence is missing, stale, ambiguous or mismatched. Prepare one concrete operation only after all its gates and authorization are satisfied.

The owner is at a computer and has supplied the completed reads above. This workspace still has no direct GCP/Cloud Shell session; the next output is supplied by the owner from the reviewed command. A successful read of an old execution does not establish absence of subsequent drift. Re-read completed evidence only for a concrete freshness or change concern.

## Why a workflow dispatch is not the next read-only command

- Every mode of `production-database-role-bootstrap.yml` builds an image; INVENTORY and VERIFY also deploy/execute Cloud Run jobs.
- PREPARE checks the requested digest's syntax early, but creates a transition secret and rotates the migrator password before the later prepare SQL compares the actual manifest.
- The role workflow does not automatically validate a fresh backup, PITR, tested restore or effective IAM. Runtime containment recovery is a separate mechanism.
- A successful old inventory, enabled secret version, merged PR or green CI does not close those independent gates.

## Repository work in parallel

- Complete the grouped PR on `fix/classifieds-error-transport-2026-10-05`, incorporating merged main `dba1b5ee...`. MC-04 source `5b21217bc610a656850755e9084169e56217b563` reuses the shared error decoder; dependency source `a7864998ae8d1e1a933b7a38c03910f7b8b3e048` updates the existing Multer override and lock to `2.4.0`; reviewed runner source `767e6cb9b26c2f530f998f341bc7180a4d418b41` bounds capture/cleanup and preserves incomplete evidence without reducing the 72 required scenarios. Their source and local evidence are recorded in [CURRENT-STATE.md](CURRENT-STATE.md); they do not inherit #251's CI.
- Require the final combined head's Node CI, Test & Verify, complete Preview and triggered Google readiness repository/debug checks. The Production secret job is dispatch-only. Local evidence is 41 selected MC-04 runner entries, 33 dependency compatibility/security entries, 80 targeted runner/assessment tests (including the ten new deadline cases), appropriate builds/type checks, and a repaired dependency audit reporting zero known vulnerabilities. These are separate scoped runs, not a count of new integration journeys or a Production/Floot certificate.
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
