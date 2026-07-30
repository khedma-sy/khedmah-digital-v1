# IAM Permissions Report

## Declared permissions

| Identity | Scope | Permission/role | Purpose |
|---|---|---|---|
| GitHub repository principal | Deployer service account | `roles/iam.workloadIdentityUser` | Short-lived impersonation from the restricted workflow only. |
| Existing deployer account | Project | `roles/run.admin` | Deploy and direct Cloud Run revisions/traffic. |
| Existing deployer account | Project | `roles/cloudbuild.builds.editor` | Submit and inspect Cloud Build executions; this service-specific Editor role is justified because Google exposes build submission/cancellation through it. |
| Existing deployer account | Project | `roles/artifactregistry.writer` | Push build artifacts. |
| Existing deployer account | Project | `roles/iam.serviceAccountUser` | Attach the runtime identity during deployment. |
| Existing deployer account | Project | `roles/logging.logWriter` | Emit build/deployment logs. |
| Existing deployer account | Project | `roles/firebase.viewer` | Validate Firebase project metadata without mutation. |
| Existing deployer account | Project | `roles/iam.securityReviewer`, `roles/iam.serviceAccountViewer` | Read effective IAM and key metadata for fail-closed security checks. |
| Existing deployer account | Project | `roles/logging.viewer`, `roles/monitoring.viewer` | Validate redacted operational signals and alert-policy metadata. |
| Existing deployer account | Project | `roles/secretmanager.viewer` | Verify secret names, versions, and IAM metadata without payload access. |
| Runtime account | Individual named secrets | `roles/secretmanager.secretAccessor` | Read only the runtime secret set. |

No primitive `roles/owner` or `roles/editor` is declared. The live validator fails if either primitive role is found on the deployer and fails if either production service account has a user-managed key. It also verifies runtime accessor bindings on each approved runtime secret without accessing payloads.

## Least-privilege review boundary

Project-scoped Artifact Registry writer and service-account user are inherited from the approved IaC and must be reviewed against the live project. Where Google supports the existing deployment path, the operator review should narrow Artifact Registry access to the named repository and service-account use to the named runtime account before readiness approval. This mission does not silently alter approved production roles.

## Current evidence

Declared role inventory passes repository review. Effective live IAM policy, negative permission tests, and scoped-role review are **NOT VERIFIED**.
