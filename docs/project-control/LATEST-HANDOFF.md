# Khedmah Digital — Latest Handoff

Updated: 2026-10-25 UTC

This file is the shortest continuation checkpoint and takes precedence over older dated checkpoint prose when determining the next safe action.

## Source checkpoint

- Protected `main`: `6d0ed03c18a45d2824e3ed01808fbc8ee0279533`
- PR #319 merged successfully after 6 successful checks and 6 intentionally skipped checks, with no failed or pending PR checks.
- Post-merge `main` checks are not yet fully closed at this checkpoint: Code Quality and Source Inventory succeeded; `build (24.x)` and `Run Tests & Verification (24.x)` were still in progress when this handoff was written.

## Monitoring diagnosis

The prior `STOP: MONITORING_READ_FAILED` was traced to a source bug in the descriptor request: the metric type slash was encoded as `%2F`, producing Google Monitoring HTTP 400 `INVALID_ARGUMENT`.

The corrected `scripts/read-preview-v2-instance-metric-evidence.py` on `main` keeps the metric descriptor path hierarchical by quoting the metric type with `safe="/"`.

The monitored-resource descriptor read for `cloud_run_revision` was independently observed as HTTP 200 with the expected labels.

This source repair does **not** prove writer quiescence. No accepted explicit zero instance point has yet been produced after the manual-zero boundary.

## Current safety boundary

Keep all of the following blocked until writer-quiescence evidence is accepted:

- migrations 036/037
- candidate deployment
- traffic restoration
- Floot approval execution
- Floot publication
- Production mutation

Preserve Preview Cloud Run at manual scaling zero. Do not replay the mutating writer fence merely to manufacture telemetry.

## Floot

Internal Floot integration work is source/test-only. The read-only Preview health diagnostic is wired into the admin surface. Keep real approval execution and document-upload activation disabled until backend/release gates close.

## Next safe action

1. Require the post-merge checks for `main=6d0ed03c18a45d2824e3ed01808fbc8ee0279533` to finish successfully.
2. Then execute only the corrected **read-only** Monitoring inspector from the current `main` in the authorized owner Cloud Shell.
3. Treat any `STOP:` as diagnostic evidence. Do not respond by replaying scaling/deployment mutations.
4. If the corrected read still returns no explicit zero point, design/review a replacement read-only quiescence proof rather than weakening the acceptance rule.
5. Only after accepted quiescence proof should database writer identities be re-read and the separate migration/deployment gates be considered.

No Cloud Run, database, IAM, Floot publication, or Production mutation is authorized by this handoff.
