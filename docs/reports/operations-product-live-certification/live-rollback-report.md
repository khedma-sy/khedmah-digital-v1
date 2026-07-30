# Live Rollback Report

- **Repository validation:** Rollback rejects invalid service/revision names and explicitly routes 100% traffic to a named prior revision.
- **Runtime validation:** Not executed because no approved Cloud Run service or prior revision was available.
- **External evidence required:** before/after revision IDs, rollback start/end time, traffic allocation, health evidence, rollback duration and observed issues.
- **Result:** Pending live validation.

The certification orchestrator deploys new revisions, rolls both services back to captured prior revisions, then restores traffic to the new revisions. Both rollback and redeploy must succeed; partial success fails certification.
