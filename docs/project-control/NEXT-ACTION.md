# Next Safe Action — Khedmah

Snapshot: 2026-10-04. Re-read live refs before acting.

## Execute now: finish the current repository-only review slice
1. Read main and both current PR heads. PR #250 was moved to Ready for Review at `d053350c095877e5c693acd7cc9f512be763577a`; it was not merged. Its nine required jobs passed in runs `37193917916`, `37193917877`, `37193917959`.
2. Inspect the exact new PR #249 documentation head and its checks. This update adds `docs/floot-migration/AUTH-API-CONTRACT.md` and refreshes the checkpoint without changing executable code. Do not reset successful PR #250 checks by unnecessary commits or retries.
3. Review new PR comments/findings separately from CI success. A COMMENT review is not an independent approval. Do not auto-merge or dispatch Production from the owner's continued presence on mobile.
4. While Production is held, the next bounded source-mapping slice is the shared API error envelope and protected profile/role contracts needed by the authentication adapter. Preserve existing logic and record unmapped behavior as open, not implemented.
5. Group related documentation changes into one reviewed commit instead of repeatedly cancelling CI for individual note edits. Record exact evidence and one next blocker.

## Deferred until the owner returns — no command to run now
Read-only reconciliation first: main/PR/run status; latest execution-specific manifest; canonical deployer and relevant IAM; secret alias/version metadata without payloads; backup/PITR metadata; schema ledger and prerequisites using SCHEMA-RELEASE-GATES.md.

Only after review and explicit mutation authorization: fresh verified backup, protected role cutover workflow, post-cutover VERIFY/INVENTORY, complete schema sequencing, HARDEN, release readiness, then deployment. Each step retains its repository confirmation/backup gates. No ready-to-paste mutation is queued with an old SHA.

Returning to the computer is not authorization for all writes. The owner receives one short reviewed command at a time when needed. The same-origin API design is only a candidate until Floot routing/header capability and actual browser journeys are proven.
