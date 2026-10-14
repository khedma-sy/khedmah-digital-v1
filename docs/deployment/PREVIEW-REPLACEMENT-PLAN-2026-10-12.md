# Preview replacement plan — 2026-10-12

## Runtime grants committed and verified — actual runtime login read next — 2026-10-14

**Owner runtime grants are complete. Do not repeat the apply.** The owner returned `PREVIEW_V2_RUNTIME_GRANTS_COMMIT_ACKNOWLEDGED` and **`PREVIEW_V2_RUNTIME_GRANTS_VERIFIED`** at **`2026-10-14T07:18:19.287615+00:00`**, for project `khedmah-preview-v2-20261012`, instance `khedmah-preview-v2-db`, database `khedmah`. Corrected grant blob `be758ce6374ad81b63ac24e86eca147b1932f2aa` / SHA256 `b086e77e8f64011364261b61cbda93a0828c5f76ad53874f798722120fabc10c` matches the reviewed source; its pinned dependency source is `8e5da7031c592036b25d90112b7c85c427a72cf6`.

The receipt confirms exact effective/explicit ACLs, column and inherited privileges: **60 public application tables, three Taxi tables, 20 permitted Taxi UPDATE columns**, with **64 tables / nine routines / twelve triggers** unchanged. Rollback metadata remains inaccessible; runtime CREATE/grant option remain absent. Schema structure, ownership, routines and default privileges are unchanged. Only runtime grants changed; no schema/application-data/cloud-configuration mutation or credential/data-row output. Migration secret v1 was accessed privately; the runtime credential was not accessed and live runtime login/DML are not yet tested.

**Next safe action: the corrected `--verify-runtime` read in NEXT-ACTION.md.** Helper `scripts/verify-preview-v2-runtime.py`, blob **`44e5429f4d74c5674f88ff5414d55859d2d1e5a6`**, SHA256 **`a89c33be26755c0e948e5e80c140752b978d13a039d82a9bae95f03e5692b940`**. It freshly checks the fixed Preview target, inventory/ownership and exact applied ACLs, then privately uses existing `DATABASE_URL:1` for an actual `khedmah_app` connection. Read-only transactions run **62 zero-row allowed SELECT probes and two denied SELECT probes**, then recheck ACLs through the migrator. No application rows are read/printed and no DML or grant/schema/cloud changes occur. Expected success: **`PREVIEW_V2_RUNTIME_LOGIN_READONLY_VERIFIED`**. On STOP, return the bounded output for review; do not replay grants, change credentials or substitute an older reader.

Live GitHub rechecked: protected main `bc5a5c764413498189147cc34c7e857c78aa3d2c`; sole PR #274 open/unmerged, reconciliation parent `147a937740f7fbcddc1ee91d80df08b7fd9575b2`. Executable/test source remains **`a5f4c7cb379cbf40aa1d44aacb7208a4f1fd51e1`**: Test & Verify `38525824793`, Node CI `38525824734` and Google readiness `38525824741` succeeded; **2,613 passed / zero failed / one optional skip**, including the native PostgreSQL 16 regression. Artifact `11876296494` and the detailed validation below remain retained. Preview `38525824824` remains deliberately held after RESEND metadata verification; no deployment or cleanup was released.

This checkpoint changes only the same five Markdown files with **[skip ci]**; no new test run/dispatch, code/workflow change, merge or assistant cloud execution. This owner grant receipt does not establish runtime DML, full schema/deployment readiness, browser/session/Maps/mail acceptance or Floot connection. Taxi trips remain disabled and Production gates remain closed. The completed ledger and historical evidence are preserved; earlier pending-grant instructions below are superseded.

## Historical checkpoint — Runtime ACL ordering correction verified — bounded owner grant next — 2026-10-14

**Correction verified; next owner action is one bounded corrected Preview runtime grant.** Owner post-attempt read at `2026-10-14T06:32:52.361353+00:00` confirmed **GRANTS_NOT_APPLIED**, exact ACL/table set/ownership and 64/9/12. No later owner grant receipt has been supplied. Historic COMMIT/rollback remains unproven. That read alone did not authorize retry; source diagnosis and regression validation below now complete the reviewed correction gate.

Implementation **`a5f4c7cb379cbf40aa1d44aacb7208a4f1fd51e1`** fixes a demonstrated ordering defect. Native PG16 diagnosis (`38524835170` / job `115722634754`) found **269 identical explicit ACL entries**, no observed-only/expected-only entries, but different array order. Both observed/expected ACL arrays now sort with explicit `COLLATE "C"`; complete values/counts, all seven literal GRANTs, ownership/default-ACL checks and schema fingerprints are preserved. No privilege is removed from verification or broadened. Safe failure metadata prints only SQLSTATE/source-allowlisted labels and never raw stderr, SQL or credentials. This establishes and repairs a source defect; the original Cloud Shell SQLSTATE and historic transaction result are not retrospectively proven.

### Validation evidence

- **Test & Verify `38525824793` SUCCESS**, job `115725803075`: **2,613 passed, zero failed, one optional WASM skip** (root 1,846 + backend 616 + frontend 151). Native PG16 regression passed at `2026-10-14T07:05:05.3944065Z` with all retained contracts unchanged.
- Native en_US fixture reproduces the old ordering error, then verifies corrected COMMIT/readback, complete rollback on excess rollback-table access/schema drift, replay rejection, corrected applied-state reader semantics, and runtime permissions (62 zero-row SELECTs / two denials). It is a disposable network-disabled Docker fixture, not Cloud SQL execution or live runtime/password-login acceptance.
- **Node CI `38525824734` SUCCESS**; **Google readiness `38525824741` SUCCESS**, Production secret gate skipped. Local 19 grant + 15 reader Python tests and optional PG18 WASM regression also passed.
- Test artifact **`11876296494`**, expires `2026-10-21T07:08:05Z`, digest `eff425fea88de36a8dc96fd36cf88daa785e50b5d654e757f783f766b3b23ba1`.
- Preview `38525824824`: quality job `115725803036` succeeded; deployment job `115727637398` passed source/target/WIF/isolation and read RESEND v1 ENABLED at `2026-10-14T07:08:28.237Z`, no payload access or mutation, then **`PREVIEW_MAIL_METADATA_COMPLETE_DEPLOYMENT_HELD`**. Schema/service deployment and review were skipped; cleanup stayed skipped. This is the deliberate hold, not a WIF failure or readiness pass.

### Pinned next step and boundaries

Use only the current command in **NEXT-ACTION.md**. Corrected grant blob **`be758ce6374ad81b63ac24e86eca147b1932f2aa`**, SHA256 **`b086e77e8f64011364261b61cbda93a0828c5f76ad53874f798722120fabc10c`**. It freshly rechecks the exact fixed Preview target, existing migration secret v1, full contracts and absent-grant baseline, then grants the same reviewed permissions in one transaction and rechecks exact ACL/schema state after COMMIT. No migration replay, application DML, role/owner/default-ACL change, secret recreation, Production mutation or deployment.

Require both COMMIT acknowledgement and **`PREVIEW_V2_RUNTIME_GRANTS_VERIFIED`** before moving to live runtime-login acceptance. On any STOP/missing receipt, send the complete bounded output and reconcile; never automatically repeat the apply. The corrected reader is blob `44e5429f4d74c5674f88ff5414d55859d2d1e5a6`, SHA256 `a89c33be26755c0e948e5e80c140752b978d13a039d82a9bae95f03e5692b940`; its grant pin uses the same collation correction. Older reader `be29039...` is retained as historical read evidence and must not be used for post-grant acceptance because it pins the old comparison.

Protected main remains `bc5a5c764413498189147cc34c7e857c78aa3d2c`; sole PR #274 remains open/unmerged. This final checkpoint changes only the same five Markdown files with **[skip ci]**, preserving the tested executable/workflow bytes and completed ledger. No new test/dispatch, direct assistant Cloud Shell execution or owner grant success is claimed. Application/Floot, runtime login/DML, full readiness, Taxi trips and all remaining deployment/browser/mail/media gates stay pending/held.

## Historical checkpoint — Runtime ACL ordering correction — native validation pending — 2026-10-14

Owner reconciliation at **2026-10-14T06:32:52.361353+00:00** confirms **GRANTS_NOT_APPLIED**, exact ACL/table set/ownership and 64/9/12 after the unconfirmed grant attempt. No runtime credential, application rows or mutation; historic COMMIT/rollback is still unproven.

**A source defect is now reproduced on native PostgreSQL 16.** Unchanged SQL fails `RUNTIME_GRANTS_EXACT_ACL_MISMATCH` before COMMIT in disposable fixtures. Run `38524835170`, job `115722634754`, records the exact difference: only `explicit_privileges` differs; observed-only and expected-only arrays are both empty, and both contain **269 entries**. The values agree but their order differs. Catalog-derived names and text literals can inherit different collations; the old expected/observed JSON arrays used implicit ordering. This native reproduction establishes a source defect, not the original cloud SQLSTATE or a historic cloud rollback.

The correction gives both complete observed and expected ACL arrays explicit `COLLATE "C"` ordering. It does not remove, deduplicate or normalize privilege values, change the seven GRANTs, broaden roles, change defaults/owners or remove the exact comparison. The reader pin advances to the corrected grant contract so post-grant classification uses the same ordering. Bounded failure metadata now prints only SQLSTATE and a source-allowlisted exception label; raw stderr, SQL, paths and values stay private, and failures still stop without retry.

The native regression keeps all retained PG16 contracts, uses an explicit en_US locale, demonstrates the old ordering failure, then checks the correction, rollback on excess ACL/schema change, post-COMMIT readback, replay rejection and runtime SELECT allow/deny probes. It uses only a new network-disabled Docker container without host mounts/ports or existing-database fallback. A fixture-only multiline JSON parser error in `5060a23621afb93be49fbb18b8a2d24342a642a3` was fixed at `309dd4cd4ee77b897aeac5597e1a901e7d8b2659`; a temporary Docker-init socket readiness race is also corrected by waiting for the final server's loopback TCP readiness.

Local validation: **19 grant Python tests + 15 reader Python tests passed**, JavaScript syntax and diff checks passed; optional PG18 WASM rollback/ACL/digest/readback suite passed. **Native CI on this correction is pending. Next: review that result before releasing a new owner command.** Old grant and runtime-login commands remain held. Prepared grant blob `be758ce6374ad81b63ac24e86eca147b1932f2aa`, SHA256 `b086e77e8f64011364261b61cbda93a0828c5f76ad53874f798722120fabc10c`; not owner-executed.

Main `bc5a5c764413498189147cc34c7e857c78aa3d2c` and open/unmerged PR #274 are retained; implementation parent `8e5da7031c592036b25d90112b7c85c427a72cf6`. Preview deployment/cleanup and Production gates remain unchanged. No workflow dispatch, migration replay, secret recreation, owner cloud mutation or live runtime-login/readiness claim. The completed ledger and historical evidence remain preserved.

## Historical checkpoint — Post-attempt ACL reconciliation complete — native diagnosis next — 2026-10-14

Owner post-attempt reconciliation completed at **2026-10-14T06:32:52.361353+00:00**, received 09:33:23 Damascus. `PREVIEW_V2_RUNTIME_ACL_STATE_READ` reports **GRANTS_NOT_APPLIED**, exact ACL state and expected table set/ownership verified, **64 tables / 9 routines / 12 triggers**. Migration credential v1 was read privately; no runtime credential, application rows, runtime probes or mutation. Full retained schema contracts were not reverified. Historic COMMIT/rollback remains unproven; this current-state read does not authorize retry.

The requested reconciliation is complete. **Next safe action is source diagnosis and native PostgreSQL 16 regression in a disposable CI fixture**, not another identical cloud read or grant retry. The new `tests/preview-v2-runtime-grants.postgres.test.mjs` uses only a uniquely named Docker container with network disabled, no host mounts, no published port and no existing database fallback. It exercises the complete unchanged grant SQL, retained contracts, exact baseline, COMMIT receipt, readback and replay rejection using native psql. Native execution is pending CI; local JavaScript syntax passed. The earlier optional PG18 WASM test omitted PG16-specific retained contracts and cannot settle this failure.

