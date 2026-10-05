# Next Safe Action — Khedmah

Snapshot: 2026-10-05. Re-read live refs and run status before acting. This is an execution dependency, not a Production mutation approval.

## Completed source prerequisite

PR #250 is merged into protected main `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`. The final PR head `308bc00c880ce5cbc1ff7dcb04c657ae426b3f19` and merged-main CI were separately verified; the P2 membership-order thread is resolved. Do not reopen that completed step or rerun the old PREPARE as a retry shortcut. Evidence: [CURRENT-STATE.md](CURRENT-STATE.md).

## Execute next: read existing Production evidence

1. Reconfirm the latest main and PR #249 head, open PRs and Actions. A newer source SHA requires its own checks.
2. In the authorized Cloud Shell session, list existing inventory executions using the single command in [PRODUCTION-RECONCILIATION.md](PRODUCTION-RECONCILIATION.md#first-command). Review that output before the next command. It creates no build, job or execution.
3. Select the latest relevant successful execution, bind its project/region/job/execution/time to the evidence, retrieve only its canonical manifest records and digest, recompute the digest, and compare with the reviewed protected value. Old recorded success is not a new cloud observation.
4. Continue one reviewed read-only command at a time: canonical workflow deployer/effective IAM; migration secret alias/version metadata without payloads; SQL instance/backup/PITR and recovery evidence; installed schema/catalog prerequisites. Actual PostgreSQL role membership must be established through an authorized database-read-only path. Do not substitute blank Admin API metadata or invent a schema ledger query.
5. Stop the dependent Production operation if any evidence is missing, stale, ambiguous or mismatched. Prepare one concrete operation only after all its gates and authorization are satisfied.

The current workspace has GitHub and a local source checkout but no connected GCP/Cloud Shell session. The cloud sequence is pending the owner's first command output or an authorized cloud connection. Do useful repository work while that evidence is unavailable; do not infer it from CI.

## Why a workflow dispatch is not the next read-only command

- Every mode of `production-database-role-bootstrap.yml` builds an image; INVENTORY and VERIFY also deploy/execute Cloud Run jobs.
- PREPARE checks the requested digest's syntax early, but creates a transition secret and rotates the migrator password before the later prepare SQL compares the actual manifest.
- The role workflow does not automatically validate a fresh backup, PITR, tested restore or effective IAM. Runtime containment recovery is a separate mechanism.
- A successful old inventory, enabled secret version, merged PR or green CI does not close those independent gates.

## Repository work in parallel

- Finish the grouped #249 documentation update, including synchronization with main and the original roadmap checkpoint. Keep it documentation-only relative to main.
- Require fresh exact-head Node CI, Test & Verify and complete PR Preview evidence. The old head's Preview failed with an observed Cloud Build polling quota 429; it is not current-head acceptance. If the new head has the same transient failure, inspect it and retry only the relevant nonproduction job once. Do not change quotas or disable checks as a shortcut.
- Review [the implementation/acceptance backlog](../floot-migration/IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) and [media/Classifieds boundaries](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md). Recorded findings remain open until their policy, implementation and acceptance requirements are satisfied.
- Preserve the completed auth/profile/discovery/cart/fulfillment mappings. No silent change to pricing, disclosure, identity, role behavior, visual identity or scope is authorized by their documentation.

## Later dependency order

After current cloud reconciliation and the applicable authorization: fresh verified backup/recovery gate; protected role cutover; post-cutover isolation and inventory evidence; missing schema steps in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md); HARDEN; release readiness; approved deployment and acceptance.

This is not a queued batch of commands. Re-read source and operation-specific evidence each time. Do not generate confirmations with an old SHA. Do not copy Production credentials into Floot. Taxi trips and electronic payments retain their existing readiness gates.

## Validation scope

The 2026-10-05 local check ran 18 workflow-contract cases and nine isolated Bash-runner cases against the executable source from `a2a26f8...`: 27 passed, zero failed, Node.js v24.19.0. gcloud was mocked in the runner tests. Historical 12 decoder, 24 discovery/search, 24 cart and 52 lifecycle results retain the exact source/runtime limits recorded in their respective contracts. None certifies live GCP, Production SQL, actual cash collection or Floot browser compatibility.
