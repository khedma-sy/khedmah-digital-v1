# Live IAM Validation Report

- **Repository validation:** Runtime/deployer identities are separate; runtime Secret Manager grants are per-secret; Operations Product RBAC remains deny-by-default.
- **Runtime validation:** Not executed because the approved project and active Google identity were absent.
- **External evidence required:** redacted IAM role/member-count summary, enabled state for both service accounts, zero user-managed keys, per-secret policy verification, Workload Identity/Cloud Build identity evidence and production RBAC access review.
- **Result:** Pending live validation.

Any unexpected owner/editor grant, user-managed service-account key, project-wide runtime secret access, unknown Operations Product binding, or Board/Executive/Codex authority inheritance fails certification.
