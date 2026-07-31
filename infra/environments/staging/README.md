# Staging environment

Staging uses dedicated Google Cloud and Firebase projects, Artifact Registry, service accounts, Secret Manager values, Cloud Run services, and GitHub `staging` environment. It is production-like but contains test-only data and no production credentials. Pushes to the approved `develop` branch pass all quality gates before automatic redeployment. Cloud Run revisions retain deployment history and allow explicit rollback.
