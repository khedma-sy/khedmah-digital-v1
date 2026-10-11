# Production reconciliation — evidence before an operation

## Current checkpoint — 2026-10-11: Phase A live verification complete; Phase B prepared, not approved

This section supersedes older execution instructions below. Historical evidence is retained; do not replay its completed operations.

- Owner-reported Phase A completion on 2026-10-11 (message received approximately 15:55 Asia/Damascus): `FRESH_READ_PREFLIGHT_PASSED`, `STAGE_COMMITTED=MIGRATOR_DEFAULTS`, `STAGE_COMMITTED=OWNER_ACL`, `ACL_PREPARATION_COMPLETE_RUNTIME_STILL_PRIVILEGED`, and `NOT_A_COMPLETED_ROLE_REPAIR_OR_DEPLOYMENT`. Both approved transactions returned success. Terminal echo was interleaved, but the returned operator markers are complete; no exact SQL execution timestamp is asserted.
- This used the owner-approved, hash-pinned `b8e3a300381c35ba79b946998e0fccef4eefc392` Phase A operator and successful ON_DEMAND backup `1791722471376`, completed `2026-10-11T12:42:42.611Z`, operation `6794fe11-abc8-48b4-bbc6-638100000024`. Backup creation and both ACL transactions are completed; do not replay them or re-request their approval.
- Applied scope: migrator global routine defaults, PUBLIC database/schema ACL removal, runtime-role schema ACL removal, runtime-role database CONNECT, and the four migration-role grant options. Runtime membership/attributes remain elevated. No password/secret change, instance restart, schema installation or production deployment was part of this operation.
- Independent live Phase A readback is complete: owner output at `2026-10-11T13:04:09.4045Z` as `khedmah_migrator` and `2026-10-11T13:04:09.515372Z` as `khedmah_app`. Both fresh connections reported `read_only=on`, `catalog_unchanged=true`, `migrator_defaults_ready=true`, `mixed_roles_unchanged=true`, `staged_acl_ready=true`, and the reviewed manifest `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`. Final markers: `PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION` and `RUNTIME_STILL_PRIVILEGED_CUTOVER_PENDING`. Do not replay Phase A, its backup or its completed readback as missing work.
- Phase B is prepared in `scripts/production-database-runtime-cutover.py` and `scripts/production-database-runtime-cutover-check.sql`. It is NOT approved or executed. The existing PREPARE/cutover-audit path still assumes a privileged migrator and must not be replayed for this limited-migrator state. The new path preserves the existing containment sequence without promoting or rotating the migrator.
- Proposed separately approved scope: one new SUCCESSFUL ON_DEMAND backup of `khedmah-v1-db`, description `khedmah-pre-runtime-cutover-20261011`, started after the Phase A readback and completed within the previous hour; then reset only `postgres` to a generated, undistributed password, replace `khedmah_app` memberships with only `khedmah_runtime_role` using the SQL Admin API, and restart this instance once. Restart interrupts database connections. The old postgres password stops working; the generated value is held only in a private temporary flags file and discarded. Future interactive postgres access would require a separately reviewed reset through the control plane.
- The Phase B operator requires `--confirm CUTOVER_KHEDMAH_RUNTIME_AND_RESTART --backup-id <new-successful-backup-id>` only AFTER operation-specific owner approval. It pins the unchanged Phase A readback/operator/SQL/reader and the new postflight SQL, rechecks the instance and secret references, exact user inventory and absence of active SQL operations, and runs fresh Phase A read-only guards before writing. It validates each operation's instance, project, type, ID, status and errors, then waits without replaying the mutation. It permits six bounded read-only checks for membership metadata propagation before restart; a failed observation never repeats assign-roles.
- Completion requires fresh read-only connections as migrator to khedmah/postgres/template1 and app to khedmah, unchanged existing credentials and manifest, a server start time after the pre-restart marker, exact role isolation including NOCREATEDB/NOCREATEROLE, and the unchanged main runner's prebaseline/persistence predicates. SQL Admin membership output alone is not proof that the PostgreSQL attributes were cleared. Any remaining attribute, unexpected state, read failure or drift blocks completion; it does not relax the gate or automatically repair more scope.
- Recovery boundary: stop on any partial/unconfirmed stage, retain the safe operation ID/stage/restart markers, and inspect live operations, roles and references before choosing recovery. Never rerun the entire operator blindly, re-elevate a role, replay Phase A or restore a backup automatically. Backup restore and additional credential/role actions require their own reviewed scope. No app/migrator password or secret mutation, schema installation, HARDEN, merge or deployment belongs to Phase B.
- Validation so far: 12 closed Python operator cases and their Node wrapper passed locally, including approval/backup guards, private password cleanup, partial failure/no-retry behavior, operation drift/timeouts, incorrect role output, strict postflight evidence and PG override removal. Extended PostgreSQL 16 acceptance cases exercise the actual postflight SQL before/after simulated cutover, both identities and all three databases, restart-fence rejection, retained role flags, TEMP privilege drift and foreign-database persistence. Actual CI execution on the new code head is pending; no Cloud SQL operation has run.

