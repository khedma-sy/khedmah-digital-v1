# Production Operator Security Report

## Repository controls verified

- GitHub OIDC permission is explicit and other workflow permissions are read-only.
- WIF trust is restricted by repository, `main`, and immutable workflow path/ref.
- No service-account key or protected Firebase/Google credential JSON is tracked.
- The workflow receives only the WIF provider and service-account identifiers as protected secrets.
- Verification is limited to active authentication, configured project, and approved-project metadata.
- No Cloud Run, Cloud Build, Firebase, Terraform, Secret Manager, rollback, or deployment command is present.

## Tests required in the protected environment

1. Successful OIDC exchange from approved workflow/main.
2. Rejection from another branch/repository/workflow.
3. Successful description of the approved `GOOGLE_CLOUD_PROJECT` and rejection of an unauthorized project.
4. Required-reviewer approval and rejection/cancellation audit.

## Current evidence

Static workflow controls pass locally. OIDC exchange, project access, and approval behavior are **NOT VERIFIED** live.
