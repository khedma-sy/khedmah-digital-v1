# Environment Protection Report

## Required GitHub configuration

| Environment | Required protection |
|---|---|
| `preview` | Isolated Preview variables/secrets and Preview deployer identity. |
| `staging` | Isolated Staging variables/secrets and Staging deployer identity. |
| `production` | Authorized required reviewers, protected/custom branch policy, production-only variables/secrets, and no bypass for ordinary operators. |

The operator job references `environment: production`, so configured GitHub protection must complete before the job receives the two environment secrets used for WIF authentication. The workflow itself has only `contents: read` and `id-token: write`.

## Required configuration ownership

Repository code cannot safely appoint its own reviewers or create/bypass its own protection gate. A GitHub repository administrator, acting under Board authority, must configure these settings outside the workflow. The reviewer must be independent of the requesting operator according to the approved separation-of-duties policy.

## Production environment contract

Metadata variables: `GOOGLE_CLOUD_PROJECT`.

Protected values: `GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER` and `OPERATIONS_DEPLOYER_SERVICE_ACCOUNT`. They are passed directly to `google-github-actions/auth`; no credential JSON is stored.

## Current evidence

Workflow references and current-deployment validation exist. Actual environment configuration, reviewer assignments, branch policy, secret availability, approval execution, and administrator audit export are **NOT VERIFIED** until supplied by the repository administrator and corroborated by a gated run.
