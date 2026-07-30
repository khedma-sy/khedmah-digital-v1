# RBAC Certification Report — 2026-07-30

## Certification result

**Implementation RBAC: PASS. Production assignments: PENDING EXTERNAL EVIDENCE.** All eight Operations Product roles have explicit mappings. Missing bindings, malformed roles, unknown roles and insufficient permissions fail closed. Operations roles contain no Board, Executive or Codex authority and cannot modify those authority models.

| Role | Certified scope |
|---|---|
| Operations Product Director | Operations permissions only; no governance-authority inheritance |
| Infrastructure Manager | Read, infrastructure, deployment |
| Cloud Administrator | Read, infrastructure, security |
| DevOps Engineer | Read, deployment, release |
| Production Engineer | Read, deployment, incident |
| Release Manager | Read, release |
| Security Operations Engineer | Read, security, incident |
| SRE | Read, deployment, incident |

Production certification additionally requires a reviewed `OPERATIONS_PRODUCT_ROLE_BINDINGS` value, separation-of-duties review, access-review export, and negative endpoint tests against real production identities. Role bindings remain runtime-only and are CI-gated.
