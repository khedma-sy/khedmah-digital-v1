# Production media Terraform stack

This isolated stack owns only the private production media bucket and its runtime object access.
It deliberately does not share the legacy root stack's local state.

Safety rules:

- State must use a pre-existing, private GCS state bucket.
- The plan script validates the state bucket before Terraform initialization.
- Production media remains in `europe-west1`.
- Public access prevention and uniform bucket-level access are enforced.
- There is no automated apply command. Applying requires a separately reviewed saved plan and explicit approval.
- If the media bucket already exists, do not import it directly. A separately approved state handoff must remove both media addresses from the legacy root state and import both into this isolated state in one reviewed maintenance window.
- The plan script queries `terraform -chdir=infra/iac state list` directly before and after planning. The canonical legacy root working directory must be initialized against its actual state, and neither media resource address may remain under legacy ownership.
- The isolated state may contain only `google_storage_bucket.media` and `google_storage_bucket_iam_member.runtime_media_objects`; any other address stops before planning.
- If state already tracks the media bucket, its recorded name must exactly match `GCS_MEDIA_BUCKET` before planning.
- The tracked bucket project and region must match the requested production project and `europe-west1`.
- Any tracked runtime IAM member must match the requested bucket and runtime service account.
- The production state prefix is fixed at `khedmah/production/media`; alternate prefixes fail closed.
- An inconclusive project bucket lookup stops before planning instead of treating the bucket as absent.
- The saved plan JSON is checked before `READY`: only the two media addresses are allowed, delete actions are rejected, and both planned resource identities must match the production inputs.
- Planning, readiness validation, and Production deployment use the same `GCS_MEDIA_BUCKET` and `OPERATIONS_RUNTIME_SERVICE_ACCOUNT` inputs; the deployment passes the reviewed bucket to Cloud Build explicitly.
- Provider selections are committed in this stack's own `.terraform.lock.hcl` for reproducible validation and planning.
- CI must initialize and validate this isolated stack. A missing cached provider for the legacy root stack is external pending evidence, not permission to skip the isolated validation.

Run `scripts/plan-media-storage.sh` only after supplying its required environment variables.
Merging the root configuration removal, mutating either state, importing resources, planning, and applying remain separate approval gates.
