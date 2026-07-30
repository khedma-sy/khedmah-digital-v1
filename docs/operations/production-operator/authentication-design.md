# Authentication Design

## GitHub to Google

`production_operator.tf` declares a Google Workload Identity Pool/provider using `https://token.actions.githubusercontent.com`. Trust requires all three claims:

- repository equals the approved `owner/name` input;
- ref equals `refs/heads/main`;
- `job_workflow_ref` equals `.github/workflows/production-operator.yml@refs/heads/main` in that repository.

The matching repository principal receives only `roles/iam.workloadIdentityUser` on the existing deployer service account. `google-github-actions/auth@v2` exchanges the short-lived GitHub OIDC token and creates an ephemeral credential file on the runner. No service-account key, credential JSON, or refresh token is committed.

## Scope boundary

Firebase CLI, GitHub CLI, Terraform, Cloud Build, and Cloud Run are not invoked. This workflow tests only GitHub Environment → OIDC → Google Cloud authentication and approved project visibility.

## Fail-closed checks

GitHub blocks the job when required Production Environment secrets are unavailable or an approval gate is not satisfied. Google authentication or project access failure makes one of the three required `gcloud` commands fail the job.

## Current evidence

OIDC resources and workflow authentication are declared and statically validated. A successful live token exchange is **NOT VERIFIED** until the protected workflow dispatch runs.
