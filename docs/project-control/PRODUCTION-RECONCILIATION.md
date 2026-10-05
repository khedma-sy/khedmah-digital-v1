# Production reconciliation — evidence before an operation

Checkpoint: 2026-10-05; protected main `e61d1142c3aa9d03ae63798b6b0987bc799a879d` after merged #252, merge commit timestamp `08:30:08 UTC`. Accepted #252 source gates, main's own Node/Test (2442 tests, audit zero) and Preview cleanup passed. The reviewed database-role workflow/runner are unchanged from `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`; separate live-secret alignment implementation `4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f` is included in this reviewed candidate and awaits its own head gates. Read live refs and run status before an operation. Source review and the completed owner reads below do not authorize a mutation.

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

There is also a separate source blocker: accepted #252 head `01f1a9e934b130fee613e8f65cb55743a615b333`, now inherited by main `e61d1142...`, has [a live-secret validator](../../scripts/validate-production-live-secret-certification.sh) expecting two direct migration-secret bindings, while Terraform declares the three observed bindings. The omitted AliasManager role's live definition matches the declared permissions. Implementation `4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f` aligns that expectation; 59 offline/local cases passed and two independent reviews reported no blockers. The candidate branch requires its own exact-head CI/Preview. [Exact source and validation scope](CURRENT-STATE.md#live-secret-certification-alignment--reviewed-candidate) do not replace inherited/effective-access evidence or authorize removing the canonical live binding.

## First command

The first unresolved read is now **metadata for both historical service accounts**. The owner has already received the reviewed one-line command below; its output is pending. Both custom-role reads are complete. Review the next result before constructing another command:

```bash
gcloud iam service-accounts list --project=khedma-dl --filter='email=khedma-v1-deployer@khedma-dl.iam.gserviceaccount.com OR email=khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com' --format='json(email,uniqueId,disabled)'
```

The filter targets `khedma-v1-deployer` and `khedma-v1-runtime`, the historical missing-`h` identities observed in project IAM. Validate each returned email against the exact intended identities before accepting it as evidence. Retain the returned email, unique ID and disabled-state metadata exactly, including absent fields. This does not read keys or secret payloads. Account existence/disabled state alone cannot establish active use, complete effective access or retirement readiness; an empty/failed result is not authorization to remove IAM bindings.

After this result, select one bounded read for remaining custom-role definitions/effective access and historical identity usage, then continue through secret aliases/version states, backup/PITR/recovery, actual PostgreSQL membership and installed schema evidence. Do not print secret payloads, full environment dumps or unrelated logs. No new Cloud Run execution is created by the command above.

## Gate matrix

| Gate | Source-enforced behavior | Current evidence still required |
| --- | --- | --- |
| Source | Role workflow locks requested SHA, checkout and fetched main; validates project/region inputs | Live main, exact checks, operation mode, applicable approval and environment protection evidence |
| Scope | Role workflow rejects regions other than `europe-west1` and checks the SQL target | Current project/region/instance identity; concurrent or out-of-band operation review |
| Deployer | Canonical active account checked; build and migration SAs must exist | Three direct secret bindings, returned project IAM and AliasManager/CloudAssetPolicyAnalyzer definitions reviewed. Historical deployer/runtime metadata output is pending; remaining role/effective permissions, historical project-level access/usage, service-account attachment scopes and actual audit principal remain unverified |
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
