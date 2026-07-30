# Workflow Inventory

| Workflow | Trigger/environment | Purpose | Mutation boundary | Evidence |
|---|---|---|---|---|
| `production-operator.yml` | Manual; `production` | GitHub OIDC to Google authentication test | Read-only identity/project commands; no deployment | GitHub run log and `gcloud` verification output |
| `google-production-readiness.yml` | PR or manual; manual gate uses `production` | Repository and protected configuration/Android/Web validation | Does not deploy | GitHub job result |
| `preview-deployment.yml` | PR; `preview` | PR-scoped build/deploy/review/cleanup | Preview project only | Preview URL, health, screenshots, comment |
| `staging-deployment.yml` | `develop`; `staging` | Production-like Staging build/deploy | Staging project only | Job summary, revisions, health |

## Production operation sequence

1. Enter the GitHub `production` environment after any configured approval gate.
2. Exchange GitHub OIDC using the protected WIF provider and deployer service-account identifiers.
3. Install Google Cloud CLI.
4. List the active Google identity, show the configured project, and describe the approved project variable.
5. Stop without deployment or infrastructure mutation.

No operation was dispatched during this mission.
