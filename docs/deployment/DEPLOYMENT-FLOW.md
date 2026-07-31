# Deployment and Release Flow

`Development → Pull Request Preview → Owner approval → develop → Staging → production certification`

Preview and Staging are non-production. Preview is ephemeral per PR; Staging is stable and production-like. Both use immutable images and distinct cloud/Firebase identities. Production is governed by the separate production readiness and live certification package and is never targeted by Preview/Staging scripts.

## GitHub Actions summary

- `preview-deployment.yml`: PR gates, PR-scoped deployment, health checks, screenshots, owner comment, close cleanup.
- `staging-deployment.yml`: approved-branch gates, stable Staging deployment, health and deployment summary.
- `test-and-verify.yml`: existing repository verification retained.
- `google-production-readiness.yml`: existing protected production gate retained and not invoked by this mission.
