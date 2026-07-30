# Deployment Validation Report — 2026-07-30

## Executed evidence

| Stage | Result | Duration | Notes |
|---|---|---:|---|
| Workspace production build | Pass | 60 seconds | Backend TypeScript and Next.js production build completed. |
| Workspace automated tests | Pass | Recorded by test command | No regression in workspace tests. |
| Cloud Build submit | Not executed | N/A | `gcloud`, authenticated production project, deployer identity and project values were unavailable. |
| Cloud Run deploy/redeploy | Not executed | N/A | Requires successful authenticated Cloud Build. |
| Cloud Run rollback | Not executed | N/A | No production revision was available to receive traffic. |

`cloudbuild.production.yaml` now builds, pushes and deploys both images. `google-production-deploy.sh` runs both readiness gates before submission. `google-production-rollback.sh` validates service/revision names, moves 100% traffic to an explicit prior revision, then reports the ready revision.

**Result: deployment certification is blocked.** Build success is not a substitute for a live deploy/rollback/redeploy drill. Record build ID, revision IDs, start/end timestamps, health evidence and observed issues in this report after executing the runbook with approved credentials.
