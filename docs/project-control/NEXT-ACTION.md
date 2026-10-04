# Next Safe Action — Khedmah

Snapshot: 2026-10-04. Re-read live refs before acting.

## Execute now: repository-only review
1. Read protected main and Draft PR #250's current head. Expected at this checkpoint: `d053350c095877e5c693acd7cc9f512be763577a`.
2. Inspect that head's Node.js CI, Test & Verify, and PR Preview, including individual required jobs. Current run IDs: `37193917916`, `37193917877`, `37193917959`.
3. On a failure, inspect the failing test/log, repair only the current branch, and verify the diff. Never rerun the Production PREPARE job to diagnose a PR test.
4. Re-read PR #249 and verify the updated documentation checks. Check review findings separately from test success. Do not bypass protected-branch rules or imply Draft means approved for deployment.
5. Record exact evidence and the next blocker; keep one current action, not conflicting old instructions.

## Deferred until the owner returns — no command to run now
Read-only reconciliation first: main/PR/run status; the latest execution-specific manifest; canonical deployer and relevant IAM; secret alias/version metadata without payloads; backup/PITR metadata; schema migration ledger and prerequisites.

Only after review and explicit mutation authorization: fresh verified backup, protected role cutover workflow, post-cutover VERIFY/INVENTORY, complete schema sequencing, HARDEN, release readiness, then deployment. Each step retains its repository confirmation/backup gates. No ready-to-paste mutation is queued with an old SHA.

Returning to the computer is not authorization for all writes. The owner receives one short reviewed command at a time when needed.
