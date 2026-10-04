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
