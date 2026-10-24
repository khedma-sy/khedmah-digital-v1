# PR304 implementation boundary — 2026-10-24

The implementation operator is `scripts/execute-preview-v2-writer-fence.py`.

## Corrected fence after final review

The original draft used a maintenance revision and a zero-session database snapshot. Final review rejected that as insufficient: Cloud Run explicitly allows in-flight requests to continue after traffic migration, so an old request could outlive the traffic switch.

The corrected operator uses **service disablement with manual scaling zero** instead.

Google's current Cloud Run contract states:

- `gcloud run services update SERVICE --scaling=0` disables the service and prevents further requests to the service URL;
- requests already being processed are allowed to complete;
- revision tags are not disabled by service scaling, therefore the operator requires zero tags before and after the fence;
- Cloud Monitoring exposes `run.googleapis.com/container/instance_count`, sampled every 60 seconds and potentially delayed up to 120 seconds.

The operator therefore requires all of the following in order:

1. fresh successor receipt with authority granted, exactly one serving revision, and zero tags;
2. disable the service with manual scaling zero;
3. an **explicit** Cloud Monitoring `container/instance_count = 0` data point for the serving revision after the disable timestamp;
4. a fresh successor receipt confirming manual scaling zero, zero tags, and zero runtime/migrator/unexpected database sessions.

Missing monitoring data, elapsed time, or a quiet DB snapshot alone are never accepted as proof.

## Execution guard

The operator defaults to `--plan`. Its mutating mode is unavailable unless the exact environment confirmation is present:

`KHEDMAH_PREVIEW_WRITER_FENCE_CONFIRM=PREVIEW_V2_WRITER_FENCE_20261024`

Even the mutating mode performs **writer fencing only**. It does not execute 036/037, deploy the candidate, activate Floot, delete revisions, or touch Production.

Do not execute `--execute-fence` merely because this PR exists. Exact-head CI/review, normal merge, resulting-main checks, and a fresh live-state reread are required first.

References:
- https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling
- https://docs.cloud.google.com/run/docs/managing/services
- https://docs.cloud.google.com/run/docs/monitoring
- https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z