Grant helper and read-only helper bytes are unchanged in this diagnosis checkpoint. No cause or fix is claimed yet. All owner cloud mutation and runtime-login commands remain held until the diagnosis/correction is reviewed. No completed migration, secret or infrastructure setup is repeated. Main remains `bc5a5c764413498189147cc34c7e857c78aa3d2c`, PR #274 open/unmerged; parent `b5445cb03e76419ae46a2d9346c626540f3adeaf`. Existing executable CI on `ce387aa61facbfb0e66c444d2620369082739203` remains historical source evidence; the new native test is not yet verified. Preview deployment/cleanup explicit holds and Production manual gates are unchanged. No workflow dispatch or assistant cloud mutation.

## Historical checkpoint — Runtime grant outcome unconfirmed — read-only reconciliation next — 2026-10-14

Owner ran the pinned runtime grant helper once and returned `PREVIEW_V2_RUNTIME_GRANTS_PREFLIGHT_PASSED` (project `khedmah-preview-v2-20261012`, public allowlist 60, Taxi tables 3), followed by **`STOP: RUNTIME_GRANTS_RESULT_UNCONFIRMED_READ_BEFORE_RETRY`**. Received **`2026-10-14T09:25:22+03:00`**; this failed attempt emitted no operation timestamp. **No COMMIT acknowledgement or `PREVIEW_V2_RUNTIME_GRANTS_VERIFIED` receipt was supplied.** The grant outcome is unknown: do not claim applied grants, rollback, unchanged database state, successful runtime login or readiness.

The 06:19:13 UTC owner read remains a valid **pre-attempt** observation of GRANTS_NOT_APPLIED, exact ACLs/table set/ownership and 64/9/12. It cannot establish the state after this attempt. Source inspection of the unchanged `execute_sql` shows that this STOP covers process errors/timeouts, a nonzero psql exit, or output above the bound. Raw captured stderr is intentionally not printed; the marker does not identify the failing SQL statement or prove whether COMMIT occurred. No cause is established yet.

**Next safe action: run the existing pinned `--inspect-acl` reader** from [NEXT-ACTION](../project-control/NEXT-ACTION.md), now specifically to reconcile the uncertain grant attempt. Reader blob **`be29039afc398c92aa250c3cfe933b9275e81087`**, SHA-256 **`85d1506e2182de13b5201ea32954e85d36acc17a5cdc94c0d06066538270e7fe`**. It privately uses migration credential v1 and read-only sessions, reads no runtime credential or application rows, and classifies exact baseline/expected ACLs. It works before or after grants; do not substitute older absent-grant-only readers or migration scripts.

- `EXPECTED_GRANTS_PRESENT`: do not apply again. Review current-state evidence and remaining schema/runtime acceptance before proceeding; the historic COMMIT/digest receipt is still absent.
- `GRANTS_NOT_APPLIED`: grants are absent at the new observation; this alone does **not** authorize retry. Diagnose the stopped execution and review any correction before another mutation.
- Any STOP/drift/unavailable read: preserve the hold and review the output. No automatic repair, alternate credential, broader privilege or retry.

The old `--apply-runtime-grants` and `--verify-runtime` commands are held until this reconciliation is reviewed. The grant helper remains unchanged (blob `4c903b4dfe3bf0e3b510ff5002d0c7e9df39fad0`); no replacement mutation command is prepared by this checkpoint. Preserve all completed migrations/secret setup, default ACLs/ownership, rollback-table exclusion, narrow Taxi permissions and disabled Taxi trips. Production and Preview deployment/cleanup gates remain closed.

Live GitHub: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`, sole open/unmerged PR #274 parent `17d69677e0d95f8d887bb29b8c9cb49245a3157f`. Existing CI on `ce387aa61facbfb0e66c444d2620369082739203` remains successful (2,612 pass, zero fail, one optional skip); Preview `38463786718` is the deliberate deployment hold. CI is source evidence and does not certify this cloud attempt. Same five Markdown checkpoints only, `[skip ci]`; no code/workflow change, new tests, dispatch, merge or assistant cloud mutation. Update the ledger only with the actual reconciliation result.

## Historical checkpoint — pre-attempt ACL read completed — 2026-10-14

Owner supplied **`PREVIEW_V2_RUNTIME_ACL_STATE_READ`** at **`2026-10-14T06:19:13.016995+00:00`** (09:19:13 Damascus), received `2026-10-14T09:19:40+03:00`. Exact target: project `khedmah-preview-v2-20261012`, instance `khedmah-preview-v2-db`, database `khedmah`. Result **`acl_state=GRANTS_NOT_APPLIED`**, `exact_acl_state_verified=true`, `expected_table_set_and_ownership_verified=true`, **64 tables / 9 routines / 12 triggers**. The return-time read is complete and must not be presented as the next missing step.

The helper privately accessed existing migration credential v1; runtime credential was not accessed (`runtime_secret_version=null`), runtime login/DML were not tested, and zero runtime SELECT/denial probes were run. No application rows were read/printed; no credential output or schema/ACL/cloud-configuration mutation occurred. `full_schema_contract_reverified=false`: this read checks inventory/ownership and exact ACL state, not every retained function/body contract. The owner's 2026-10-13 full contract evidence through 034 remains separately preserved. `prior_attempt_commit_or_rollback_proven=false` and `retry_authorized=false` remain accurate; this is a current-state observation, not proof of a historical transaction or permission to retry an uncertain mutation.

**Next safe action: execute the existing bounded Preview runtime grant once**, as prepared in [NEXT-ACTION](../project-control/NEXT-ACTION.md). The absent-grant branch of the reviewed return plan is now satisfied. No runtime grant attempt/receipt has yet been supplied. Helper `scripts/grant-preview-v2-runtime.py` is unchanged: implementation `1b041bbcfe4018fc0c64698c259ce09fc9321596`, blob **`4c903b4dfe3bf0e3b510ff5002d0c7e9df39fad0`**, SHA-256 **`275ddbb90fd3e3e936520c1a5601f8b4e4927da43c2855550cf30ee4fb7741d2`**. It rechecks target, complete retained schema contracts and exact baseline immediately before its bounded transaction; this receipt does not bypass that preflight.

The seven reviewed GRANT statements cover only the 60 named public application tables and narrow Taxi schema/table/column/resolver permissions, via the existing runtime role. Rollback metadata remains excluded; no runtime CREATE/grant option, ownership/default-ACL/role change, migration replay, application data mutation or cloud configuration change. Locks, exact ACL and structural-digest checks precede COMMIT; separate read-only readback follows its acknowledgement. Require **`PREVIEW_V2_RUNTIME_GRANTS_VERIFIED`** before the prepared actual-runtime-login read. On STOP or missing final receipt, return the output and any COMMIT acknowledgement; do not retry or run historical migration helpers.

Live GitHub rechecked: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`; sole open/unmerged PR #274 at parent `4862be31d7710c408fc931f98f41bac67ee706b5`. Verified executable/test source stays `ce387aa61facbfb0e66c444d2620369082739203`: Test & Verify `38463786773`, Node `38463786754`, Google source/Android `38463786803` succeeded (2,612 passed / zero failed / one optional skip). Preview `38463786718` remains deliberately held after its successful RESEND metadata read; no new run or deployment is needed for this receipt. This update changes the same five Markdown checkpoints only with `[skip ci]`; no new executable/test/workflow change, tests, dispatch, merge or assistant cloud mutation. Full runtime/DML/deployment readiness, Firebase backend verification binding, durable media, browser/session/Maps/mail acceptance and Floot remain open. Preserve Production and Preview/cleanup gates.

## Historical checkpoint — Preview return handoff prepared — 2026-10-13

The owner asked to complete available repository work and prepare Google Cloud Shell commands while away. **No new owner cloud receipt has arrived.** Latest verified schema/runtime evidence remains `PREVIEW_V2_SCHEMA_ACL_READ_COMPLETED_NO_MUTATION` at `2026-10-13T19:43:50.327004+00:00`: schema contracts through 034, **64 tables / 9 routines / 12 triggers**, runtime CONNECT/public USAGE only. Runtime grants, application deployment and Floot acceptance are not completed. Preserve the full completed-work ledger below and all migration/secret/setup receipts.

**Next safe action on return:** run the new pinned `--inspect-acl` command in [NEXT-ACTION](../project-control/NEXT-ACTION.md). It classifies the exact current ACLs as `GRANTS_NOT_APPLIED` or `EXPECTED_GRANTS_PRESENT`; any other state stops. This fresh return-time read is different from repeating the already completed schema receipt. If grants are absent, run the existing bounded grant helper once. If expected grants are present, skip mutation. Only after the verified grant receipt or an exact expected-grants read, run the prepared `--verify-runtime` command. Any STOP requires review; there is no automatic repair or retry.

New helper: `scripts/verify-preview-v2-runtime.py`, source checkpoint `93e087e01c309a276418aba4272e3a9cce10fdba`, blob `be29039afc398c92aa250c3cfe933b9275e81087`, SHA-256 `85d1506e2182de13b5201ea32954e85d36acc17a5cdc94c0d06066538270e7fe`. It verifies 21 immutable helper/SQL sources and pins the existing Preview project/account/organization/SQL instance/PostgreSQL 16/database. It checks actual table inventory/ownership, unprivileged roles, and complete effective/explicit/default ACLs without rewriting observed values. `--inspect-acl` reads only migration credential v1 privately and works before or after grants. `--verify-runtime` first requires exact applied ACLs, then privately reads **DATABASE_URL:1** and connects as the actual **khedmah_app** login, with a private proxy/passfile and read-only transactions. It checks 62 permitted zero-row SELECT statements and two denied SELECTs (rollback metadata and Taxi events), then checks ACLs again as migrator. It reads/prints no application rows or credential values, changes no schema/ACL/cloud configuration, and sends no message. It does not execute DML or the Taxi resolver, re-certify every schema function body, prove a prior uncertain COMMIT, or certify application readiness. Both modes use `ROLLBACK`; error output is sanitized and no retry is automated.

The existing grant helper is unchanged: blob `4c903b4dfe3bf0e3b510ff5002d0c7e9df39fad0`, SHA-256 `275ddbb90fd3e3e936520c1a5601f8b4e4927da43c2855550cf30ee4fb7741d2`. It grants only 60 public application tables and the reviewed narrow Taxi schema/table/column/function contract; rollback metadata remains excluded. Its exact baseline, transaction/schema-digest checks, COMMIT acknowledgement and readback remain mandatory. Do not replay any completed migration or rotate/restage credentials. Never run the older absent-grant schema readers as post-grant acceptance.

### Validation and deployment boundaries

New helper: **15 offline Python tests passed**, plus the extended optional PGlite 0.5.9 / PG18.6 WASM SQL laboratory. The lab verified pending/applied/drift classifications and execution as the runtime role: 62 permitted SELECTs, two denials, exact ACL checks, rollback and replay/drift rejection. Only the published reader's PG16 version guard and the retained grant helper's previously documented PG16/deparser contracts are adapted/excluded in this PG18 lab. It is not native PG16 password authentication or Google Cloud evidence. Published helpers retain their exact PG16 guards.

The complete repository builds successfully locally; repository-mode database/Google/Firebase/operations readiness validation passed. Root suite: **1,811 passed, two optional skips, zero failures** (1,813 tests). Local `test:all` found the expected backend disposable-database guard (`DESTRUCTIVE_DB_TESTS_DISABLED`) and one stale frontend assertion requiring Places on `/map`. Source/SITE-ATLAS review confirmed `/map` uses base Maps and `/mobility` loads Places itself (including dynamic loading after the shared script). `apps/frontend/tests/mobility-journey.test.ts` now checks that split without changing application code or API permissions. The complete frontend suite then passed **151/151**, and **27 focused Maps/Places behavior tests** passed. No cloud or existing database was substituted for backend tests. Fresh GitHub CI supplies its isolated PostgreSQL 16 service. This is source validation, not a deployment-readiness verdict.

