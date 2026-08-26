# Production media Terraform stack

This isolated stack owns only the private production media bucket and its runtime object access.
It deliberately does not share the legacy root stack's local state.

Safety rules:

- State must use a pre-existing, private GCS state bucket.
- The plan script validates the state bucket before Terraform initialization.
- Production media remains in `europe-west1`.
- Public access prevention and uniform bucket-level access are enforced.
- There is no automated apply command. Applying requires a separately reviewed saved plan and explicit approval.
- If the media bucket already exists, import it into this stack before any apply.

Run `scripts/plan-media-storage.sh` only after supplying its required environment variables.
