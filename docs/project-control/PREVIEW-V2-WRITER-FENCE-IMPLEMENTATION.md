# PR304 implementation boundary — 2026-10-24

The implementation operator is `scripts/execute-preview-v2-writer-fence.py`.

## Current Google contract verified before implementation

- Cloud Run configuration changes create immutable revisions and support explicit command/args overrides.
- `gcloud run services update` supports `--no-traffic`, `--clear-env-vars`, `--clear-secrets`, `--clear-cloudsql-instances`, `--clear-volumes`, and `--clear-volume-mounts`.
- Traffic migration does **not** terminate in-flight requests; those requests can continue on the old revision.
- Old revisions can be deleted only after they can no longer receive traffic; deletion is irreversible.

Therefore the operator does not use elapsed time as evidence. It moves traffic to an inert maintenance revision, then repeatedly performs the existing successor database read until all governed writer identities are zero. Only after that proof does it delete the old application revisions and verify that maintenance is the sole revision.

## Execution guard

The operator defaults to `--plan`. Its mutating mode is unavailable unless the exact environment confirmation is present:

`KHEDMAH_PREVIEW_WRITER_FENCE_CONFIRM=PREVIEW_V2_WRITER_FENCE_20261024`

Even the mutating mode performs **writer fencing only**. It does not execute 036/037, deploy the candidate, activate Floot, or touch Production.

Do not execute `--execute-fence` merely because this PR exists. Exact-head CI/review, normal merge, resulting-main checks, and a fresh live-state reread are required first.