Live initial review: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`, only open PR #274, parent `93e087e01c309a276418aba4272e3a9cce10fdba`. Runtime reader/return commands were published in `9c192d6a56aff8c2c188480651b1fd7911b32be9`; the follow-up Maps assertion correction in `ce387aa61facbfb0e66c444d2620369082739203` completed fresh full CI as recorded below. Production workflows remain manual; Staging is develop-triggered. Preview and cleanup retain `PREVIEW_MAIL_METADATA_COMPLETE_DEPLOYMENT_HELD` and `PREVIEW_V2_CLEANUP_HELD_NO_CLOUD_ACCESS`. No workflow dispatch, merge, Production mutation, email send or direct Cloud Shell execution is included. GitHub performed the bounded Preview metadata read recorded below.

Source review found concrete remaining gates: Preview backend has no **FIREBASE_API_KEY** binding for `GoogleAuthService` server-side account lookup; the browser-restricted Firebase key must not simply be reused or loosened for server requests. Preview also has no **GCS_MEDIA_BUCKET** binding and therefore selects the intentional in-memory adapter; durable media requires reviewed bucket IAM and wiring before durable-media acceptance. Existing schema jobs recognize already-applied stages, but the deployment path still launches schema jobs in apply-capable modes; review them against the prepared 034 schema and runtime ACLs before release. Actual origin/Auth/Maps restrictions, CORS/CSRF, Google sessions, mail key scope/settings/delivery and Floot connection still require acceptance. These findings do not authorize a deployment or a new key/IAM change by themselves. The prepared return commands end at read-only runtime acceptance; inspect their receipts before preparing the next bounded cloud change.

### Completed current-source GitHub verification

Executable/test source **`ce387aa61facbfb0e66c444d2620369082739203`** is verified. [Test & Verify 38463786773](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38463786773), job `115525544156`, passed **2,612 tests**, zero failures and **one optional skip**: root 1,845 pass / one skip, backend 616 pass, frontend 151 pass. Backend CI used its isolated PostgreSQL 16 service. [Test evidence artifact 11848071087](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38463786773/artifacts/11848071087) is available subject to GitHub retention (expires 2026-10-20). The optional PG18 WASM lab was run locally as qualified above; it is the single optional CI skip.

| Run | Verified result |
| --- | --- |
| [Node CI 38463786754](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38463786754) | Successful: build/tests, source inventory and Terraform validation without remote backends. |
| [Test & Verify 38463786773](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38463786773) | Successful: all three test suites, PR/code quality checks and blocking security audit. |
| [Google source readiness 38463786803](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38463786803) | Successful source validation and Android debug build/provenance; Production secret gate skipped. Not Production acceptance. |
| [Preview 38463786718](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38463786718) | Quality gates and baseline resolution passed. Deployment job `115527807196` stopped at the intentional mail hold; schema/service deployment and review evidence skipped. Cleanup skipped. |

The Preview job freshly read metadata at **`2026-10-13T20:39:15.655Z`** after source/target/WIF/isolation guards: RESEND container visible, enabled version present, latest **version 1 / ENABLED**. `cloud_mutation=false`, `secret_payload_access=false`, `runtime_access_verified=false`, `email_delivery_verified=false`; then `PREVIEW_MAIL_DIAGNOSTIC_COMPLETE_NO_MUTATION` and `PREVIEW_MAIL_METADATA_COMPLETE_DEPLOYMENT_HELD`. This corroborates the owner-staged secret; it is not a delivery, key-scope or runtime-login test.

This final evidence/handoff update is **five Markdown checkpoints only, `[skip ci]`**. All executable/test/workflow bytes remain identical to the verified source above; a separate CI result on the documentation-only head is not claimed. Main remains `bc5a5c764413498189147cc34c7e857c78aa3d2c`; PR #274 remains open/unmerged. No manual workflow dispatch, Production mutation, email send or direct Cloud Shell execution. The GitHub Preview job performed only the bounded metadata read described above.

## Historical checkpoint — schema/ACL receipt verified; bounded runtime grants prepared — 2026-10-13

Owner **`PREVIEW_V2_SCHEMA_ACL_READ_COMPLETED_NO_MUTATION`** at **`2026-10-13T19:43:50.327004+00:00`**, received `2026-10-13T22:44:08+03:00`, confirms the full contracts through 034: **64 tables, nine routines, twelve triggers**, two schemas and zero sequences. Complete effective/explicit/default-ACL inventories were read in a read-only migrator session. No grant/schema/cloud-configuration mutation or credential/application-row output occurred. Existing migration secret v1 was privately accessed; runtime credential and runtime login were not tested.

The exact baseline is now known: both `khedmah_app` and inherited `khedmah_runtime_role` have only database CONNECT and public-schema USAGE (four effective entries, two explicit grants to the role). No table/column/sequence/function or Taxi-schema privileges were observed. Runtime roles own no database/schema/relation/routine/type. Database owner is `cloudsqlsuperuser`; public schema owner is `pg_database_owner`; Taxi schema owner is `khedmah_migrator`. The two owner-only function default-ACL entries remain intact, no role-setting rows exist, and the two intentional 017 NOT VALID taxonomy foreign keys remain unchanged. No repair or auto-validation is needed.

034 remains completed at `2026-10-13T19:28:48.482988+00:00`, with the Food discount/total contract and empty promotion/order tables. All earlier completions, 033/hardened 032/Billing seeds and the original fulfillment failure/reconciliation history remain preserved in the ledger and [preceding checkpoint](https://github.com/khedma-sy/khedmah-digital-v1/blob/1b480cbfcb8d2eade13d1d44b4ca4fb2a7620f31/docs/project-control/CURRENT-STATE.md). **Never replay foundation/024/025/026–028/029/030/033/031–032/034.** Version 023 is intentionally unused.

**Next safe action: owner runs `scripts/grant-preview-v2-runtime.py --apply-runtime-grants` once.** This is a prepared Preview-only ACL mutation, not an executed grant or deployment. Implementation **`1b041bbcfe4018fc0c64698c259ce09fc9321596`**, helper blob **`4c903b4dfe3bf0e3b510ff5002d0c7e9df39fad0`**, SHA-256 **`275ddbb90fd3e3e936520c1a5601f8b4e4927da43c2855550cf30ee4fb7741d2`**; source checkpoint `1b480cbfcb8d2eade13d1d44b4ca4fb2a7620f31`. Twenty immutable read/helper/SQL dependencies are checksum-verified. The pinned read helper is blob `6c9d5415f60902288c69f0910513d65479f2d950`, SHA-256 `13f93b5ffdc8a4f3cdec501bd965e2673be4f4418fe656484242c969e3cb2bb2`.

The source review of `scripts/production-database-role-bootstrap.sh` and the Taxi application writer/resolver is reconciled with the observed baseline. The Production hardener is not executed or modified. Its all-public-table loop would include rollback metadata; this helper instead uses sixty literal public-table names and the narrow Taxi model.

| Target | Prepared privilege |
| --- | --- |
| Sixty named public application tables | SELECT, INSERT, UPDATE, DELETE to `khedmah_runtime_role`; explicitly excludes `category_taxonomy_022_before_image`. |
| `khedmah_taxi` schema | USAGE only. |
| Driver/vehicle approvals | SELECT and INSERT, plus UPDATE on eleven driver columns and nine vehicle columns; no whole-table UPDATE, identity-column UPDATE, DELETE or TRUNCATE. |
| Operational approval events | INSERT only. |
| `resolve_actor_locked(text,boolean)` | EXECUTE only; all eight other routines remain unavailable to runtime/PUBLIC. |

The existing inherited membership supplies these permissions to `khedmah_app`; no direct login grant, role/membership/owner/default-ACL/sequence change, CREATE/TRUNCATE/REFERENCES/TRIGGER/grant option, migration replay, seed insertion, approval assignment or application-row DML is issued. No future-table blanket grant is introduced. Granting the reviewed Taxi administration contract does not enable Taxi trips.

Target checks remain fixed to project `khedmah-preview-v2-20261012` / `1044962071847`, organization `594049370623`, account `haifawi30@gmail.com`, instance `khedmah-preview-v2-db`, region `europe-west1`, PostgreSQL 16, database `khedmah`, migrator and enabled `DATABASE_MIGRATION_URL:1`. Private temporary proxy and passfile are retained; the runtime credential is not read. All existing contracts and the exact returned ACL baseline are checked before mutation.

The transaction obtains a Preview-specific advisory lock and SHARE ROW EXCLUSIVE locks on the existing 64 tables before repeating the pinned contracts and exact baseline. Only seven explicit GRANT statements then execute. Full effective and explicit metadata, including inherited and column privileges, PUBLIC, grant options, defaults, memberships and ownership, is compared to the exact expected result **inside PostgreSQL before COMMIT**, without the old 300-row output cap. Only bounded success metadata is printed. A private catalog digest checks that schema definitions/owners, columns, indexes, constraints, function bodies/security, triggers, types, policies, role attributes and memberships remain unchanged. Digest excludes the targeted ACLs and volatile relation statistics; it does not hash credential values or application rows.

A COMMIT acknowledgement is followed by a separate REPEATABLE READ, READ ONLY verification of exact ACLs and the same schema digest. Any failure or missing acknowledgement is unconfirmed; stop and reconcile before retrying. Once grants exist, the older absent-grant inspection/apply helpers are no longer valid post-grant acceptance commands. Do not substitute an old migration rerun or blindly retry this helper.

Expected final marker: **`PREVIEW_V2_RUNTIME_GRANTS_VERIFIED`**, counts **64/9/12**, public allowlist **60**, Taxi tables **3**, Taxi UPDATE columns **20**, `runtime_grants_mutation=true`; schema/application-data/cloud-configuration mutation false. Runtime credential/login/DML acceptance, full-schema/deployment readiness, Taxi trips, application deployment and Floot remain false. No live grant receipt has been received yet.

Validation: **17 offline Python tests passed through the Node wrapper**, plus the optional SQL laboratory and Python/launcher syntax. Tests cover twenty pins/tampering, exact baseline and manifest drift, transaction/COMMIT ordering, effective/direct/column/PUBLIC/default ACLs, schema digest coverage, private credentials/cleanup, disabled secrets, missing acknowledgements/timeouts, failure after acknowledged COMMIT, no retry and no runtime-login/readiness claim. The local SQL lab used **PGlite 0.5.9 / PostgreSQL 18.6 WASM** on all 33 canonical migration files. It exercised the new grant/baseline/ACL/digest/readback SQL unchanged, including complete rollback on unexpected ACL or schema changes, success/readback, replay rejection, extra Taxi identity-column privilege and PUBLIC rollback-table access rejection. **Retained PostgreSQL-16 version/deparser-specific contracts were excluded only in that lab** after a PG18 deparser mismatch in the 029 check; those contracts are unchanged in the published helper and were verified by the owner's PG16 read. This is not native PG16 integration, Google Cloud execution or live runtime acceptance. SQL privilege semantics were checked against [PostgreSQL 16 GRANT](https://www.postgresql.org/docs/16/sql-grant.html).

Files: `scripts/grant-preview-v2-runtime.py`, `tests/test_preview_v2_runtime_grants.py`, `tests/preview-v2-runtime-grants.test.mjs`, optional `tests/preview-v2-runtime-grants.sql.test.mjs`; same five existing checkpoints updated. The optional lab requires `KHEDMAH_PGLITE_MODULE` pointing to an installed 0.5.9 module and is skipped without it; no package dependency or lockfile change.

After the owner receipt, reconcile the applied ACLs, then prepare bounded runtime-credential login/permission acceptance without business-data creation, email or notification send. Full current-source checks, actual frontend URL/key/Auth alignment, CORS/CSRF, Google sessions, Maps, mail scope/settings/delivery, deployment/cleanup gate review and Floot remain pending. Preserve `PREVIEW_MAIL_METADATA_COMPLETE_DEPLOYMENT_HELD` and `PREVIEW_V2_CLEANUP_HELD_NO_CLOUD_ACCESS`. No merge or Production gate release.

Live GitHub: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`; only open PR #274 at inspected parent `1b480cbfcb8d2eade13d1d44b4ca4fb2a7620f31`. Latest full-source checks remain `f99479268f036c098bdd0fd828d5295aeb11ef39`: Test & Verify `38277607829`, Node `38277607370` and Google source readiness `38277607365` successful; Preview `38277607448` deliberately held. New commits use `[skip ci]`; no current-source full CI/dispatch or assistant cloud mutation is claimed. Never retain/reprint the earlier Maps key payload/fingerprint. This checkpoint supersedes historical next actions below.

