# Next Safe Action — Khedmah

Snapshot: 2026-10-04. Re-read live refs before acting.

## Execute now: close the PR #250 review gate
1. Re-read main and PR #249/#250. PR #250 has moved beyond the previously green `d053350c095877e5c693acd7cc9f512be763577a` head because a P2 review found fixed-order expected membership arrays. Require the latest head to pass fresh exact-SHA checks after the dynamic-order fix and custom-role-name regression.
2. Check the newest PR #249 head after the grouped update adding `docs/floot-migration/FULFILLMENT-LIFECYCLE-CONTRACT.md`. Prior head `d68261c9a0c027057b0ed49ab9aae604e7e1a41a` had successful Node.js CI `37212409867` and Test & Verify `37212409859`; PR Preview `37212409862` was still deploying. Do not reuse prior-head results for a new head.
3. Inspect failures/review findings separately from CI success. Avoid status-only commits while checks run. Do not merge or dispatch Production while the P2 thread is unresolved or latest-head checks are incomplete.
4. Preserve lifecycle distinctions: customer quote acceptance; server-resolved merchant/courier authority; guarded reassignment; stored notification versus actual device receipt; current versus stale location; and reported cash collection versus reconciliation.
5. Consolidate open findings from the completed contract slices into prioritized implementation/acceptance work rather than treating documentation as a resolved defect. Then map media and Classifieds ownership/moderation boundaries in a bounded source-backed slice. Do not silently change existing disclosure, pricing, identity or role behavior.

## Completed bounded local checks
- Earlier slices: 12 shared error-decoder cases, 24 discovery/search helper cases and 24 cart cases. Exact blobs/runtimes are in their contracts.
- Current lifecycle slice: 52 tests passed, zero failed, using three byte-verified backend source files, Node.js v22.16.0 and TypeScript 5.8.3 transpilation. Thirty tests exercise 300 transition combinations; one characterization explicitly records pre-accept address/note/coordinate disclosure.
- Identity/session extraction, Nest wrappers and repositories were test doubles. No PostgreSQL/HTTP/browser/Floot acceptance or cash reconciliation was performed. Executable repository source remains unchanged.

## Owner is back at a computer — read-only cloud work may resume after PR #250 closes
Read-only reconciliation sequence: main/PR/run status; latest execution-specific manifest; canonical deployer and relevant IAM; secret alias/version metadata without payloads; backup/PITR metadata; schema ledger and prerequisites using SCHEMA-RELEASE-GATES.md. Give one short command at a time and review its output before the next.

Only after review and explicit mutation authorization: fresh verified backup, protected role cutover workflow, post-cutover VERIFY/INVENTORY, complete schema sequencing, HARDEN, release readiness, then deployment. Each step retains its repository confirmation/backup gates. No ready-to-paste mutation is queued with an old SHA.

Returning to the computer is not authorization for all writes. The owner receives one short reviewed command at a time when needed. Same-origin API routing remains a candidate until Floot capability and actual browser journeys are proven.
