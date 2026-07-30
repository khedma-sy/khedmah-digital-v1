# Live Deployment Report

- **Repository validation:** Cloud Build YAML, image build/push steps, readiness gates and guarded deploy script are present; local production build passed.
- **Runtime validation:** Not executed; this environment lacked `gcloud`, authentication and all approved production identifiers.
- **External evidence required:** Cloud Build ID/status/timestamps/images, prior and new Cloud Run revisions, traffic state, health checks, deploy duration and redacted issue log.
- **Result:** Pending live validation.

The approved operator runs `scripts/run-live-production-certification.sh`. Success requires new ready revisions for both services and a completed execution summary. A local build is not accepted as deployment evidence.
