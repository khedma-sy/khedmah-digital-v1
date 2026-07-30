# Remaining Blockers

| Blocker | Required owner | Closure evidence |
|---|---|---|
| GitHub `production` Environment and any required reviewer gate are not externally verified | GitHub Repository Administrator | Protected workflow run showing the environment gate completed. |
| `GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER` secret is not externally verified | Cloud Administrator | Successful `google-github-actions/auth` step. |
| `OPERATIONS_DEPLOYER_SERVICE_ACCOUNT` secret is not externally verified | Cloud Administrator | Active federated identity shown by `gcloud auth list`. |
| WIF trust and `roles/iam.workloadIdentityUser` binding are not externally verified | Security Operations Engineer | Successful OIDC exchange from this workflow and rejected unauthorized exchange. |
| `GOOGLE_CLOUD_PROJECT` variable and deployer access are not externally verified | Cloud Administrator | Successful `gcloud config list project` and `gcloud projects describe` output for the approved project. |

The workflow contains no deployment operation. Authentication must succeed before any separately governed production workflow can be considered.