## Historical checkpoint — existing Resend team/domain found; key creation then next — 2026-10-13

Owner screenshot shows team **khedmasy** with existing `mail.khedmah.uk` marked **Verified**. Next: in that team prepare/create a separate `khedmah-preview-v2` key with **Sending access**, restricted to this domain. The next screenshot lists four existing sending keys and none named `khedmah-preview-v2`; preserve all four and save the new value privately. No key creation or cloud staging is yet evidenced. Domain transfer/claim and DNS changes remain held; no shared tracking/settings change is included.

Preserve Google parent/provider API verification, six staged Firebase SDK values, Storage/PAP, database and WIF completion. Maps/origins, schema/runtime grants, current-source full checks, application deployment, login/session and Floot acceptance remain pending. Adding a mail key does not release the explicit Preview workflow deployment hold.

Live GitHub rechecked: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`, open PR #274 parent `e51013430fc12620a05e8622d5964eff5d74ab62`; latest full-source checks at `f99479268f036c098bdd0fd828d5295aeb11ef39` and held Preview run `38277607448` are unchanged. Five Markdown checkpoints only with `[skip ci]`; no new tests/full CI, executable changes, dispatch, merge, assistant cloud mutation or email send.

## Historical checkpoint — domain claim held; team lookup then next — 2026-10-13

The owner reached a **Claim domain** conflict: Resend reports `mail.khedmah.uk` belongs to another team; verification would transfer it and revoke existing access. Do not add the claim TXT, use Auto configure or verify/transfer/delete this domain. Next: read the team selector beside `haifawi30` and identify the existing domain's team. No successful domain verification, Preview key or secret staging is evidenced.

Owner confirmed the key is for the Preview application, not a ChatGPT connector. Google parent/provider API verification, six Firebase SDK values, Storage/PAP, database and WIF completion remain preserved. Actual login/session, Maps/origins, schema/runtime grants, current-source checks, application deployment and Floot acceptance remain pending. Preview deployment and all Production gates remain held.

Live GitHub: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`, open PR #274 parent `60929acca6824932d4a0276e7992271ea75777b5`; latest full-source checks and intentional Preview hold `38277607448` are unchanged. Five Markdown checkpoints only, `[skip ci]`; no new tests/full CI, executable change, workflow dispatch, merge, assistant cloud mutation or email send.

## Historical checkpoint — domain form prepared; Add domain then pending — 2026-10-13

Owner confirmed the key is for the Preview application. The latest unsaved Resend form shows `mail.khedmah.uk`, Ireland (`eu-west-1`) and Return-Path `send`. Next: add that domain once, then review the generated DNS screen before any Cloudflare change. Creation, verification and key staging are not yet evidenced. Saved tracking must be checked before transactional-mail testing.

Google parent/provider API verification, all six Firebase SDK values, Storage/PAP, database and WIF completion remain preserved below. Maps/origins, schema/runtime grants, current-source CI and deployment/Floot acceptance remain pending. The Preview mail workflow hold and all Production gates remain.

Live GitHub rechecked: main `bc5a5c764413498189147cc34c7e857c78aa3d2c`, open PR #274 parent `934a8190f6d73836b42438106ae13af642d57050`; latest full-source checks remain `f99479268f036c098bdd0fd828d5295aeb11ef39` with intentional held Preview run `38277607448`. This update changes the same five Markdown checkpoints only with `[skip ci]`; no new full CI, executable change, workflow dispatch, merge or assistant cloud mutation.

## Historical checkpoint — Google API verified; dashboard read then next — 2026-10-13

Owner post-save read completed at `2026-10-13T09:39:12.147924+00:00` (12:39:12 Asia/Damascus), received `2026-10-13T12:50:37+03:00`, for the pinned replacement project `khedmah-preview-v2-20261012`. Parent `PREVIEW_AUTH_CONFIG` is OK / FIREBASE_AUTH; `PREVIEW_AUTH_PROVIDER_GOOGLE_COM` is OK with `enabled=true`. Standard Auth initialization and Google provider enablement are now both verified by API metadata. Do not repeat setup, Save or the unchanged Auth read.

Facebook remains absent and deferred; it alone explains the aggregate false. No actual login/session/deployment/Floot acceptance is claimed. Preserve initialized Auth, six staged Firebase values and completed Storage/PAP, database and WIF work.

Continue from [CURRENT-STATE](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md): read Resend Domains for the intended application-mail team through the Resend connection once enabled, or from the owner's dashboard, and capture sending-verification status, especially `mail.khedmah.uk`. The source defaults to `noreply@mail.khedmah.uk`; the latest Preview RESEND_API_KEY version inventory was empty. Domain/account ownership and verification are not assumed. No key, DNS, email-send or deployment operation is included.

This pass updates the same five Markdown checkpoints with `[skip ci]`. Source review covers Preview workflow/deploy/email resolver/provider and frontend build secret bindings. No executable changes, new tests/full CI, workflow dispatch, merge, assistant cloud mutation or email send. Preserve six staged Firebase values, Storage/PAP, database/WIF completion and all Preview/Production gates.

## Historical checkpoint — Auth diagnosis and initialization handoff — 2026-10-13

Owner GET-only diagnostic completed at `2026-10-13T08:11:22.288153+00:00` for `khedmah-preview-v2-20261012`. Auth config and both Google/Facebook provider reads each returned HTTP 404, `error_status="NOT_FOUND"`, `structured_error=true` and `recognized_error_codes=["CONFIGURATION_NOT_FOUND"]`. This confirms that the service reports missing Auth configuration; it supersedes the earlier ambiguous 404-only diagnosis. Provider readiness cannot be assessed while the parent configuration is missing.

Continue from [CURRENT-STATE](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md): owner uses the exact replacement project's Firebase Console **Authentication → Get started** action, then performs the existing checksum-pinned masked Auth readback after setup. Standard Firebase Auth only; no Identity Platform upgrade, provider/support-email choice, new credentials or deployment is included. Prepared, not executed. Do not repeat the unchanged diagnostic.

Preserve all six staged Firebase values and completed Storage/PAP, database and WIF evidence. The same five documents change with `[skip ci]`; no executable changes, new full CI, workflow dispatch, merge or cloud/Production mutation. Provider/origin/Maps/mail, schema/runtime, current-source CI and deployment/Floot acceptance gates remain.

## Historical checkpoint — Storage configuration complete; Auth diagnosis then prepared — 2026-10-13

Owner `PREVIEW_V2_STORAGE_CONFIG_STAGED` at `2026-10-13T08:00:08.427498+00:00` verifies `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:1`, created=true, value_verified=true, enforced PAP and enabled UBLA. All six required Firebase values now have staging evidence across the preserved checkpoints. Do not repeat setup or staging. Full IAM/data-plane, runtime/deployment and Floot acceptance remain separate pending gates.

Continue from [CURRENT-STATE](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md): pinned GET-only `--inspect-auth`, implementation `f86108bb710654c7798eab261f902b96483d77b6`, to recover sanitized structured failure details omitted by the earlier 404-only reads. Exactly three masked Auth/provider GETs when enabled; no key/secret/user payload, journal, API activation, Auth initialization/upgrade or cloud mutation. Prepared, not live-executed.

Thirty-three mocked Python cases passed via the existing Node wrapper; compilation and launcher syntax passed. Changes are the existing Firebase helper/test plus the same five checkpoints. `[skip ci]`; no fresh full CI, merge, deployment or Production change. Review actual Auth error/config evidence before any setup mutation, then continue the established remaining gates.

## Historical checkpoint — Storage PAP completed; identifier staging then pending — 2026-10-13

Owner raw readback received `2026-10-13T10:48:47+03:00` verifies enforced public access prevention, enabled UBLA and exact replacement bucket/project/EUROPE-WEST1. Receipt time is not operation time. Do not repeat creation, rules/API setup, anonymous probes or the PAP update as pending work.

The narrow configuration gate review is in [CURRENT-STATE](../project-control/CURRENT-STATE.md). Next is the pinned single-secret helper in [NEXT-ACTION](../project-control/NEXT-ACTION.md), implementation `b743db65156947f352c6621b4ebd47973b835fef`: stage only the verified Storage bucket identifier in its existing configuration secret and verify version 1 without printing payloads. Matching existing value is read-only; conflicts/uncertain attempts stop. Full effective IAM/data-plane/application acceptance remains separate. The helper is prepared, not executed.

Ten new plus fifteen existing mocked Python cases passed through two Node wrappers; compilation and launcher syntax passed. This pass adds the helper and its Python tests, extends the existing wrapper, and updates the same five checkpoints. `[skip ci]`, no live secret write, full CI, merge, deployment or Production mutation. After owner staging evidence, continue Auth/referrer diagnosis and the established remaining gates.

## Historical checkpoint — Storage access read; bucket setting then pending — 2026-10-13

Owner evidence received `2026-10-13T10:38:31+03:00`: effective `storage.publicAccessPrevention` returned `booleanPolicy: {}` (not enforced); anonymous Firebase list **403** and GCS list **401**. The receipt time is not an operation timestamp. Both sampled anonymous requests were denied; full effective IAM, all data-plane operations and application readiness remain unverified.

Continue from [CURRENT-STATE](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md): set public access prevention to `enforced` on the existing replacement default bucket only, then read back exact identity and IAM configuration. This is a prepared, unexecuted mutation; no organization policy, IAM membership, secret staging, deployment or Production change. Do not repeat completed Storage creation or the unchanged policy/probe batch. Five Markdown files only, shell syntax checked, `[skip ci]`, no new full CI; all existing source/deployment gates remain.

## Historical checkpoint — Storage completed; access read then pending — 2026-10-13

Owner output at `2026-10-13T07:22:50.206618+00:00` confirms `PREVIEW_V2_STORAGE_PROVISIONING_COMPLETED_APPLICATION_HELD`: default bucket `khedmah-preview-v2-20261012.firebasestorage.app`, EUROPE-WEST1, Firebase linkage, deny-all source, UBLA enabled and no public direct bucket bindings. publicAccessPrevention remains `inherited`; effective access/propagation and sixth-value staging remain unverified/not performed.

Continue from [CURRENT-STATE](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md): read the effective public-access policy and probe anonymous Firebase/GCS list denial. Do not rerun the completed Storage/API/rules creation command or previous setup batches. This is a five-document evidence update with `[skip ci]`, preserving source `698a12b04b01194525e50d97ecafd3dba2a1c159` and all cloud/workflow/Production gates; no assistant cloud mutation or new full CI is claimed. Older sections requesting creation are historical.

## Owner inventory received; CLI Storage handoff prepared — 2026-10-13

Owner output at component timestamp `2026-10-13T06:50:24.270798+00:00` confirms the existing replacement project/billing, RUNNABLE SQL and users, no regional Cloud Run services, and empty Storage/Maps/Resend secret-version lists. Firebase identity is valid; the SDK bucket remains absent and Storage API disabled. Auth 404/referrer findings remain unresolved. Preserve all prior completed setup evidence.

Continue with [CURRENT-STATE](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md). The owner requested Cloud Shell operation; the checksum-pinned helper `scripts/provision-preview-v2-storage.py` at `698a12b04b01194525e50d97ecafd3dba2a1c159` prepares the missing API, deny-all release and default bucket only. Fifteen mocked Python tests plus their Node wrapper and compilation passed. It has not been executed on Google Cloud. No Production mutation, workflow dispatch, merge, secret staging or deployment occurred. `[skip ci]` preserves the holds; no full-CI claim. This supersedes the earlier UI-only next action without discarding the completed ledger.

## Execution status override — reconciled 2026-10-13

