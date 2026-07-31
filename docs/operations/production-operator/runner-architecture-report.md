# Runner Architecture Report

## Architecture

```text
Authorized operator
  -> workflow_dispatch on main + change ticket
  -> GitHub production Environment required-reviewer gate
  -> ephemeral ubuntu-latest production-operator job
  -> GitHub OIDC token
  -> restricted Google WIF provider
  -> existing production deployer service account
  -> gcloud identity and project verification only
  -> metadata-only audit artifact + GitHub run log
```

The workflow uses `workflow_dispatch` only, the protected `production` environment, `contents: read`, and `id-token: write`. It authenticates with the two protected WIF/service-account secrets, installs the Google Cloud CLI, and runs only `gcloud auth list`, `gcloud config list project`, and `gcloud projects describe`. It has no mutation input or deployment command.

## Environment separation

The operator consumes only variables/secrets attached to the GitHub `production` environment. Preview and Staging retain their existing workflows and identities. The preflight requires the approved production project, Firebase project, region, service accounts, Artifact Registry, and Cloud Run service identifiers; the WIF condition permits only this repository, `main`, and this workflow file.

## Audit trail

GitHub records the dispatcher, environment review, commit, run, logs, and conclusion. The read-only `gcloud` output is the authentication evidence. The workflow creates no artifact and prints no secret value.

## Current evidence

Repository contract validation is available. A live runner execution and approval audit are **NOT VERIFIED**.
