# Production Operator Evidence Package

The current Production Operator workflow is a manually dispatched, authentication-only GitHub Actions job. It enters the protected `production` environment, exchanges GitHub OIDC through Google Workload Identity Federation, and runs read-only `gcloud` identity/project verification commands.

No production operation was executed while preparing this package. Live GitHub Environment protection, WIF exchange, IAM, Secret Manager, dry-run, deployment, and rollback evidence remain external gates.

## Deliverables

1. [Runner architecture report](runner-architecture-report.md)
2. [Authentication design](authentication-design.md)
3. [IAM permissions report](iam-permissions-report.md)
4. [Environment protection report](environment-protection-report.md)
5. [Workflow inventory](workflow-inventory.md)
6. [Security report](security-report.md)
7. [Production execution readiness report](production-execution-readiness-report.md)
8. [Remaining blockers](remaining-blockers.md)

## Decision

**PRODUCTION OPERATOR BLOCKED**

The repository-side authentication workflow is implemented and statically validated, but its external authentication result remains unverified until an approved workflow dispatch succeeds. The workflow contains no Cloud Run, Cloud Build, Firebase, Terraform, deployment, rollback, or evidence-collection action.
