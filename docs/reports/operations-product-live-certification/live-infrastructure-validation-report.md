# Live Infrastructure Validation Report

- **Repository validation:** Passed by `npm run validate:operations`; Terraform/API/resource contracts exist.
- **Runtime validation:** Not executed on 2026-07-30 because this execution environment had no `gcloud`, approved project identifier, active Google identity, runtime/deployer service-account identifiers, or production region.
- **External evidence required:** restricted collector outputs for project lifecycle, enabled APIs, Cloud Run revisions/traffic, Cloud Build history, Artifact Registry, Secret Manager metadata, DNS zones and Certificate Manager state.
- **Result:** Pending live validation; no live infrastructure claim made.

Execute `scripts/collect-live-production-evidence.sh` in the approved environment and attach its restricted evidence manifest. All expected resources must be present and healthy, certificates active, DNS correct, and production service accounts enabled before this report can pass.
