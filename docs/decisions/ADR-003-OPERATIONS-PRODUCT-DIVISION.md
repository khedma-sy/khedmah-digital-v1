# ADR-003: Operations Product Division

- **Status:** Approved by the Board directive supplied with the implementation mission.
- **Decision:** Add Operations Product as the platform-owned infrastructure and production-operations division.
- **Authority boundary:** Existing Board, Executive, and Codex authority is unchanged. Operations roles grant scoped technical permissions only.
- **Architecture:** A NestJS module exposes additive admin endpoints; environment-backed RBAC is deny-by-default; change commands create auditable approval requests instead of bypassing governance. The Arabic-first admin dashboard is additive.
- **Data:** No database or migration is required for this delivery. The repository boundary is replaceable by the approved durable audit/change store before horizontally scaled production activation.
- **Security:** No credentials, secret values, OAuth tokens, notification tokens, or user locations are persisted or logged.
- **Rollback:** Remove the module import and administrative navigation entry; existing public routes and business behavior remain independent.
