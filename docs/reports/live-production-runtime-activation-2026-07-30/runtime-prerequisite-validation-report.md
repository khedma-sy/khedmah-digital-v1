# Runtime Prerequisite Validation Report

## Result

**FAILED — mandatory dependencies missing. Production activation stopped at Phase 1.**

| Required prerequisite | Result | Objective evidence |
|---|---|---|
| Google Cloud Project | **NOT VERIFIED** | `GOOGLE_CLOUD_PROJECT` was absent. |
| Firebase Project | **NOT VERIFIED** | `FIREBASE_PROJECT_ID` was absent. |
| Google Cloud region | **NOT VERIFIED** | `GOOGLE_CLOUD_REGION` was absent. |
| Cloud Run services | **NOT VERIFIED** | Backend/Frontend service identifiers were absent and `gcloud` was unavailable. |
| Cloud Build | **NOT VERIFIED** | `gcloud` was unavailable; no build query could run. |
| Artifact Registry | **NOT VERIFIED** | Repository identifier was absent and `gcloud` was unavailable. |
| Secret Manager | **NOT VERIFIED** | Project/identity and `gcloud` were unavailable; no secret metadata or payload was accessed. |
| Runtime service account | **NOT VERIFIED** | Approved runtime account identifier was absent. |
| Deployer service account | **NOT VERIFIED** | Approved deployer account identifier was absent. |
| Workload Identity Federation | **NOT VERIFIED** | GitHub CLI, Git remote, GitHub authentication, and Google authentication were unavailable. |
| Required GitHub Actions secrets | **NOT VERIFIED** | GitHub CLI/authentication and remote repository access were unavailable. |
| Required GitHub Environments | **NOT VERIFIED** | GitHub CLI/authentication and remote repository access were unavailable. |
| Production approval flag | **NOT VERIFIED** | `OPERATIONS_APPROVED_PRODUCTION` was absent. |

## Preflight command evidence

The non-secret preflight used `command -v` for tool names and shell presence tests (`[ -n "${!name:-}" ]`) for environment variables. Values were never printed. Missing dependencies were `gcloud`, Firebase CLI, GitHub CLI, Terraform, and all nine required activation variables listed in the evidence index.

## Gate decision

The mission requires immediate failure when any production dependency is missing. Because multiple P0 dependencies were missing, Phases 2–8 were not started. Installing tooling alone would not authorize execution: an approved production identity, explicit approval flag, project/service identifiers, protected secret access, and external evidence channel are also mandatory.
