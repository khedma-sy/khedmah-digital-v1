# Backend ↔ Schema 037 ↔ Floot: executable acceptance gates (2026-11-16)

**Status:** written test contract; not an execution result. Only disposable PostgreSQL 16 + retained Backend candidate have a startup pass. No runtime Cloud Run verification, no protected SQL or published Floot mutation.

## Evidence baseline
- GitHub `main`: `20951b4eb991440083a61c611771f7828e440944` (confirmed before this document).
- Existing Lab DB `khedmah-restore-pg16-20261114`: owner read-only receipt STOPPED / activationPolicy NEVER / PRIVATE address only / one active service-networking peering / no listed VMs. Last established schema 035, not 036/037.
- 037 migration `backend/migrations/versions/037_verification_evidence_media.sql` adds private-owner constraints for evidence image asset types; 036 introduces classified publication quota logic. Do not bypass these migrations for a smoke test on restored lab.
- Retained candidate acceptance: Actions `43767079511`, artifact `14182921183` (retained until 2026-12-15). Its isolated schema-037 startup passed, **not proof of serving Cloud Run compatibility**.
- Floot last live release `17944528331124c03df28-23e1-4345-ad73-f248adfce602` (2026-11-12). Editor has an `expectedQuote` on merchant confirmation; serving Backend `preview-pr-274-f4f8ce2...` is not proven to enforce atomic persisted-quote compare. The full Floot app includes jobs/API, so do not use publish to test a single frontend fix.

## Strict isolated-lab execution prerequisites (NO-GO until proved)
1. Independently reconcile actual LAB spend and authorized runtime window; previous 24-hour window expired.
2. Fresh external-writer/network inventory must be complete, not `HTTP_403_SERVICE_DISABLED`. Never infer absence from disabled services or stale asset snapshots. Verify all possible routes, principals and consumers; account for private-service connection and connection-restart race.
3. Verify PostgreSQL new-connection fence and privileged recovery route; test abnormal interruption and postflight `datallowconn` restoration on disposable PostgreSQL first. No retry when SQL outcome is unknown.
4. Require stop policy and actual state readback after lab-only run, not just `NEVER` policy text. No Preview or Production SQL.

## Contract test sequence after isolation is independently approved

| ID | Test | Pass evidence | Fail-closed rule |
|---|---|---|---|
| B-01 | Exact retained image boot in isolated lab on schema 037 | image digest + Cloud Run LAB revision + healthy startup + log / timestamp | do not substitute newly built or Preview serving image |
| B-02 | Schema migration 035 → 036 → 037 | single-attempt migration record + catalog postflight 035/036/037 + preserved data | no second execution when unknown |
| B-03 | Evidence media privacy | owned business/professional private evidence accepted; public/wrong owner rejected | never enable admin uploads for bypass |
| B-04 | Merchant quote confirmation | matching expectedQuote accepted exactly once; stale or altered quote rejected atomically by Backend after competing update | frontend-only comparison is insufficient |
| B-05 | Cross-role authorization | customer, merchant, courier, professional, driver, reviewer, admin test accounts with allowed/forbidden requests logged | anonymous GET 200/401 is not acceptance |
| B-06 | Order lifecycle | customer creates → merchant confirms → courier accepts → delivered, with permitted state transitions & idempotent retries | no live financial writes before approval |
| B-07 | Taxi lifecycle | driver verified → online GPS → matched nearby → ride accepted → completed, with authorization and location controls | disabled driver-doc and approval execution remain disabled |
| B-08 | Push delivery | restaurant/taxi alerts ring and vibrate on physical devices, background/locked screen, re-alert and accept/reject | backend push simulation is not device proof |
| B-09 | Floot full-app release parity | full editor diff incl scheduled jobs/API, TypeScript/tests, signed browser/mobile E2E + rollback to known good release | do not publish whole app based on helper specs only |

## Current result
- **Designed / locally exercised:** PostgreSQL session admission and connection barrier in disposable CI; prepared image startup against separate schema-037 database; Floot 160 helper specs and selected anonymous read-only HTTP parity.
- **Not performed:** live LAB 036/037, lab Cloud Run candidate deployment, atomic expectedQuote verification, signed cross-role order/taxi E2E, device push, full Floot republish.
- **Owner approvals:** conditional LAB restart authorization recorded; it never waived external writer fence, time/cost constraints, or production controls.
- **Next executable step:** close network/writer unknowns by read-only evidence and budget boundary; only then run pinned single-attempt isolated LAB plan and record B-01/B-02 outcomes. Each passing test produces its own immutable commit/PR evidence receipt as required by `EXECUTION-EVIDENCE-PROTOCOL-2026-11-16.md`.
