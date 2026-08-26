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
- The root stack declares a GCS backend. The plan script initializes it against `gs://$TF_STATE_BUCKET/khedmah/production/root/default.tfstate` and reads it through `terraform state pull`; planning stays blocked until the separately approved state migration/handoff makes that the real root authority.
- Root and media commands force the `default` workspace inside separate temporary `TF_DATA_DIR` directories, so shell state or a retained `.terraform/environment` cannot redirect either state lookup.
- `LEGACY_ROOT_STATE_LINEAGE` and `LEGACY_ROOT_STATE_SERIAL` must match the reviewed identity of that authoritative state. The script reads the latest GCS object before and after planning, requires an unchanged serial, and rejects either legacy media resource.
- The isolated state may contain only `google_storage_bucket.media` and `google_storage_bucket_iam_member.runtime_media_objects`; any other address stops before planning.
- If state already tracks the media bucket, its recorded name must exactly match `GCS_MEDIA_BUCKET` before planning.
- The tracked bucket project and region must match the requested production project and `europe-west1`.
- Any tracked runtime IAM member must match the requested bucket and runtime service account.
- The production state prefix is fixed at `khedmah/production/media`; alternate prefixes fail closed.
- An inconclusive project bucket lookup stops before planning instead of treating the bucket as absent.
- The saved plan JSON is checked before `READY`: only the two media addresses are allowed, delete actions are rejected, and both planned resource identities must match the production inputs.
- The requested plan path is normalized to an absolute path before Terraform changes directory. Terraform writes to a temporary pending plan there, and the reviewed output is published only after the post-plan root-state check succeeds; every rejected pending plan is deleted.
- Planning, readiness validation, and Production deployment use the same `GCS_MEDIA_BUCKET` and `OPERATIONS_RUNTIME_SERVICE_ACCOUNT` inputs; the deployment passes the reviewed bucket to Cloud Build explicitly.
- Provider selections are committed in this stack's own `.terraform.lock.hcl` for reproducible validation and planning.
- CI must initialize and validate this isolated stack. A missing cached provider for the legacy root stack is external pending evidence, not permission to skip the isolated validation.

Run `scripts/plan-media-storage.sh` only after supplying its required environment variables.
Merging the root configuration removal, mutating either state, importing resources, planning, and applying remain separate approval gates.
