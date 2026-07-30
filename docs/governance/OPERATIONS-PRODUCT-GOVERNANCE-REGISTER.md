# Operations Product Governance Register

| Record | Authority | Scope | Audit/approval | Status |
|---|---|---|---|---|
| OP-001 | Board directive | Establish Operations Product | [ADR-003](../decisions/ADR-003-OPERATIONS-PRODUCT-DIVISION.md) | Approved |
| OP-002 | Existing release governance | Infrastructure changes | Actor, action, resource, reason, request/correlation; pending approval | Enforced by module boundary |
| OP-003 | Existing security governance | Eight scoped operations roles | Deny-by-default mapping and periodic access review | Enforced by RBAC |

Decision and governance records do not convey Board or Executive authority to an Operations Product role. Change and rollback requests remain pending until the existing release/change authority approves them. Runtime audit events are `operations.change.requested`, `operations.rollback.requested`, and `operations.incident.created`.
