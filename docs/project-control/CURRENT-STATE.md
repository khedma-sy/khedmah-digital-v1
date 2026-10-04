# Khedmah Digital — Current State

Updated: 2026-10-04

## Authority
- Repository: `khedma-sy/khedmah-digital-v1`
- Production GCP project: `khedma-dl`
- Approved region: `europe-west1`
- Protected main: `5a961be5035dce1197ba2d0c65519e86f65ca4c6`
- Current main origin: merged PR #248, canonical Production deployer guard.

## Current critical production state
Latest Production Database Role Bootstrap run:
- Run: `37183178537`
- Requested mode: `PREPARE`
- Requested confirmation matched main.
- Canonical deployer identity guard: passed.
- Secret readiness: passed.
- Immutable bootstrap image build: passed.
- Failure point: `Classify resumable prepare role state`
- Error: `Cloud SQL database role state is not a resumable PREPARE state.`

All subsequent mutation steps were skipped, including password rotation, PREPARE execution, runtime cutover, Cloud SQL restart/containment, migration role replacement, final password rotation, isolation verification, and active-alias commit.

### Interpretation
This is a fail-closed pre-mutation failure. Do not retry PREPARE until the actual Cloud SQL user databaseRoles state is read and reconciled with the workflow's allowed state machine.

## Recent proven good state
- PR #248 merged to main.
- INVENTORY run `37179237640` succeeded on current main.
- Canonical deployer guard passed.
- Previous approved system-role manifest:
  `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`
- Terraform bootstrap is zero-drift and must not be re-applied casually.
- PITR is enabled and an on-demand backup was proven successful earlier.

## Open PR disposition
- #247: older deployer-guard implementation, based on pre-#248 main. Treat as superseded candidate; do not merge without explicit reconciliation.
- #172: old draft AI-admin control plane based on develop and heavily diverged from current main. Do not merge or rebase blindly; salvage by feature-level review only if still wanted.

## Operating rule
GitHub live state is the source of truth. Conversation text and dated handoff files are supporting evidence only and must not override a newer main SHA, workflow result, or live Production observation.

## Read-only diagnosis progress
Historical workflow review found no earlier PREPARE before run `37183178537`. Earlier runs on this workflow were INVENTORY, VERIFY, and REPAIR_MIGRATION_SECRET. Therefore the invalid classifier state is not explained by a previous PREPARE attempt in the reviewed GitHub Actions history.

Run `37183178537` also proved before failure that:
- exactly three Cloud SQL users were present: `postgres`, `khedmah_app`, and `khedmah_migrator`;
- all three were reported as `BUILT_IN`;
- the failure occurred only when classifying the runtime and migration users' `databaseRoles`.

The repository's original user-creation script creates the runtime and migration built-in users without an explicit `--database-roles` argument. Current Google Cloud documentation states such built-in PostgreSQL users are automatically granted `cloudsqlsuperuser`. The live API response still must be inspected because the classifier uses the exact `databaseRoles` field and will reject omitted, empty, multi-role, or otherwise unexpected shapes.

## Immediate next action
Perform one read-only live Cloud SQL query and capture the API-reported role lists:

`gcloud sql users list --instance=khedmah-v1-db --project=khedma-dl --format='table(name,type,databaseRoles)'`

Then:
1. Map `khedmah_app` and `khedmah_migrator` to the intended state-machine states.
2. If the live state is valid but represented differently than the classifier expects, fix the classifier + regression tests on a branch.
3. If the live state shows unexpected/custom/multiple privileges, stop and investigate provenance before any mutation.
4. Do not retry PREPARE until this is resolved.


## Live Cloud SQL role metadata result — 2026-10-04
Read-only Cloud Shell evidence:

```text
khedmah_app      BUILT_IN   databaseRoles: empty
khedmah_migrator BUILT_IN   databaseRoles: empty
postgres          BUILT_IN   databaseRoles: empty
```

This explains why PREPARE run `37183178537` failed at the old metadata-only classifier: it expected explicit `["cloudsqlsuperuser"]` or the custom role. Google Cloud documents that newly created built-in PostgreSQL users receive `cloudsqlsuperuser` automatically when no explicit database roles are supplied, while the API also supports explicitly revoking all roles. Therefore an empty metadata field is ambiguous and must not be treated as either superuser or zero-role state without a live PostgreSQL membership probe.

Draft PR #250 (`fix/database-role-prep-state-probe-2026-10-04`) is the active remediation. It moves PREPARE state classification to a read-only PostgreSQL membership probe and is being hardened to preserve resume behavior by trying enabled migration-secret versions without changing database roles/passwords.

## Mobile-only operating mode
The user is temporarily following from mobile and cannot execute Cloud Shell commands.

Rules until the user explicitly says they are back at a computer:
- Do not request Cloud Shell execution.
- Do not dispatch PREPARE, HARDEN, migrations, Terraform APPLY, or Production deploy.
- Continue GitHub-only work: code review, CI diagnosis, tests, documentation, PR hygiene, and non-production planning.
- Queue any necessary Google Cloud read-only commands under **Queued Cloud Shell Actions** instead of asking for immediate execution.

## Queued Cloud Shell Actions
None currently required. The previous role metadata query has already been completed and its result is recorded above.

## Immediate next safe action
Finish PR #250 through CI/review only. Do not merge or run PREPARE until the PostgreSQL-backed classifier is proven by tests and reviewed for resumability and fail-closed behavior.
