# Tests

Mission 007 initializes the platform foundation test structure.

## Canonical Test Command

Run `npm test` or its explicit alias `npm run test:all` before every pull request merge. Both commands execute the same canonical orchestration path:

1. Root repository tests through `npm run test:root`.
2. Backend workspace tests through the backend workspace `test` script.
3. Frontend workspace tests through the frontend workspace `test` script.

The orchestrator runs all three targets even when an earlier target fails, reports every failing target, and exits unsuccessfully if any target fails. `npm run test:root` and `npm run test:workspaces` remain available for focused diagnosis, but neither is evidence of complete repository health on its own.

## Coverage

Included:

- Static platform foundation verification.
- Backend health endpoint contract verification.
- Frontend Arabic-first RTL foundation verification.
- Infrastructure/database preparation-only verification.

Mission 069D changes test orchestration only. It does not remove tests, weaken assertions, change product behavior, or introduce product features.