Use [CURRENT-STATE's completed-work ledger](../project-control/CURRENT-STATE.md) and [NEXT-ACTION](../project-control/NEXT-ACTION.md) for continuation. Project/billing/core APIs, infrastructure, SQL/database identities and version-1 credentials, GitHub/WIF, Firebase WebApp and five core configuration values are already complete. Completion evidence omitted by later checkpoint replacements was recovered from Git history; do not replay infrastructure, SQL pricing, credential, federation or registration batches.

The pending action is the already prepared default Firebase Storage setup for `khedmah-preview-v2-20261012` / `1044962071847`, region `europe-west1`, deny-all rules. It is not executed/reported. NEXT-ACTION specifies the bounded owner step and post-creation verification; no new cloud execution access is available here. All later schema/grants/deployment/Floot and Production boundaries remain.

**Historical-plan rule:** below, labels such as “pending owner execution”, “pending provision/review”, and “remaining implementation” describe their dated checkpoints. They do not override the completed-work ledger. Preserve those historical bytes as evidence, while advancing the compact ledger on each continuation.

## Component inspection received — bounded Storage setup next — 2026-10-13

This section supersedes the inspection command below. The owner completed it; do not repeat Firebase registration, the five core secret writes, or the unchanged component read as if its output were missing.

- **Evidence:** owner-supplied `PREVIEW_V2_FIREBASE_COMPONENT_READ_COMPLETED_NO_MUTATION`, executed `2026-10-12T18:01:56.779959+00:00`, received `2026-10-13T09:10:54+03:00`. Target `khedmah-preview-v2-20261012` / `1044962071847`, app `1:1044962071847:web:919c294e1cd5ed37374502`. SDK/key identity verified; no cloud mutation, Secret Manager payload access or credential output.
- **Storage finding:** complete project bucket inventory contains only `khedmah-preview-v2-20261012-cloudbuild-source` and `khedmah-preview-v2-20261012-tfstate`, both STANDARD / EUROPE-WEST1. SDK bucket `khedmah-preview-v2-20261012.firebasestorage.app` is absent from that project inventory. Firebase-linked bucket read was not attempted because `firebasestorage.googleapis.com` is disabled. Do not equate an SDK name with a provisioned bucket, reuse either infrastructure bucket for browser Storage, or stage the missing sixth value yet.
- **Key/Auth finding:** key `projects/1044962071847/locations/global/keys/fdae1cd2-64ce-49ec-a426-ed46120083e9` reports `browserKeyRestrictions`, empty `allowedReferrers` and 27 API targets with empty method lists. Restricted browser readiness is not established. Auth project config and both Google/Facebook provider reads returned HTTP 404; the reader did not capture a structured error reason. This is NOT proof that login is disabled or that initialization is required. The documented admin/v2 GET paths were independently checked and match the helper.
- **Other limits:** measurementId absent; the optional Analytics build repair remains in place. `all_component_reads_succeeded=false`, `browser_configuration_ready=false`, `application_deployed=false`, `floot_connected=false`. The five core version-1 values remain completed evidence from the preceding receipt; this inspection did not re-read them.
- **Next owner action — replacement Preview only:** open [Firebase Storage](https://console.firebase.google.com/project/khedmah-preview-v2-20261012/storage), under the established management account. Confirm the exact project, choose **Get started**, select **europe-west1 (Belgium)** for the default bucket and configure deny-all Firebase Storage rules matching `infra/firebase/storage.rules` (`allow read, write: if false;`). If offered modes, choose locked/production mode, then inspect the resulting Rules tab. Complete creation and return the resulting bucket name/location and Rules screen. This is an explicitly described new Preview resource operation, under the owner's existing instruction to complete Preview setup; it was NOT executed by the assistant. The UI's “production mode” label describes rule restrictions, not the Production Google project. Do not select test/public rules. If an unexpected project, existing bucket, region, access denial or billing-account change appears, return that screen instead of replacing resources or switching identities. Cloud Storage requires Blaze and usage is billable; no new billing-account link or plan/account change is part of this handoff.
- **Post-creation gate:** verify exact bucket identity/project/region, Firebase linkage, effective IAM and deployed rules, then stage only the verified Storage configuration value. Keep deny-all client Storage until an actual browser media consumer and its rules are reviewed. Source currently initializes the Storage SDK as part of the shared Firebase client; this is not working upload acceptance. Auth/provider setup, exact deployed-origin key/domain restrictions, Maps/mail, schema/runtime grants, current-source CI, deployment and Floot acceptance remain subsequent work.
- **Repository:** re-read protected main `bc5a5c764413498189147cc34c7e857c78aa3d2c`; PR #274 open/unmerged at parent `cc4b92d3405e5386e3f6566db14838a2ae45af0f`, with zero Actions returned for that exact SHA. This update changes only the same five checkpoint documents, with `[skip ci]`; no new full-CI/merge readiness claim. Existing executable source `ecac46b3c1f70a81764c20a1960a10dc4ba0c43e` and all cloud/workflow holds are preserved. Production, Staging and old Preview are unchanged.

References: [Firebase Storage setup](https://firebase.google.com/docs/storage/web/start), [default bucket resource](https://firebase.google.com/docs/reference/rest/storage/rest/v1alpha/projects.defaultBucket), [Auth config GET](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig), [provider config GET](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs/get).

Earlier sections are historical where they request the already completed inspection or claim its result is pending.

## Five Firebase core secrets verified — Storage, key and Auth inspection prepared — 2026-10-12

This is the current continuation point for the unfinished Floot integration. The replacement Preview's Firebase project, WebApp and five core SDK configuration secret versions are now verified by owner execution. Do not repeat registration or the completed `--apply` staging command.

- **Completed owner result:** `PREVIEW_V2_FIREBASE_CORE_CONFIG_STAGED`, evidence `2026-10-12T17:41:53.457370+00:00`. Exact target `khedmah-preview-v2-20261012` / `1044962071847`, WebApp `1:1044962071847:web:919c294e1cd5ed37374502`. The SDK/key association matched and all five values were written and read back as ENABLED version 1. Configuration values were not printed. Executed helper blob `b937ce9c2a1af686205fb396817d986f070fdf18`, SHA-256 `466cc81cdfef8c784f8b4124e1089abe4aa33ee2509d31c45d21c57c78b953cd`.
- **Observed limits:** SDK storageBucket was present; measurementId was absent. The associated key had browserKeyRestrictions and API targets including Identity Toolkit and Secure Token; allowed referrers were not in that output. Storage existence/ownership/linkage, Analytics, key restrictions, Auth providers, runtime access and complete browser configuration remain unverified. Application deployment and Floot connection remain false.
- **Prepared implementation:** `ecac46b3c1f70a81764c20a1960a10dc4ba0c43e` changes `scripts/configure-preview-v2-firebase.py`, `tests/test_preview_v2_firebase_config.py`, `cloudbuild.preview.yaml` and adds `tests/preview-firebase-build.test.mjs`.
- **Preview build repair:** Analytics measurement ID is already optional in the frontend Firebase config. The Preview Cloud Build file now removes the nonexistent measurement secret dependency and defaults `_FIREBASE_MEASUREMENT_ID` to an empty string. A nonsecret build environment variable passes an explicit substitution to Docker as data. The six required Firebase configuration bindings, including Storage, and the Maps binding remain required. No fake ID, Analytics enablement or claim of working Analytics. Staging/Production build files and frontend behavior are unchanged.
- **Next owner command:** execute the checksum-pinned `--inspect-components` command in [NEXT-ACTION](../project-control/NEXT-ACTION.md) or the replacement plan. It is mutually exclusive with `--apply`, makes GET-only API reads, rejects Secret Manager calls and POST bodies, creates no local journal and performs no cloud mutation. It preserves the fixed account/project/number/organization and exact project/WebApp/API-key association checks. SDK/API-key strings are compared in memory, not printed; no Secret Manager payload is accessed.
- **Inspection evidence:** print browser allowedReferrers and API target/method metadata; fully paginate Cloud Storage buckets for the exact project using maxResults, reject foreign project numbers, and compare the SDK bucket name with that inventory. Separately list Firebase-linked buckets with the required numeric project parent and pageSize. Read masked Auth config (authorized domains and local sign-in flags) and masked Google/Facebook provider enabled flags. OAuth client secrets, hash configuration, test phone numbers and account records are outside those field masks and are not printed.
- **Qualified failures:** disabled optional APIs are not queried; 403/404/other HTTP failures and unconfirmed requests remain labeled unknown and do not prevent the other component reads. They never authorize automatic bucket creation, Auth initialization, IAM expansion or retries with another identity. Malformed, foreign, duplicate or incomplete inventories stop. Final `PREVIEW_V2_FIREBASE_COMPONENT_READ_COMPLETED_NO_MUTATION` includes `all_component_reads_succeeded`; its completion marker is not browser/storage/Auth readiness. Storage rules/IAM and actual login flows are not validated by metadata reads.
- **Validation:** 26 Node tests passed, zero failures/skips/cancellations, covering the five focused files (configuration wrapper, registration wrapper, Preview build, isolated deployment flow, Classifieds nonproduction rollout). The two wrappers include 26 configuration/inspection Python cases and 20 registration cases. New coverage verifies GET-only/no-secret/no-journal inspection, numeric Firebase Storage scope, both pagination protocols, missing SDK bucket, disabled APIs, denied/not-found/server-error reads, foreign identities, redaction and restrictive routes. Real build-shell tests with mocked Docker verify absent Analytics and literal handling of an explicit substitution. Python compilation, `validate-preview-staging.mjs` (39 required files), launcher Bash parsing and diff whitespace checks passed. No live component read or real Cloud Build execution by the assistant.
- **Repository/gates:** starting PR #274 was open/unmerged at `ad901954a1c0714b1df718d414f01ec5e2a2423c`, with zero Actions at that head; main/base `bc5a5c764413498189147cc34c7e857c78aa3d2c`. Source/checkpoint commits use `[skip ci]`; no new full CI, merge or workflow dispatch. Last full-CI source remains `f99479268f036c098bdd0fd828d5295aeb11ef39` (2,588 tests). This pass is four implementation/test files plus these same five checkpoints.
- **After the read:** reconcile the actual Storage bucket and its access/rules before staging the sixth required Firebase value; align browser key referrers and Auth providers/domains with the reviewed Preview/Floot origins. Maps and Resend values remain pending. Then complete schema/runtime grants, current-source CI and held deployment/runtime acceptance. Existing database version-1 credentials and completed identities are preserved. Preview deployment/cleanup holds remain. No changes to Production, Staging, old Preview, WIF scope or database identities.

| Verified secret | Enabled version |
| --- | --- |
| NEXT_PUBLIC_FIREBASE_API_KEY | 1 |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | 1 |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | 1 |
| NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID | 1 |
| NEXT_PUBLIC_FIREBASE_APP_ID | 1 |

Next read-only helper blob: `cf15e0a0920215884a79c1f4dd418e2dd9abfdf7`; SHA-256: `666d257fabc3c76c6ff02a48f795209d676be31cdb248b5146577845fcadef04`.

References: [Cloud Storage project bucket inventory](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/list), [Firebase-linked bucket inventory](https://firebase.google.com/docs/reference/rest/storage/rest/v1beta/projects.buckets/list), [Auth project config](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig), [Auth provider config](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs/get), [Cloud Build substitutions](https://docs.cloud.google.com/build/docs/configuring-builds/substitute-variable-values).

Run in Cloud Shell, paste only the following block, then return its JSON output:

```bash
(
set -euo pipefail
umask 077
khedmah_read_script="$(mktemp)"
trap 'rm -f -- "$khedmah_read_script"' EXIT

gh api --hostname github.com \
  repos/khedma-sy/khedmah-digital-v1/git/blobs/cf15e0a0920215884a79c1f4dd418e2dd9abfdf7 \
  --jq '.content' | base64 --decode > "$khedmah_read_script"

printf '%s  %s\n' \
  '666d257fabc3c76c6ff02a48f795209d676be31cdb248b5146577845fcadef04' \
  "$khedmah_read_script" | sha256sum --check --status

python3 "$khedmah_read_script" --inspect-components
)
```

Earlier sections and their commands are historical; continue from the read-only inspection above.

## Owner direction and source

The owner asked why a new Preview could not replace the inaccessible project, then instructed «أبدأ» at 2026-10-12T14:38:46+03:00. Proceed with replacement preparation and prerequisite reads under the current management account. This supersedes the previous next action that made recovery of the old Preview the sole forward path; it does not authorize bypassing that project's IAM.

Reviewed PR #274 head: `beaabdf43321c3de495f273cab153a94bfb3d57a`, open/unmerged. Reviewed main: `bc5a5c764413498189147cc34c7e857c78aa3d2c`. The documentation head has zero returned workflow runs. Deployment/workflow source and existing tests remain unchanged from `0aab5966dba0b1d32029aaf4ae003b548a262ae8`; its deliberate mail hold remains intact. The standalone permission reader added at `7a46afc90f39d812892934717f09228190573221` remains unchanged. The separate operator-invoked billing helper added at `929931a757dbc490bd3f89572bbd8dd7cccde061` has now been executed successfully by the owner; it is not wired into CI. This pass adds an operator-invoked public Cloud SQL price reader and updates the same five documents. This plan has no new runtime acceptance evidence.

## Verified project and planned resources

| Item | Value / evidence limit |
| --- | --- |
| Current management account | haifawi30@gmail.com |
| New project ID | `khedmah-preview-v2-20261012` — created, ACTIVE |
| Planned resource region | `europe-west1`; the project itself is not regional |
| Parent organization/folder | Organization `594049370623`, confirmed in the new project's creation readback |
| Billing account | One visible open account, `My Billing Account`; full ID supplied privately by the owner. The owner supplied successful project-side/account-side preflight and new-project `billingEnabled=true`, `billingAccountMatches=true` readback on 2026-10-12 |
| Project number | `1044962071847`, confirmed in creation readback; never copy the old namespace |
| Database | New isolated PostgreSQL test database, synthetic data only; sizing/edition/backup policy to be costed before provisioning |
| Existing Preview | `khedmah-preview-774201339973` / `195546947562`; access investigation remains open |
| Production | `khedma-dl` / `311026134906`; excluded from replacement resources, credentials and mutations |
| Staging | Retain its independently configured identity and baseline; do not silently substitute the new Preview |

No transfer of old Preview data is assumed. Keep old resource/billing reconciliation on the backlog: creating a new project does not close, delete or stop charging for the old one.

## Step 1 — completed owner-run read-only prerequisite inventory

The owner supplied successful output for both commands in the message received at 2026-10-12T14:49:12+03:00: organization `594049370623` is the parent of `khedma-dl`, and one open `My Billing Account` is visible. No command execution timestamp was emitted. Do not rerun this completed inventory without a concrete freshness need. Commands are retained below as evidence.

```bash
gcloud projects describe khedma-dl \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --format='yaml(projectId,projectNumber,parent)'

gcloud billing accounts list \
  --account=haifawi30@gmail.com \
  --filter='open=true' \
  --user-output-enabled \
  --format='table(name,displayName,open)'
```

These reads identify a parent candidate and visible open billing accounts. They do not prove permission to create a project or link billing. The accessible project's parent is a candidate, not an automatic destination. An empty billing list is not proof that no billing account exists.

Remaining prerequisites after the supplied inventory:
- Completed: organization `594049370623` is identified and its `resourcemanager.projects.create` test returned allowed=true.
- Completed: project-side billing assignment/service-use permissions and billing-account association permission were checked by the billing helper, and linking/readback passed.
- Completed: Google accepted creation under the selected organization and returned the exact new project ACTIVE. This does not establish quotas for future services.
- If multiple billing accounts or plausible parent destinations are returned, resolve the intended one before linking resources. Do not select by list order.
- Preserve denials as denials. Do not repeat the old Preview queries, switch to the historical account or impersonate its service account.

The assistant has no connected authenticated Google Cloud/Cloud Shell execution tool. The prerequisite inventory has been supplied. Both permission results have now been supplied. Creation/readback has also been supplied. Billing link/readback has also been supplied. Core API enablement/readback has also been supplied. The next missing evidence is the public Cloud SQL price-candidate read for the planned region.

## Step 2 — completed checksum-pinned permission-only probe

The later output supplied at 2026-10-12T14:58:59+03:00 confirmed `billingEnabled=true` on Production and repeated its account/project metadata. Its marker was `READ_ONLY_PROJECT_BILLING_STATE_OK_NO_MUTATION`; it did not test either permission below. A later result received at 2026-10-12T15:08:16+03:00 supplies both required permission booleans as true and the expected IAM completion marker. Do not rerun either completed read solely to reproduce evidence.

Use the existing current-account credentials to call these official APIs:

| Target | API | Requested permission |
| --- | --- | --- |
| Organization `594049370623` | `POST https://cloudresourcemanager.googleapis.com/v3/organizations/594049370623:testIamPermissions` | `resourcemanager.projects.create` |
| The owner-supplied open billing account | `POST https://cloudbilling.googleapis.com/v1/billingAccounts/{billing_account}:testIamPermissions` | `billing.resourceAssociations.create` |

These POST requests test IAM only; they do not create projects, link billing or grant permissions. The standalone [permission reader](../../scripts/read-preview-project-access.py) checks for configured impersonation/credential overrides, captures `gcloud auth print-access-token` in memory without printing it, refuses redirects and emits projected permission booleans. HTTP/authentication/invalid-response failures stop as read errors, not as evidence that permission is absent.

Observed owner-supplied output includes `PROJECT_CREATE: allowed=true`, `BILLING_LINK: allowed=true`, `read_only=true` on each result, and `PREVIEW_PARENT_AND_BILLING_IAM_PASSED_NO_MUTATION`. No API execution timestamp was emitted; the recorded timestamp is receipt of the owner's message. Both permissions must be assessed under the current account. A successful probe does not establish quota/name availability, organization-policy compliance, the new project's billing assignment permissions or billable account standing.

Validation performed: six local mocked checks passed (both permissions present, missing permission, HTTP denial, auth override, malformed response and invalid billing-account ID), including fixed API/permission scope and no token in output. No live Google API request or mutation was executed. No monetary estimate or resource apply is established by a permission result alone.

The full billing account ID remains an operator argument, not committed configuration. Helper SHA-256: `90b832c077641f5bd642041ee7435e3651f6baa9d7fc064679bd19808ba3785a`; immutable Git blob: `361e986116a4e3b361a9b11fb36a88fdc9fedfe6`. The new helper is not automatically called by CI and its existing deployment hold is unchanged.

Completed reader reference only; do not rerun without a concrete reason. The private billing identifier remains an argument:

```bash
(
set -euo pipefail
khedmah_access_script="$(mktemp)"
trap 'rm -f -- "$khedmah_access_script"' EXIT
gh api --hostname github.com repos/khedma-sy/khedmah-digital-v1/git/blobs/361e986116a4e3b361a9b11fb36a88fdc9fedfe6 --jq '.content' | base64 --decode > "$khedmah_access_script"
printf '%s  %s\n' '90b832c077641f5bd642041ee7435e3651f6baa9d7fc064679bd19808ba3785a' "$khedmah_access_script" | sha256sum --check --status
python3 "$khedmah_access_script" --billing-account=OWNER_SUPPLIED_BILLING_ACCOUNT_ID
)
```

A download/checksum failure stops before execution. The owner has supplied both true permission booleans and the success marker. The helper itself performs no project creation or billing mutation.

## Step 3 — completed project-container creation

The owner completed this bounded stage. Scope was one new project container under the verified organization. Google returned `createTime: 2026-10-12T12:13:49.031Z`, project number `1044962071847`, ACTIVE state and the exact parent/labels shown below; receipt was `2026-10-12T15:15:58+03:00`. Operation `create_project.global.5239605183562174711` completed successfully. Do not rerun creation. The command below is retained only as execution evidence. This stage deliberately does not attach billing or create runtime capacity, so resource sizing/cost decisions remain prerequisites for the later billable infrastructure stage.

| Change | Exact target |
| --- | --- |
| Create project ID | `khedmah-preview-v2-20261012` |
| Display name | `Khedmah Preview V2` |
| Parent | `organizations/594049370623` |
| Caller | `haifawi30@gmail.com` |
| Labels | `environment=preview,application=khedmah` |
| Cloud API bundle | Do not enable automatically: `--no-enable-cloud-apis` |
| Billing, runtime resources, default configuration | No link, resource provisioning or default-project switch in this command |

```bash
(
set -euo pipefail
gcloud projects create khedmah-preview-v2-20261012 \
  --organization=594049370623 \
  --account=haifawi30@gmail.com \
  --name='Khedmah Preview V2' \
  --labels=environment=preview,application=khedmah \
  --no-enable-cloud-apis \
  --user-output-enabled

gcloud projects describe khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --format='yaml(projectId,projectNumber,name,lifecycleState,parent,labels,createTime)'
)
```

The shell stops if creation fails; it must not adopt an unrelated existing project or proceed with billing after an error. If the create command times out or its completion is uncertain, reconcile the exact operation/project with read-only metadata before any retry. A successful create enforces name availability and Google's applicable creation controls at that moment; it does not certify later service quotas.

The supplied readback matches the exact project ID, organization parent, Preview labels and ACTIVE state, with assigned number `1044962071847`. The `environment: untagged` advisory concerns Resource Manager tags and does not contradict the returned labels. No Cloud SQL, Cloud Run, WIF, secret, DNS or GitHub environment change is included here.

The command passed local Bash syntax validation and was successfully executed by the owner, not the assistant. The official [create command](https://docs.cloud.google.com/sdk/gcloud/reference/projects/create) documents `--no-enable-cloud-apis`, organization, name, labels and account flags.

## Step 4 — completed billing preflight, link and readback

The owner successfully executed this step and supplied the result at `2026-10-12T15:27:20+03:00` (message receipt, not an emitted operation timestamp): both permission checks were allowed, the preflight passed, linking was attempted, and exact-project readback returned `billingEnabled=true` and `billingAccountMatches=true`, ending with `PREVIEW_BILLING_LINK_VERIFIED`. Do not repeat this completed link. The launcher below is retained as execution evidence only. The account ID remains an operator argument and is not committed. The completed run used the [billing helper](../../scripts/link-preview-project-billing.py) through its pinned launcher below. Default invocation is plan-only; the recorded `--apply` requested the bounded link after checks passed.

The helper verifies:
- Current account `haifawi30@gmail.com`, with no configured impersonation/access-token-file/credential-file override.
- Exact project `khedmah-preview-v2-20261012` / `1044962071847`, organization `594049370623`, ACTIVE state and Preview/application labels.
- No existing foreign billing association, and an exact matching open selected account.
- Project-side `resourcemanager.projects.get`, `resourcemanager.projects.createBillingAssignment`, `serviceusage.services.list`, and `serviceusage.effectivepolicy.get` via project `testIamPermissions`.
- Billing-account `billing.resourceAssociations.create`, freshly checked as the actual mutation preflight.
- Unchanged unlinked billing state immediately before the link, then exact account match and `billingEnabled=true` after it.

The single write is `gcloud billing projects link` with the exact new project and the operator-supplied account. An already identical, enabled association is verified without another write. A foreign association, denied/missing permission, closed account, wrong identity or changed preflight state stops before linking. This is not an atomic cross-API lock; avoid concurrent billing writers. A timeout/uncertain write or failed readback stops without automatic retry. Reconcile with the read-only command below before deciding any further action.

Immutable helper blob: `a302d88fdcc00ed96fee25dca7f1900e17abcd71`. SHA-256: `1038d5d6ec02064921e27363138154959e310672bd3224910d0a27a0550071eb`.

```bash
(
set -euo pipefail
umask 077
khedmah_billing_script="$(mktemp)"
trap 'rm -f -- "$khedmah_billing_script"' EXIT
gh api --hostname github.com repos/khedma-sy/khedmah-digital-v1/git/blobs/a302d88fdcc00ed96fee25dca7f1900e17abcd71 --jq '.content' | base64 --decode > "$khedmah_billing_script"
printf '%s  %s\n' '1038d5d6ec02064921e27363138154959e310672bd3224910d0a27a0550071eb' "$khedmah_billing_script" | sha256sum --check --status
python3 "$khedmah_billing_script" --billing-account=OWNER_SUPPLIED_BILLING_ACCOUNT_ID --apply
)
```

Successful mutation/readback ends with `PREVIEW_BILLING_LINK_VERIFIED`; a previously completed matching link ends with `PREVIEW_BILLING_ALREADY_LINKED_VERIFIED_NO_MUTATION`. The output projects billing state without printing the account ID or token. No resource-capacity provisioning, API enablement, default-project change or GitHub retargeting is included.

For an uncertain link result, reconcile only:

```bash
gcloud billing projects describe khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --format='yaml(projectId,billingEnabled,billingAccountName)'
```

Validation: Python compilation and 16 local mocked checks passed: successful link, plan-only, existing identical link, wrong project, foreign association, closed account, missing permission, auth override, HTTP denial, invalid permission response, concurrent preflight change, failed post-link readback, invalid billing ID, explicit CLI scope/captured output, mutation timeout without retry, and redirect refusal. The launcher passed Bash parsing. These local checks are separate from the subsequently supplied successful live billing result above.

## Step 5 — completed core API enablement and readback

The owner completed this bounded stage. Result received at `2026-10-12T15:49:33+03:00`: operation `operations/acf.p2-1044962071847-c671033d-c4b4-49b4-8dbe-5a977c13b27a` finished successfully and all following 13 requested APIs were returned ENABLED. The full post-read includes five extra ENABLED services: `containerregistry.googleapis.com`, `pubsub.googleapis.com`, `storage-api.googleapis.com`, `storage-component.googleapis.com`, `telemetry.googleapis.com` (18 total). Their precise activation history is not established by a single post-read; do not disable them as presumed mistakes. Do not repeat the completed core enablement. The command below is historical execution evidence. It does not explicitly create SQL instances, Cloud Run services, build executions or other runtime capacity. Google may enable dependencies and create service agents as part of activation; the full enabled-service readback is intentionally retained. Do not disable automatic dependencies merely because they are not in the requested list.

| Purpose | Requested APIs |
| --- | --- |
| Project/service control | `serviceusage.googleapis.com`, `cloudresourcemanager.googleapis.com` |
| Identities and future GitHub federation | `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com` |
| Runtime and build | `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com` |
| Data and configuration | `sqladmin.googleapis.com`, `secretmanager.googleapis.com`, `storage.googleapis.com` |
| Observability | `logging.googleapis.com`, `monitoring.googleapis.com` |

Firebase/Auth, Maps, API Keys, optional media integrations and any other application-specific APIs are a later explicit stage after their consumers are reconciled. Do not copy the broad Production API set wholesale or enable container scanning without accounting for its separate charges.

```bash
(
set -euo pipefail
gcloud services enable \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project=khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled

gcloud services list --enabled \
  --project=khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --sort-by=config.name \
  --format='table(config.name,state)'
)
```

Require all 13 requested service names in ENABLED state. Preserve any error and list current service state before retrying an uncertain operation; partial enablement is not rolled back by disabling services. The native commands enforce the caller's applicable IAM/policy constraints; a denial does not justify granting Owner or changing caller. The prepared shell command passed Bash parsing, and its explicit service list was checked. The owner has supplied successful core activation/readback; no application runtime deployment is implied.

## Step 6 — public regional SQL price candidates; pending owner execution

The interactive SQL pricing page could not be reliably retrieved. Use Google's documented Catalog API instead of substituting an unverified regional number. This step has one explicit control-plane write: enable `cloudbilling.googleapis.com` in the new project. The subsequent [price reader](../../scripts/read-preview-cloud-sql-prices.py) is read-only. It uses OAuth scopes supported by the REST methods, with the current account's token captured in memory and `X-Goog-User-Project` pinned to the new project. It does not create/store an API key, read billing-account-specific contract prices, access Secret Manager or provision runtime resources.

Reader behavior:
- Reject configured impersonation/access-token/credential-file overrides, and verify exact project ID/number/parent/ACTIVE state.
- Discover the unique `Cloud SQL` service through `GET /v1/services`; do not assume an unverified service ID.
- Follow pagination of `GET /v1/services/{service}/skus?currencyCode=USD`, with bounded page sizes/count and repeated-token/duplicate-SKU rejection.
- Select OnDemand PostgreSQL, explicitly named shared-core or generic storage/backup/IP/log candidates. Require explicit regional applicability to `europe-west1`; global prices are separately labeled `GLOBAL_CANDIDATE`. Do not label a default US price, broad Europe-only scope or another region as Belgium.
- Preserve the original descriptions, categories, pricing versions/effective times, usage/base units, conversion factors, display quantity, tiers and Money units/nanos. A Money amount is `units + nanos / 1,000,000,000`; do not add nanos as whole currency units.
- Emit sanitized public price metadata only after all pages succeed. No secret/token or billing account ID is printed. HTTP failures stop with a status code; there is no caller substitution, IAM grant or automatic retry.

The proposed SQL configuration remains PostgreSQL 16 Enterprise, ZONAL, one vCPU/3.75 GiB memory (`db-custom-1-3840` candidate), 10 GiB SSD initially with proposed growth allowance to 20 GiB, seven backups/PITR days, and 730 running hours for a full-month scenario. Candidate output can include other SQL editions/families or global support SKUs: select compatible rates explicitly; do not sum every returned row or silently choose the first match.

Helper blob `85da1d0d57692dcb0bb5fb29755d7eac8a1e79cd`; SHA-256 `fc1418a5de761e34f45ae4f1bf48d4b3c216344501b3ec4f27420c3f275c846a`. The launcher verifies downloaded source before enabling the catalog API.

```bash
(
set -euo pipefail
umask 077
khedmah_price_script="$(mktemp)"
trap 'rm -f -- "$khedmah_price_script"' EXIT
gh api --hostname github.com repos/khedma-sy/khedmah-digital-v1/git/blobs/85da1d0d57692dcb0bb5fb29755d7eac8a1e79cd --jq '.content' | base64 --decode > "$khedmah_price_script"
printf '%s  %s\n' 'fc1418a5de761e34f45ae4f1bf48d4b3c216344501b3ec4f27420c3f275c846a' "$khedmah_price_script" | sha256sum --check --status

gcloud services enable cloudbilling.googleapis.com \
  --project=khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled

python3 "$khedmah_price_script"
)
```

Successful full read ends with `PREVIEW_SQL_PUBLIC_PRICE_CANDIDATES_READ` and `CANDIDATES_REQUIRE_TIER_AND_UNIT_REVIEW_NOT_A_TOTAL_QUOTE`. Those markers establish retrieval, not a finalized quote. Record the selected SKU IDs, descriptions, effective times and units next, calculate the regional SQL scenario, and add the other explicitly excluded components before deciding the resource plan. The USD catalog does not establish actual billing currency, discounts, tax or existing old-Preview charges.

Validation: Python compilation and 16 local mocked checks passed, including pagination and exact OAuth quota-project scope, no token output, foreign region/commitment/MySQL exclusion, global-price labeling, currency mismatch, preserved units/tiers, wrong project/auth overrides, denial/malformed responses, duplicate SKUs, redirect/path refusal and looping pagination. Bash parsing passed. No live Catalog API success is claimed yet.

## Concrete proposed resource manifest — pending provision/review

Names and settings below are a planning decision for the already created project, not a claim of live resources or an infrastructure apply. Regional resources use `europe-west1`. The new project's SHA-256 is `b299ab462a1e169173551bb6a47c508bcdfb30860f21b551d455cb7704f80e4f`; the numeric namespace is `1044962071847`.

| Resource | Proposed target/settings | Remaining gate |
| --- | --- | --- |
| Terraform state | Bucket `khedmah-preview-v2-20261012-tfstate`, prefix `khedmah/preview-v2/bootstrap`; private, uniform access, versioning | Dedicated new-environment configuration, exact plan, permissions and live-name check |
| Build source | Bucket `khedmah-preview-v2-20261012-cloudbuild-source`; private, regional, reviewed retention | Preview helpers currently use default source staging; explicitly wire this bucket before claiming it is used |
| Artifact Registry | Docker repository `khedmah-preview` | Reviewed cleanup that protects deployed images; initial planning allowance 5 GiB, not a storage cap |
| Cloud SQL | `khedmah-preview-v2-db`, PostgreSQL 16, Enterprise, `db-custom-1-3840` candidate, ZONAL, 10 GiB SSD initially, proposed autoresize limit 20 GiB | Verify regional tier/policy support and price, review exact create plan before incurring recurring capacity |
| SQL recovery/network | Proposed seven automatic backups, PITR seven days, public connector endpoint with no authorized-network allowlist | Confirm exact settings/connection contract; storage/backups continue to cost money independently of application idleness |
| Database/users | DB `khedmah`; separate `khedmah_app` and `khedmah_migrator`, new independent credentials | Runtime role must lack DDL/admin privileges; migration ownership/default grants and login binding must pass fresh catalog checks |
| Initial frontend/backend | `khedmah-pr-274-frontend`, `khedmah-pr-274-backend`; each 1 vCPU/512 MiB candidate, request-based billing, min 0, proposed max 2 and concurrency 20 | Add explicit settings/identity wiring to deployment source and verify health, memory and connection behavior |
| Schema Jobs | Nine existing `khedmah-preview-schema-<stage>` names, one task/parallelism 1, retries 0, explicit migrator identity | Retarget pool pins, adapt all migration consumers and initial apply/verify stages; queue remains serialized |
| Firebase/auth | Add Firebase to this new project; create isolated web config/auth domains | Verify backend auth binding and browser acceptance; Google Cloud project creation alone has not created Firebase configuration |
| Media | Candidate private bucket `khedmah-preview-v2-20261012-media` only after Preview media contract is confirmed | No bucket creation or public access assumed |
| Budget | Project-filtered budget with actual/forecast alerts | Amount and currency after full quote; alerts and service scaling limits are not hard account spending caps |

The Cloud Run helper currently leaves scaling/resource values implicit. These proposed caps must be written and checked, not merely documented. Multiple active PRs can create additional service pairs; initially target PR #274 only. Maximum-instance settings are operational controls, not a guarantee that cost can never exceed an amount.

### Proposed service-account separation

All five IDs below belong only to `khedmah-preview-v2-20261012.iam.gserviceaccount.com`; no keys are proposed.

| Account ID | Intended access boundary |
| --- | --- |
| `khedmah-pv2-deployer` | Scoped Cloud Run deployment, build submission, required metadata reads and actAs only on the four intended execution identities; no project-wide secret payload access |
| `khedmah-pv2-build` | Artifact writes to the new repository, source-bucket reads, logging, and access to the eight frontend build configuration secrets |
| `khedmah-pv2-runtime` | Backend Cloud SQL client and only its bound runtime secrets; media access only if the verified contract needs it |
| `khedmah-pv2-frontend` | Frontend execution identity with no SQL or secret-payload grants by default |
| `khedmah-pv2-migrator` | Cloud SQL client and the new migration-credential secret; restricted SQL migration role |

Required source work is explicit: schema helpers currently select `RUNTIME_SERVICE_ACCOUNT` and `DATABASE_URL`; frontend/backend currently share that identity; build submissions do not select the proposed dedicated build identity; Preview does not pass the proposed source-staging bucket. New identities and secret names alone do not change any of those consumers. Keep the current deployment hold until wiring and focused tests prove separation.

Proposed GitHub WIF pool/provider: `khedmah-preview-github/github-actions`, restricted to repository ID `1307435925`, owner ID `307214577`, the protected `preview` environment and reviewed Preview workflows. Verify actual claim shape and permitted PR refs before encoding trust; do not copy the Production main-only condition or introduce a broad workflow/branch wildcard. Retain independent Staging and canonical Production exclusions.

## Remaining implementation contracts

| Component | Required preparation |
| --- | --- |
| Project/APIs | New isolated project with a verified parent, billing association, required API inventory and quota |
| State | Separate protected state bucket/prefix and explicit new project provider; never reuse the Production Terraform state |
| GitHub trust | New Preview WIF provider and deployer; restrict repository identity, protected `preview` environment and intended PR workflow claims; retain fresh-source checks and reviewers |
| Build | Dedicated verified build identity, Artifact Registry repository, build source/log storage access; inspect actual build identity instead of assuming a default |
| Cloud SQL | New instance/database/users and reviewed runtime/migration privileges, connection name, recovery policy and independent credentials |
| Application | PR-numbered backend/frontend services plus nine bounded schema Job slots; retain serialized mutations, labels, execution-state checks and PR cleanup |
| Secrets/config | New environment-specific database credentials, seven `NEXT_PUBLIC_FIREBASE_*` build values, restricted Maps browser key and dedicated mail credential where required |
| Firebase/auth | Isolated Firebase configuration and authorized test domains; verify backend Firebase binding as well as the frontend build configuration |
| Mail | Preview-only Resend credential and sender verification; metadata read rights for the required reader, payload access only for the identity that needs it; no credential copy from Production |
| Media | Verify Preview's actual storage contract. Provision/bind isolated storage only where the selected acceptance scope needs persistent media; do not claim Staging's media configuration is already applied to Preview |
| Cost controls | Reviewed database sizing, build/image retention, Cloud Run scaling caps and a project-filtered budget/alerts |

Do not execute `infra/iac/bootstrap` as-is: its defaults include Production-oriented account/instance names, a Production workflow/ref, state assumptions and adopted-resource lifecycle rules. A dedicated Preview configuration/plan is required. WIF for pull requests cannot be inferred from the Production main-ref allowlist.

The current nonproduction schema helpers run with `RUNTIME_SERVICE_ACCOUNT` and `DATABASE_URL`. Therefore a newly restricted runtime user may not be able to execute DDL. Resolve migration identity/credential wiring explicitly before provisioning or rollout; do not claim separate migration credentials work without adapting and checking their actual consumers.

## Source changes required before any retargeted deployment

1. `scripts/deployment/preview-schema-job-pool.mjs` pins the old project's SHA-256 and numeric namespace. Replace them only with the verified new identity; preserve rejection of Production, foreign resources and wrong regions. Do not remove the target guard.
2. `scripts/deployment/read-preview-mail-metadata.mjs` also defaults to the old numeric namespace. Update the projected Secret Manager resource validation consistently.
3. `.github/workflows/preview-deployment.yml` currently deliberately exits after metadata diagnostics. Keep that hold during provisioning/configuration work. Releasing it must be a bounded deployment change after the new environment's prerequisites pass.
4. The current `.github/classifieds-preview-stage` is `frontend-on`; its resolver selects Migration 025 **verify**. An empty new database requires the reviewed **apply-025**, then verify and feature-acceptance sequence. Do not start with the old verify-only assumption.
5. Check all active consumers and tests for the old pin/namespace and environment metadata; historical cleanup manifests remain old-target-only and must never be repurposed for the new project.
6. The Preview email resolver accepts an enabled version but the runtime binds `latest`. Verify the exact bound version is enabled and accessible; an arbitrary enabled historical version is insufficient. Provisioning a new project does not establish sender verification or delivery.
7. Keep the independent Staging baseline, source freshness, non-cancelling cloud queue and environment separation gates. Do not bypass them to make replacement deployment green.

### Protected GitHub configuration to reconcile together

| Setting | Target |
| --- | --- |
| `PREVIEW_GOOGLE_CLOUD_PROJECT` | Verified new project ID |
| `PREVIEW_FIREBASE_PROJECT_ID` | Verified new isolated Firebase project |
| `GOOGLE_CLOUD_REGION` | `europe-west1` |
| `PREVIEW_ARTIFACT_REPOSITORY` | New project's reviewed image repository |
| `PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME` | New project's exact regional connection name |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | New Preview WIF provider |
| `GCP_PREVIEW_DEPLOYER_SERVICE_ACCOUNT` | New Preview deployer |
| `GCP_PREVIEW_RUNTIME_SERVICE_ACCOUNT` | New Preview runtime |
| Production identity variables | Retain canonical `khedma-dl` exclusions |
| Development/Staging identities and `STAGING_FRONTEND_URL` | Retain independently verified values |

Validate these under the protected environment with deployment held; do not echo secret values into logs. Do not publish a partially switched environment while an old deployment/cleanup execution can still run.

## Provisioning and acceptance order

1. Completed: prerequisite inventory, permission tests, project creation, billing link/readback and core API activation/readback. Next execute Step 6's catalog activation/public price read, then complete the regional SQL quote and reviewed dedicated infrastructure plan before provisioning runtime capacity.
2. Prepare a deterministic Preview-specific infrastructure plan with exact targets, additions, IAM scope and cost assumptions; ensure no existing environment appears in its mutation set.
3. Provision resources in the already created project in bounded stages. Use verified project number `1044962071847`; read back the regional SQL connection, identities, secret metadata and WIF bindings. Keep provisioning evidence separate from deployment evidence.
4. Configure isolated credentials through secure provider interfaces, then prepare/review the source and protected-variable retargeting together. Old Preview access is not needed to manufacture or extract replacement credentials.
5. Pass meaningful target-isolation, migration and current-source CI checks before the controlled first new-environment rollout. The original Preview's passing tests are historical evidence, not certification of the replacement.
6. Apply/verify the schema on the new database in its governed order. Deploy immutable images and validate backend health, frontend, exact credentialed CORS, authentication/session/logout/authorization, mobile/RTL and module journeys.
7. Verify email delivery with an explicitly selected test recipient before certifying mail readiness. Metadata success alone is not delivery evidence.
8. Record new URLs and acceptance evidence. On partial failure, retain the deployment hold and reconcile the completed stages; do not blind-retry or silently restore access to an old inaccessible target.
9. Retain the existing Production release gates and the old-resource investigation. Any retirement of old resources is a distinct exact-resource decision once legitimate access exists.

## Floot relationship

The existing [migration plan](../floot-migration/MIGRATION-PLAN.md) and [integration gate](../project-control/FLOOT-GOOGLE-INTEGRATION-GATE.md) keep Floot as the experience layer and Google as the API/data authority. This new environment supplies a possible isolated API test target; Floot's own preview URL is a different surface.

A Floot origin still requires an accepted API/auth transport, cookie/session handling, exact CORS/CSRF rules and actual browser verification. Existing Next.js acceptance does not prove Floot acceptance. No Floot app, credentials, domains or Production DNS changes are included in this preparation.

## Dated cost worksheet — partial scenario, not total Preview pricing

Checked on **2026-10-12**. USD list-rate illustration with no free-tier, credits, negotiated discounts or commitments deducted. Free-tier allowances can be shared with the other projects on the same billing account, so a new project is not assumed to receive a fresh independent allowance. The actual billing currency/taxes remain unverified.

| Component | Explicit monthly usage assumption | Verified rate/calculation | Scenario USD |
| --- | --- | --- | ---: |
| Cloud Run services, Belgium Tier 1 | Combined 100,000 billed vCPU-seconds, 60,000 GiB-seconds, 100,000 requests across the two services | `100000 × 0.000024 + 60000 × 0.0000025 + 0.1 × 0.40` | 2.59 |
| Cloud Run Jobs, Belgium Tier 1 | 9,000 billed vCPU-seconds and 4,500 GiB-seconds; include minimum billable execution duration | `9000 × 0.000018 + 4500 × 0.000002` | 0.17 |
| Cloud Build default pool | 1,000 total build minutes on `e2-standard-2`; migrations/rebuilds count too | Belgium default-pool rate `0.006/minute` | 6.00 |
| Artifact Registry | 5 GiB retained for 730 hours | `5 × 730 × 0.000136986`; shared free allowance ignored | 0.50 |
| **Subtotal of only these four components** | Usage assumptions, not limits or measured load | Decimal calculation: `9.260998900`, rounded | **9.26** |

Official sources: [Cloud Run rates and regional tiers](https://cloud.google.com/run/pricing), [Cloud Build Belgium default-pool prices](https://cloud.google.com/build/pricing-update), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing). Private-pool Build rates must not be used for this default-pool assumption. Future builds must explicitly verify the selected machine type; the current source leaves it implicit.

**Not included in USD 9.26:** SQL compute, SSD storage, backups/PITR logs, IP/network charges, other Cloud Storage and operations, Secret Manager, chargeable logs, Firebase/Auth, Maps, mail-provider charges and taxes. It is not a total, approved budget or promise of the eventual bill.

For the proposed PostgreSQL candidate, quote these exact inputs in `europe-west1`: Enterprise, ZONAL, one vCPU, 3.75 GiB memory, PostgreSQL 16, 730 running hours as a full-month assumption, 10 GiB SSD initially (growth allowance up to 20 GiB), seven backups and seven PITR days. Formula: `730 × (regional CPU hourly rate + 3.75 × regional RAM hourly rate) + billed SSD + retained backup/log storage + applicable network/IP`. Backup usage must be estimated from actual retained data; seven backups does not prove a fixed seven-times-disk bill.

The official Cloud SQL pricing page exceeded the retriever's page-size limit; the alternative fetch did not expose usable pricing. Search surfaced shared-core/default prices but did not prove the selected Belgium custom-tier rate. No such number is substituted into this worksheet. Complete an authoritative regional calculator/SKU quote before SQL capacity creation. Core API activation has completed. Step 6's public Catalog API reader is the next concrete route to regional price evidence.

Keep old Preview charges separate. Budget alerts are notifications, not automatic spending caps. New project creation/billing link does not stop charges in the inaccessible old project.

## Sources and validation limits

Source owners reviewed at `44d70ab227eb138554cf75973a28c37a4c9a711c` (executable source unchanged at the newly verified documentation head):
- `.github/workflows/preview-deployment.yml`
- `.github/classifieds-preview-stage`
- `scripts/deployment/preview-schema-job-pool.mjs`
- `scripts/deployment/read-preview-mail-metadata.mjs`
- `scripts/deployment/preview-job-inventory.mjs`
- `scripts/deployment/deploy-cloud-run-environment.sh`
- `scripts/deployment/resolve-classifieds-preview-stage.sh`
- `scripts/deployment/ensure-foundation-nonproduction-schema.sh`
- `scripts/deployment/ensure-classifieds-nonproduction-schema.sh`
- `scripts/deployment/resolve-preview-email-config.sh`
- `cloudbuild.preview.yaml`
- `infra/iac/bootstrap/main.tf` and `variables.tf`
- Preview architecture, Floot migration and API/auth contracts.

Official references reviewed:
- [Project creation](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
- [Project metadata command](https://docs.cloud.google.com/sdk/gcloud/reference/projects/describe)
- [Billing account inventory command](https://docs.cloud.google.com/sdk/gcloud/reference/billing/accounts/list)
- [Billing association permissions](https://docs.cloud.google.com/billing/docs/how-to/modify-project)
- [Billing link command](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/link)
- [Project billing readback](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/describe)
- [Project permission test](https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/testIamPermissions)
- [Organization permission test](https://docs.cloud.google.com/resource-manager/reference/rest/v3/organizations/testIamPermissions)
- [Billing account permission test](https://docs.cloud.google.com/billing/docs/reference/rest/v1/billingAccounts/testIamPermissions)
- [Public catalog guide](https://docs.cloud.google.com/billing/v1/how-tos/catalog-api)
- [Public services and OAuth scopes](https://docs.cloud.google.com/billing/docs/reference/rest/v1/services/list)
- [Public SKUs, pagination, pricing units and OAuth scopes](https://docs.cloud.google.com/billing/docs/reference/rest/v1/services.skus/list)
- [Core API activation](https://docs.cloud.google.com/sdk/gcloud/reference/services/enable)
- [Enabled API inventory](https://docs.cloud.google.com/sdk/gcloud/reference/services/list)
- [Cloud SQL instance settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings)
- [Cloud SQL pricing — regional quote still pending](https://cloud.google.com/sql/pricing)

This checkpoint adds one standalone public-price reader and updates the same five Markdown documents. The reader passed compilation/16 local mocked checks; its launcher passed Bash parsing. New owner-supplied live evidence confirms the core API operation and 18 ENABLED services, including all 13 requested. Earlier billing/helper validation remains recorded separately. The new catalog activation/read, runtime apply, secret/IAM provisioning, workflow dispatch, migration, deployment and email send have not been reported. Existing deployment/billing-helper/test files are unchanged; no live Google action was executed by the assistant.

