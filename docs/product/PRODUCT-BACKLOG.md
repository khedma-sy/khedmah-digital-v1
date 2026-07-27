# Product Backlog

## Authority

The [Khedmah Digital MVP Definition](KHEDMAH-DIGITAL-MVP-DEFINITION.md) controls product scope. This backlog tracks work but does not independently authorize implementation.

## MVP Critical Backlog

| Priority | Item | Status |
| --- | --- | --- |
| P0 | Adopt the bounded MVP definition and reconcile active scope documents | Closed by council directive on 2026-07-27 |
| P0 | Remove critical/high frontend production dependency vulnerabilities through a staged Next upgrade | Risk reduced in Mission-024: critical removed; open for transitive `sharp`/`postcss` high findings |
| P0 | Remove high backend production dependency vulnerabilities through a staged Nest upgrade | Closed by Mission-025: Nest chain audit findings removed |
| P0 | Define the authoritative repository remote and obtain central CI evidence | Open — external administration required |
| P0 | Select one migration authority and prove forward/rollback on temporary PostgreSQL | Open — architecture decision required |
| P0 | Replace required process-local persistence or approve a time-bounded Alpha exception | Open |
| P0 | Mark historical production-ready claims as superseded by the current gate report | Closed on 2026-07-27 |

## MVP Quality Backlog

| Priority | Item | Status |
| --- | --- | --- |
| P1 | Add repeatable performance baseline and approved SLI/SLO | Open |
| P1 | Measure synchronous password hashing and linear repository lookups under load | Open |
| P1 | Add explicit root lint, typecheck, and documentation-link gates | Open |
| P1 | Increase behavioral integration coverage without removing governance tests | Open |
| P1 | Maintain an evidence-linked MVP dashboard per release candidate | Open |

## Deferred Backlog

All capabilities listed as excluded or deferred in the MVP definition remain unapproved for implementation. In particular, Khedmah Connect, `أنا مع خدمة`, Job Work, broader Khedmah Sharing, partner-network execution, marketplace, payment, social, and advanced intelligence work remain post-MVP.

## Backlog Rule

No backlog status, percentage, test, code placeholder, or architecture note expands scope. A council-approved MVP definition revision is required first.
