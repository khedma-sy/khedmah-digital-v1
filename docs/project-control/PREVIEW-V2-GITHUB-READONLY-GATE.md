# Preview V2 GitHub Actions read-only gate — authorization boundary

## Proposed read-only Monitoring diagnostic — 2026-11-02 (source-only; NOT dispatched)

A follow-up source change proposes using the **already dedicated** protected-main `preview-v2-readonly-release-gate.yml` identity to run the existing `scripts/read-preview-v2-instance-metric-evidence.py --inspect` after its fixed Cloud Run inventory. This adds only `GET` reads of Cloud Monitoring metric/resource descriptors and exact-revision/service-wide time-series; no IAM write, SQL session read, scaling, traffic, revision, migration, or deployment operation is added.

**Access preflight:** the read-only WIF account has verified Cloud Run inventory access, **not verified Cloud Monitoring read permissions**. Do **not** infer `monitoring.metricDescriptors.get`, `monitoring.monitoredResourceDescriptors.get` or `monitoring.timeSeries.list` from its last successful run. Without sufficient read permissions the diagnostic fails closed with `STOP: MONITORING_PERMISSION_DENIED`; do **not** grant privileges or broaden the existing federated trust merely to make the run green. Any IAM expansion requires separate review and explicit authorization.

The inspector emits `instance_zero_point_observed_after_boundary` and `service_zero_point_observed_after_boundary` for **metric-only observations**. It always emits `writer_quiescence_verified=false`, `database_checked=false`, `release_authorized=false` and `cloud_mutation_performed=false`, even if an explicit zero is observed. If Monitoring returns no time series, the absence is not evidence of zero. An authorized owner must separately establish Cloud Run manual zero, zero tags and fresh database-writer/session evidence before considering an independently reviewed release procedure. Do not replay writer-fence scaling to create telemetry.

**Do not dispatch this revised workflow while the source change is pending review and merge.** After any authorized read-only execution, validate its exact main SHA and recorded status; a successful read-only workflow is *not* a release gate approval.


**Status (2026-10-24): SOURCE PREPARED, LIVE DISPATCH BLOCKED.** This note applies to PR #314. It is not evidence that GitHub can currently authenticate to Google Cloud or that a Preview/Production release is approved.

## Exact source and target

- Proposed workflow: `.github/workflows/preview-v2-readonly-release-gate.yml`.
- Only manual `workflow_dispatch`, from the protected `main` workflow after normal merge.
- Exact Preview project ID: `khedmah-preview-v2-20261012`; project **number**: `1044962071847` (Cloud Run v1 `metadata.namespace`).
- Region: `europe-west1`; service: `khedmah-pr-274-backend`.
- Read-only commands: `gcloud run services describe` and `gcloud run revisions list`. No database access is provided by this workflow.
- Output is bounded metadata only. A successful report always has `writer_quiescence_verified=false`, `database_checked=false`, `release_authorized=false`.

## Hard external blocker: historical Workload Identity Federation

The existing `PREVIEW_V2_WORKLOAD_IDENTITY_PROVIDER` is intentionally restricted to GitHub `pull_request` on `refs/pull/274/merge` running `preview-deployment.yml`. It **cannot** authenticate a new `workflow_dispatch` workflow. Do not change its provider condition, impersonate PR274, or reuse its deployer service account.

PR314 requires **separately reviewed and provisioned** GitHub environment variables:

- `PREVIEW_V2_READONLY_WORKLOAD_IDENTITY_PROVIDER`: a **different** dedicated WIF provider in project number `1044962071847`.
- `PREVIEW_V2_READONLY_SERVICE_ACCOUNT`: a **different** dedicated read-only service account in `khedmah-preview-v2-20261012`.

These variables do not exist in the verified source configuration and **are not provisioned by this PR**. When absent, the first job step fails before Cloud authentication. Do not make the gate green by setting these to the historical deployer values.

### Conditions to verify before provisioning (owner/IAM review required)

The dedicated provider trust must require, conjunctively and without wildcards:

- GitHub repository ID `1307435925` and repository owner ID `307214577`;
- `repository == 'khedma-sy/khedmah-digital-v1'`;
- `event_name == 'workflow_dispatch'`;
- `ref == 'refs/heads/main'`;
- `workflow_ref == 'khedma-sy/khedmah-digital-v1/.github/workflows/preview-v2-readonly-release-gate.yml@refs/heads/main'`;
- `environment == 'preview'`.

Review the provider mapping, allowed audience, exact service-account impersonation grant and effective read-only IAM permissions. The proposed identity must have only the Cloud Run service-get/revisions-list permissions and any unavoidable read-only dependency; no `run.services.update`, Cloud SQL secret access, Cloud Build submit, Artifact Registry push, traffic/scaling or IAM write permission. Validate principal-set and role grants explicitly before enabling the workflow. External IAM changes require **separate explicit approval** and cannot be inferred from this source PR.

## Source and live gates are independent

1. Obtain exact-head Node.js CI, Test & Verify, PR Preview, branch-protection and review-thread acceptance for PR314. Do not merge an unresolved P1.
2. Provision the separate WIF/reader identity only after explicit owner permission for exact IAM operations, external to this source-only PR.
3. Review PR314 and merge normally; require resulting-main push workflows to pass.
4. Dispatch the manual read-only workflow only after confirming trust and credentials. Read the report and independently check it against the reviewed Cloud Run identity.
5. For the **full** successor gate use the pinned owner inspector documented in `NEXT-ACTION.md`; the lightweight GitHub workflow does **not** inspect database writer sessions, effective seven-permission policy or existing saved build provenance.
6. **STOP** before Preview writer-fence scaling, migrations 036/037, deployments, Firebase Messaging activation, Taxi enablement, Floot publication or Production. Their approval gates remain independent.

Preserve existing candidate build `8b1b7aee-67f3-4721-ae76-f4bb60b4dc5e` and immutable backend image digest `sha256:2146d382d426568a510b6e76ff06129934e84beb86bc81c348454fe3e29e260e`. No rebuild/resubmission.