- Protected main: `bc5a5c764413498189147cc34c7e857c78aa3d2c` (merged #273). Its own Node `38120301083` and Test `38120301054` passed; push PR Validation skipped as designed.
- Media Apply #4 `38121038156`, job `114415645937`, succeeded after owner approval: **1 added, 1 changed, 0 destroyed**; post-apply `MEDIA_BUCKET_APPLY_VERIFIED`. State lineage `00bd1621-fc2e-2b58-4177-2ba90ec51e9f`, serial **4**. Saved plan `38120326927` has been consumed; do not replay it.
- The operation added the canonical runtime bucket objectAdmin binding and the reviewed lifecycle Delete condition `num_newer_versions=3`, with 30-day soft delete.
- Owner-supplied Cloud Shell output on 2026-10-11 confirms removal of the temporary canonical deployer bucket `roles/storage.admin` grant; returned bucket policy etag `CAg=`. Canonical and historical runtime objectAdmin bindings remain, with no returned public principal. This proves the returned direct policy, not all inherited/effective access. Historical runtime removal remains separately reviewed.
- Post-removal Production Operator #71 `38121433817` used **VERIFY_ONLY** on that exact main and passed. Job `114416805570` reported readiness at `07:28:27 UTC`, 15 enabled secret metadata checks and `FIRST_DEPLOY_MISSING_SERVICES=backend frontend`. Both hardened-role verification and deploy were **skipped** as designed; no Production deployment occurred.
- Google readiness #798 `38121557389` failed on that main at `07:37:13 UTC`: `Deferred Production secret GOOGLE_MAPS_ANDROID_API_KEY unexpectedly has a version.` validate-files passed; protected Web/Android build steps were skipped. It does not certify all 17 live secret policies.
- Recovered 2026-10-08 owner-session evidence reports that Android Maps was activated after a matching release fingerprint, with package/API/SHA-1 restrictions and an enabled Secret Manager version. The source still classified Android as deferred. This repair requires Android's latest version to be ENABLED under its unchanged direct/effective IAM checks; only Server Maps remains zero-version deferred. Counts become 17 metadata resources / 16 enabled-version secrets / 1 deferred secret. No credential or IAM change is performed; key restrictions and signed-device acceptance remain separate evidence.
- Validation: the added active-Android scenario reproduced the exact live deferred-version failure against unchanged main source. The repaired executable Bash suite passed 52/52, zero failed/skipped, with all gcloud calls intercepted by a closed metadata-only fixture. Missing/disabled/destroyed/empty Android versions and missing Android IAM roles are rejected; Server Maps still rejects any version. Bash/Node syntax checks passed. These are local source tests, not live Google certification; new exact-head CI/Preview/review and a post-merge live run remain required.
- The most recent database-role dispatch returned by the current Actions inventory remains failed PREPARE `37183178537` from 2026-10-04. No newer role dispatch was returned. This does not exclude out-of-band changes or certify current SQL memberships/schema.
- Remaining gates: operation-fresh backup for the next mutation, any separate PITR drill, repair of the observed PostgreSQL memberships/ACLs, runtime credential continuity, installed canonical schema, HARDEN, then approved deployment/domain/browser acceptance. The completed backup-restore drill below has bounded evidence; VERIFY_ONLY cannot close the remaining gates.
- Owner-supplied instance describe on 2026-10-11: command targeted `khedmah-v1-db`; POSTGRES_16, RUNNABLE, europe-west1; automated backups enabled, STANDARD tier, retention 7 backups, PITR and replication-log archiving enabled, 7-day transaction-log retention in CLOUD_STORAGE, backup startTime 20:00. The pasted name line includes terminal echo noise; no resource rename is inferred. Configuration alone does not prove a successful backup or tested restore.
- Additional owner-supplied Cloud Shell evidence on 2026-10-11: the five latest automated backups are SUCCESSFUL; newest backup `1791662400000` ended `2026-10-10T21:05:35.243Z` (`2026-10-11 00:05:35 Asia/Damascus`). The latest 20 source-instance operations show 19 BACKUP_VOLUME and one UPDATE, all DONE with no returned error code. No restore/clone appears in that bounded list; it does not rule out older, deleted or other-target drills and does not prove restored data integrity.
- Project instance inventory returns only `khedmah-v1-db`, RUNNABLE, POSTGRES_16, europe-west1. Detailed metadata: ENTERPRISE, `db-f1-micro`, ZONAL, 10 GB PD_SSD, public IPv4 enabled, connectorEnforcement=NOT_REQUIRED, requireSsl=false, sslMode=ALLOW_UNENCRYPTED_AND_ENCRYPTED, Google-managed internal CA. No privateNetwork, authorizedNetworks or diskEncryptionConfiguration was returned. Do not infer that actual traffic is unencrypted or that unauthenticated database access is possible.
- Exact-head pre-repair evidence: `41c2ff3d061b66e9f8d131fa026ab9e02c1e1f53` passed Node `38122741807`, Test & Verify `38122741922`, Google source validation `38122741810` and Preview `38122741806`. Preview passed browser capture, Classifieds acceptance and 32/32 mobile interactions. The PR-event production-secret-gate was skipped; these results are not live secret certification or acceptance of a later commit.
- Additional source review reproduced a fail-open inherited-role lookup: `if ! role_grants_secret_payload_access ...; then status=$?` captured the inverted success status and ignored lookup failure. A closed fake-gcloud PERMISSION_DENIED scenario incorrectly returned 0 on that exact script. The repair captures the original status using a positive if/else, accepts only verified non-payload status 1, and rejects unresolved roles or malformed/missing/mismatched role metadata. Direct IAM allowlists, the bounded human project-Owner exception and Android-active/Server-deferred policy remain intact.
- Local repaired suite: **64/64 passed, zero failed/skipped**, including 12 new cases for inherited lookup failure, invalid metadata and verified non-payload roles. Bash and Node syntax checks passed. Every gcloud call was intercepted by the closed fixture; this is not live Google certification.
- Implementation commit `f6f34550d6329945fb140e0f81f6ece83f7f930d` passed Node `38125264579`, Test & Verify `38125264547`, Google source validation `38125264532` and Preview `38125264550`, including review-evidence. Current inline review threads were empty; that is not an independent approval. Source/diff review found no blocking issue in the bounded Android-active and inherited-role error-status fixes. The PR production-secret-gate was skipped by design. This documentation update must pass checks/review on its own new head before normal merge and live Google readiness on resulting main.
- Completed owner-approved drill on 2026-10-11: the owner explicitly approved creation, restore, target-only test access/read validation and deletion of `khedmah-v1-restorecheck-20261011`. Approval was followed by owner-operated Cloud Shell commands; do not ask again for, or replay, this completed operation. The preliminary two-hour USD 0.03–0.10 estimate was not a billing cap; no final cost measurement is available.
- Target CREATE `2e152649-b39f-4565-abae-19bc00000024` completed DONE without a returned error at `2026-10-11T08:56:56.640Z`. Target configuration: europe-west1, POSTGRES_16, ENTERPRISE, db-f1-micro, ZONAL, 10 GB PD_SSD, connectorEnforcement REQUIRED and sslMode ENCRYPTED_ONLY; automated/final backups, storage auto-resize and deletion protection disabled.
- Backup `1791662400000` from `khedmah-v1-db` was restored only to that temporary target. RESTORE_VOLUME `ff1cb738-a7b8-46b0-ab3e-5fd700000024` completed DONE without a returned error: start `2026-10-11T09:12:18.872Z`, end `2026-10-11T09:26:23.249Z`, operation duration 14m 4.377s. This is restore-operation duration, not an end-to-end recovery-time guarantee. The earlier 300-second wait timeout was not a restore failure.
- SQL read evidence supplied by the owner: authenticated to the restored `khedmah` database as `postgres`, `transaction_read_only=on`; `pg_catalog.pg_tables` excluding `pg_*` and `information_schema` returned **0 rows**. Therefore no sample row-count query was generated or executed. `ROLLBACK` and `RESTORE_READ_CHECK_COMPLETED` were returned. Target-only generated credentials enabled this read after manual authentication failed; the earlier failure cause is unproven. No credential value was shared.
- Cleanup confirmed by owner-supplied operation output: DELETE `19bd7db7-0e80-4b53-a07f-26f700000024` completed DONE without a returned error, start `2026-10-11T10:06:26.188Z`, end `2026-10-11T10:08:27.986Z` (13:08:27.986 Asia/Damascus). The subsequent project instance list returned only `khedmah-v1-db`, RUNNABLE. The temporary target is deleted; do not recreate it for an already completed check.
- Evidence boundary: backup restore, SQL/catalog readability and temporary cleanup are complete for this drill. Populated application-data recovery was not exercised; arbitrary-time PITR and canonical schema installation remain unverified. Current source membership/ACL and migrator authentication evidence is recorded separately below; runtime credential authentication subsequently passed; see the completed operation evidence above. Do not infer the live source is empty or replay migrations from the restored snapshot's zero tables.
- Owner-supplied production reads at `2026-10-11T11:15:49.528683Z` and `2026-10-11T11:21:49.943826Z` (14:15/14:21 Asia/Damascus) authenticated to `khedmah` as `khedmah_migrator` using existing `DATABASE_MIGRATION_URL` active -> ENABLED version `2`. Both transactions were read-only and ended with ROLLBACK plus `PRODUCTION_CATALOG_READ_COMPLETED` / `PRODUCTION_ACL_READ_COMPLETED`. No source credential, alias or SQL write occurred.
- Actual membership/attributes: `khedmah_app` has only `cloudsqlsuperuser` (inherit/set true, admin false) and LOGIN/INHERIT/CREATEROLE/CREATEDB; `khedmah_migrator` has only `khedmah_migration_role` (inherit/set true, admin false), LOGIN/INHERIT and no returned elevated flags. Both custom roles are NOLOGIN/INHERIT with no returned parent memberships. This mixed state is rejected by the current PREPARE classifier; it is not initial, resume or completed. Today's state does not establish the cause of the October 4 failure.
- Observed ACL differences from the reviewed runner: database PUBLIC still has CONNECT/TEMPORARY; schema public still grants PUBLIC USAGE and runtime-role USAGE. The migration role has database CONNECT/CREATE and public-schema USAGE/CREATE, but all four grant options are absent. Runtime role has database CONNECT and no CREATE, but inherits TEMPORARY through PUBLIC. Runtime-login effective database/schema rights remain broad through cloudsqlsuperuser.
- `pg_default_acl` returned zero rows: the required migrator-owned global routine EXECUTE restriction is absent; default PUBLIC routine EXECUTE has not been revoked. Application-login/global role settings returned zero rows. The only returned extension is plpgsql 1.0. Non-system relations and routines each returned zero; this is not a complete audit of types, triggers, foreign objects or other databases.
- Database owners: khedmah/postgres -> cloudsqlsuperuser, cloudsqladmin -> cloudsqladmin; public schema -> pg_database_owner. Shared dependencies touching the four application identities returned only the two custom-role database ACLs and two public-schema ACLs. Session inventory returned only this migrator read at that instant; it is not durable session containment or proof of all client availability.
- Repair requirements are now explicit: stage database/schema ACL restrictions and migration grant options; set migrator routine defaults under its own identity; replace the runtime login's cloudsqlsuperuser membership and verify privilege flags, credential continuity and fresh-session isolation. A membership-only change or merely accepting this mixed state would not satisfy the existing gates. Do not promote the migrator or reset source passwords to force an accepted PREPARE state.
- Earlier runtime credential and three-database reads are complete; both approved Phase A transactions now also completed as recorded above. The independent post-operation readback is also complete as recorded above; do not replay the earlier zero-default-ACL preflight. Review Phase B next.
- PR #274 combines the Android-active certification repair, the inherited-role fail-closed repair, their regression tests and these synchronized checkpoints. It is no longer documentation-only. The old saved-plan hold is obsolete because media apply completed; the new head must pass its own checks/review before normal merge.
- Floot remains the experience layer. The existing Business Desk has not been integrated; follow the [Floot/Google gate](FLOOT-GOOGLE-INTEGRATION-GATE.md).

Checkpoint: 2026-10-05; protected main `b364a67c68e17c38667db652e6a3e7d3884a3b32` after PR #258. PRs #256–#258 have closed the canonical-WIF diagnostic and documentation-drift gates; main build, source inventory, code quality, and test/verification checks are green. The reviewed database-role workflow/runner remain unchanged from `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`; live-secret alignment `4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f` remains merged through #253, and secret-name diagnostics through #256. Read live refs and run status before an operation. Source review and completed owner reads below do not authorize a mutation.

## Target and historical anchor

- Repository: `khedma-sy/khedmah-digital-v1`.
- Explicit Production project: `khedma-dl`; approved region: `europe-west1`; instance: `khedmah-v1-db`.
- Canonical federated workflow deployer: `khedmah-v1-deployer@khedma-dl.iam.gserviceaccount.com`. The owner's interactive Cloud Shell account is a separate identity.
- Latest successful GitHub inventory observed: [run 37179237640](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37179237640), old source `5a961be5035dce1197ba2d0c65519e86f65ca4c6`, [job 111368235212](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37179237640/job/111368235212), execution `khedmah-database-role-inventory-s7pck` on 2026-10-04.
- Manifest re-read/recomputed on 2026-10-05: `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`; it matches both the selected execution's logged digest and the protected variable read today. This is evidence for that execution, not a new database snapshot today.

## Completed owner reads — preserve this resume position

| Read received on 2026-10-05 | Reviewed result |
| --- | --- |
| Latest existing inventory execution list/metadata | `khedmah-database-role-inventory-s7pck`, start `2026-10-04T05:13:55.497181Z`, completion `2026-10-04T05:14:07.818024Z`, succeeded count 1. |
| Canonical execution-specific log records | 47 total: D=5, M=12, R=30; zero duplicates; independent digest matches the value above. |
| Protected `DATABASE_SYSTEM_ROLE_MANIFEST_SHA256` | Same value, read today; recorded variable update time `2026-10-03T16:12:33Z`. |
| Direct secret IAM for `DATABASE_MIGRATION_URL` | Exactly the three expected bindings below; IAM policy version 1, etag `BwZc6oXwB6M=`, received `06:25:47 UTC`. |
| Project IAM output | Received `2026-10-05T08:12:04Z`; etag `BwZc6odB8Zk=`, IAM policy version 3. The returned JSON contains 25 bindings and seven principals; no conditions, `allUsers` or `allAuthenticatedUsers` were returned. The project-policy read is complete within that returned scope. |
| AliasManager custom-role definition | Received `2026-10-05T08:27:40Z` (`11:27:40` Damascus): `projects/khedma-dl/roles/khedmahDatabaseMigrationAliasManager`, stage `GA`, exactly `secretmanager.secrets.get` and `secretmanager.secrets.update`; `deleted` absent. The result was legible despite terminal paste noise and completes this definition read. |
| CloudAssetPolicyAnalyzer custom-role definition | Received `2026-10-05T08:36:48Z`: `projects/khedma-dl/roles/khedmahCloudAssetPolicyAnalyzer`, stage `GA`, `deleted` absent; exactly `cloudasset.assets.analyzeIamPolicy`, `cloudasset.assets.searchAllIamPolicies`, `cloudasset.assets.searchAllResources` and `iam.roles.get`. The definition matches declared source and this read is complete. |

| Principal | Reviewed direct secret role |
| --- | --- |
| `serviceAccount:khedmah-v1-deployer@khedma-dl.iam.gserviceaccount.com` | `projects/khedma-dl/roles/khedmahDatabaseMigrationAliasManager` |
| `serviceAccount:khedmah-v1-deployer@khedma-dl.iam.gserviceaccount.com` | `roles/secretmanager.secretVersionManager` |
| `serviceAccount:khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com` | `roles/secretmanager.secretAccessor` |

These reads are complete, not missing prerequisites to repeat. IAM policy versions do not establish secret version state. The direct secret policy, returned project policy and both custom-role definitions do not establish complete inherited/conditional/denied effective permissions or the remaining role definitions. The selected inventory is still dated 2026-10-04; review later changes or operation-specific freshness before using it for mutation.

The project output includes `roles/secretmanager.secretAccessor` for both `serviceAccount:khedma-v1-deployer@khedma-dl.iam.gserviceaccount.com` and `serviceAccount:khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com`, the historical identities without `h`. Their effective access, current usage and any retirement requirements remain open; no IAM change was made or authorized by this observation. Canonical deployer project roles `roles/iam.serviceAccountUser` and `roles/run.admin` match [the declared bootstrap source](../../infra/iac/bootstrap/main.tf); their presence is not new source drift. Attachment/impersonation scopes and effective access still require evidence.

The former source mismatch is repaired through merged #253. On prior main `e61d1142...`, [the live-secret validator](../../scripts/validate-production-live-secret-certification.sh) expected two direct migration-secret bindings while Terraform declared the three observed bindings. Implementation `4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f` aligns that expectation, passed 59 offline/local cases and two independent reviews, and entered main `82283464...` after its own exact-head source/Preview gates. The AliasManager live definition also matches declared permissions. [Exact source and validation scope](CURRENT-STATE.md#live-secret-certification-alignment--merged-source) do not replace inherited/effective-access evidence or authorize removing the canonical live binding.

## Live resume position after owner reconciliation

The historical service-account metadata command below has been completed and is retained only as historical evidence. Both historical accounts exist and are enabled. Subsequent owner reads also established:

- no Cloud Run Services in `europe-west1`;
- four database-role Cloud Run Jobs, each attached to canonical `khedmah-v1-migrator`;
- broad historical-account bindings from Cloud Asset IAM search;
- direct recent use of `khedma-v1-deployer` in Audit Logs through 2026-10-04, including token generation, Cloud Build, Cloud Run job operations and service-account impersonation, plus `DATABASE_MIGRATION_URL` secret-version/alias activity on 2026-10-03.

Therefore historical-account retirement is **not** an automatic cleanup operation. The earlier controlling defect was the protected GitHub Production identity path. That gate is now closed: the protected runtime/deployer identity set is canonical and protected WIF authentication has been proven to advance past the canonical identity checks. The current control-plane gate is direct/effective Secret Manager IAM reconciliation, beginning with the proven `DATABASE_URL` drift. No PREPARE or IAM mutation precedes completion of that reconciliation and the remaining Phase 1A gates.

## Historical first command — completed

This command was the first unresolved read at the earlier checkpoint. It has now completed successfully and is retained here only as provenance; do not repeat it as a pending prerequisite:

```bash
gcloud iam service-accounts list --project=khedma-dl --filter='email=khedma-v1-deployer@khedma-dl.iam.gserviceaccount.com OR email=khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com' --format='json(email,uniqueId,disabled)'
```

The filter targeted `khedma-v1-deployer` and `khedma-v1-runtime`, the historical missing-`h` identities observed in project IAM. The successful result established both accounts exist and are enabled. Subsequent audit evidence established active historical-deployer use, so existence metadata is no longer the retirement decision point.

After this result, select one bounded read for remaining custom-role definitions/effective access and historical identity usage, then continue through secret aliases/version states, backup/PITR/recovery, actual PostgreSQL membership and installed schema evidence. Do not print secret payloads, full environment dumps or unrelated logs. No new Cloud Run execution is created by the command above.

## Permanent Secret Manager IAM reconciliation matrix — source-derived

Canonical identities:
- runtime: `khedmah-v1-runtime@khedma-dl.iam.gserviceaccount.com`
- build: `khedmah-v1-build@khedma-dl.iam.gserviceaccount.com`
- deployer: `khedmah-v1-deployer@khedma-dl.iam.gserviceaccount.com`
- migrator: `khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com`

The live-secret validator certifies exactly 17 permanent secrets. The table below is derived from `scripts/validate-production-live-secret-certification.sh` and `infra/iac/bootstrap/main.tf`; it is the expected direct-IAM allowlist, not a claim that live IAM already matches it.

| Secret | Expected direct IAM |
| --- | --- |
| `DATABASE_URL` | runtime: `roles/secretmanager.secretAccessor` |
| `FIREBASE_API_KEY` | runtime: `roles/secretmanager.secretAccessor` |
| `FIREBASE_APP_ID` | runtime: `roles/secretmanager.secretAccessor` |
| `GOOGLE_MAPS_BROWSER_API_KEY` | runtime + build: `roles/secretmanager.secretAccessor`; deployer: `roles/secretmanager.secretVersionManager` |
| `GOOGLE_MAPS_SERVER_API_KEY` | runtime: `roles/secretmanager.secretAccessor` |
| `GOOGLE_OAUTH_SERVER_CLIENT_ID` | runtime + deployer: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | runtime + build: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | runtime + build: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | runtime + build: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | runtime + build: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | runtime + build: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | runtime + build: `roles/secretmanager.secretAccessor` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | runtime + build: `roles/secretmanager.secretAccessor` |
| `OPERATIONS_PRODUCT_ROLE_BINDINGS` | runtime: `roles/secretmanager.secretAccessor` |
| `RESEND_API_KEY` | runtime: `roles/secretmanager.secretAccessor` |
| `GOOGLE_MAPS_ANDROID_API_KEY` | deployer: `roles/secretmanager.secretAccessor` + `roles/secretmanager.secretVersionManager` |
| `DATABASE_MIGRATION_URL` | migrator: `roles/secretmanager.secretAccessor`; deployer: `roles/secretmanager.secretVersionManager` + `projects/khedma-dl/roles/khedmahDatabaseMigrationAliasManager` |

Current live evidence:
- `DATABASE_MIGRATION_URL` direct IAM matched the exact three canonical bindings when read on 2026-10-05.
- `DATABASE_URL` direct IAM does **not** match: its accessor binding contains both historical `khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com` and canonical `khedmah-v1-runtime@khedma-dl.iam.gserviceaccount.com`.
- No live claim is made yet for the other 15 direct policies.
- Project-level historical Secret Manager access remains separately relevant to effective access and retirement sequencing; exact direct-secret cleanup alone is not sufficient certification.
- The validator also rejects conditional direct bindings, public principals, disabled/latest-missing permanent secrets, and inherited payload access found through Policy Analyzer.

### Next read-only evidence set when Cloud Shell resumes

Do not mutate IAM yet. Read one bounded set and compare it to the source-derived table:
1. Direct IAM for the remaining permanent secrets, without payload access.
2. Latest-version state only (`ENABLED`/other), never secret values.
3. Effective inherited access for each permanent secret via Policy Analyzer, preserving the validator's no-inherited-payload-access requirement.
4. Historical runtime/deployer usage/continuity evidence sufficient to decide safe retirement ordering.

Only after the complete drift set and continuity evidence are reviewed should an operation-specific IAM change be proposed. Any removal remains a Production IAM mutation requiring explicit owner authorization.

## Gate matrix

| Gate | Source-enforced behavior | Current evidence still required |
| --- | --- | --- |
| Source | Role workflow locks requested SHA, checkout and fetched main; validates project/region inputs | Live main, exact checks, operation mode, applicable approval and environment protection evidence |
| Scope | Role workflow rejects regions other than `europe-west1` and checks the SQL target | Current project/region/instance identity; concurrent or out-of-band operation review |
| Deployer | Canonical active account checked; build and migration SAs must exist | Canonical GitHub/WIF deployer proof is complete. Three direct migration-secret bindings, returned project IAM and AliasManager/CloudAssetPolicyAnalyzer definitions are reviewed. Historical account metadata, Cloud Run inventory, Cloud Asset IAM search and recent audit activity are also reviewed. Remaining direct/effective Secret Manager IAM drift and retirement sequencing stay open before PREPARE. |
| Manifest | Digest syntax validated early; actual digest compared later by the SQL runner | Selected execution's 47 records, independent digest and current protected-value comparison are reviewed; establish no unexplained later change and suitability for the intended operation |
| Role state | #250 checks actual memberships/flags with sorted expected values and the three-user/type allowlist | Actual current PostgreSQL membership evidence. The historical Admin API table with blank roles does not supply it |
| Credential continuity | PREPARE tries enabled active/numeric selectors; final alias committed after verification | Current aliases/version states, which credential path is usable, and recovery plan without copying or printing payloads |
| Backup/PITR | Role workflow has no backup input, freshness gate or PITR/restore validation | Current instance state, successful backup tied to the operation/instance, PITR metadata and reviewed restore/recovery evidence |
| Schema | Separate baseline and migration operators define sequence-specific gates | Installed schema/catalog evidence and historical outcomes; choose only missing governed operations, following [schema gates](SCHEMA-RELEASE-GATES.md) |
| Acceptance | Post-cutover verify and active-alias checks cover their specific phases | Isolation result, inventory comparison, canonical schema/hardening and release acceptance before deployment |

## Critical ordering in the current role workflow

The [workflow](../../.github/workflows/production-database-role-bootstrap.yml) performs the following stages:

1. Lock source/target, validate inputs, authenticate, check canonical account and identity/secret metadata.
2. Build the bootstrap image in every external mode.
3. For PREPARE, deploy/execute the membership classifier with enabled credential candidates. The [runner's `role-state` and credential `probe` paths](../../scripts/production-database-role-bootstrap.sh) exit before the system-manifest comparison.
4. Publish a transition secret version, deploy a credential probe, change the migrator password and probe it.
5. For initial state, execute prepare SQL, which now compares the actual system-role manifest before its role mutations. Resume/completed states follow their own later audit/verification path.
6. Perform applicable containment, restart, final credential/isolation and active-alias commit steps.

Thus the actual-manifest comparison does not precede every cloud, secret or password mutation. Source green status cannot replace prior manifest, IAM and backup review. The runtime-containment recovery steps are not proof of a recoverable database backup or a tested restore.

## Read-only boundary

Listing/describing existing resources and reading narrowly selected metadata/logs can proceed under the current read-only sequence. New builds, Cloud Run job deployment/execution, backup creation, password/secret writes, IAM changes, database writes, Terraform actions and DNS/deployment changes need their applicable gates and authorization.

INVENTORY/VERIFY describe the database behavior of their phase; the full workflow also builds and deploys/executes infrastructure. Do not dispatch them as a substitute for an existing-resource read. Do not use `REPAIR_MIGRATION_SECRET` to resolve a missing observation; it rotates credentials.

## Record one reviewed result at a time

For each meaningful observation retain timestamp, source SHA where relevant, exact project/region/resource/run/execution, selected non-secret result, its limits and the next dependency. Failed or missing access leaves the gate open. The owner is at a computer and supplies reviewed Cloud Shell output; workspace access itself covers GitHub and local source. Resume from the already-issued historical service-account metadata result, not the completed inventory/log/variable/direct-secret-policy/project-policy or either custom-role read.

This session has performed zero Production mutations. No mutation command or old-SHA confirmation is queued by this document. Once cloud reconciliation is complete, select and review one concrete operation using its current code, backup and confirmation requirements.
