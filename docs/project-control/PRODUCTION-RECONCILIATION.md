# Production reconciliation — evidence before an operation

Reviewed source: `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`, 2026-10-05. Read live refs and run status again before using this checklist. Source review does not establish live cloud state or authorize a mutation.

## Target and historical anchor

- Repository: `khedma-sy/khedmah-digital-v1`.
- Explicit Production project: `khedma-dl`; approved region: `europe-west1`; instance: `khedmah-v1-db`.
- Canonical federated workflow deployer: `khedmah-v1-deployer@khedma-dl.iam.gserviceaccount.com`. The owner's interactive Cloud Shell account is a separate identity.
- Latest successful GitHub inventory observed: [run 37179237640](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37179237640), old source `5a961be5035dce1197ba2d0c65519e86f65ca4c6`, [job 111368235212](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/37179237640/job/111368235212), execution `khedmah-database-role-inventory-s7pck` on 2026-10-04.
- Previously recorded approved manifest: `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`. It must be compared with execution-specific records and the current reviewed protected value; copying it from this document is not revalidation.

## First command

Run only this metadata query in the authorized Cloud Shell session, then review the output before constructing the next command:

```bash
gcloud run jobs executions list --job=khedmah-database-role-inventory --project=khedma-dl --region=europe-west1 --limit=5 --sort-by='~metadata.creationTimestamp' --format='table(metadata.name,status.startTime,status.completionTime,status.succeededCount,status.failedCount)'
```

Expected output is a short execution table. A newer execution, a failed execution, an empty result or a permissions error must be investigated, not silently replaced by the old anchor. If selected columns are absent, inspect the command's returned metadata shape before assuming success. Do not repeat the earlier Cloud SQL users table as proof of memberships.

The command and job/region/sort/limit flags were checked against the [official gcloud executions-list reference](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/executions/list). This documentation check is not a successful query of the owner's project.

No new execution is created by this list command. Subsequent log reads must target the selected exact execution and allow only the canonical `DATABASE_SYSTEM_ROLE_MANIFEST_RECORD=` and `DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=` data needed for review. Verify record completeness and independently recompute the digest. Do not expose secret payloads, full environment dumps or unrelated logs.

## Gate matrix

| Gate | Source-enforced behavior | Current evidence still required |
| --- | --- | --- |
| Source | Role workflow locks requested SHA, checkout and fetched main; validates project/region inputs | Live main, exact checks, operation mode, applicable approval and environment protection evidence |
| Scope | Role workflow rejects regions other than `europe-west1` and checks the SQL target | Current project/region/instance identity; concurrent or out-of-band operation review |
| Deployer | Canonical active account checked; build and migration SAs must exist | Current effective IAM and service-account attachment scopes; actual audit principal. Metadata existence is insufficient |
| Manifest | Digest syntax validated early; actual digest compared later by the SQL runner | Complete canonical records from the selected execution, independent digest and reviewed protected-value comparison; no unexplained change since collection |
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

For each meaningful observation retain timestamp, source SHA where relevant, exact project/region/resource/run/execution, selected non-secret result, its limits and the next dependency. Failed or missing access leaves the gate open. Current workspace access covers GitHub and local source, not the owner's Cloud Shell session.

No mutation command or old-SHA confirmation is queued by this document. Once cloud reconciliation is complete, select and review one concrete operation using its current code, backup and confirmation requirements.
