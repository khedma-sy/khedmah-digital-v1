# Recovery LAB — classified binding failure and cleanup (owner Cloud Shell receipt)

Date: 2026-11-20 UTC. Operator-supplied output; not an independent Google Cloud API read in this GitHub session.

## Read-only classification
- `LOG_STATUS=RECENT_MATCH`; matching local gcloud log last modified `2026-11-20T14:38:16Z`.
- `LOG_SECRET_KIND=SQL`; `LOG_PROJECT_MARKER_PRESENT=True`.
- `EXACT_PRINCIPAL_MISSING=True`; `SERVICE_ACCOUNT_MISSING=True`; `INVALID_ARGUMENT=True`; `NOT_FOUND=True`.
- `PERMISSION_DENIED=False`; `ORGANIZATION_POLICY=False`; `AUTHENTICATION=False`; `TRANSIENT_OR_QUOTA=False`; `ETAG_OR_CONDITION=False`.
- `LAB_STATE=STOPPED`, `LAB_ACTIVATION_POLICY=NEVER`.
- `TEMP_SECRETS_PRESENT=False`, `TEMP_SERVICE_ACCOUNT_PRESENT=False`, `TEMP_TRANSITION_JOB_PRESENT=False`.
- `RAW_LOG_OR_SECRET_PRINTED=False`, `READ_ONLY_NO_CLOUD_MUTATIONS=True`.

## Meaning and limits
The local failure matches a missing **exact temporary LAB service-account principal** at Secret Manager IAM binding time. The sampled output does **not** substantiate a permissions denial or organization policy. This is consistent with a creation-to-Secret-Manager visibility race but cannot distinguish eventual consistency from CLI error formatting or an identity mismatch on its own. It does not imply the service account was never created. The independently queried cleanup lists currently show no temporary LAB resources in the expected names, and the exact SQL instance is stopped (stronger than an activation policy-only readback).

The pinned source at `a330154c842449fd6a6d61a7b972403dd1f81ac5` already contains bounded retries for **one strict error-string shape** in `scripts/run-recovery-lab-schema-transition.py`. The owner receipt instead reported `STOP: LAB_SECRET_BINDING_FAILED`, not `LAB_SERVICE_ACCOUNT_NOT_VISIBLE_AFTER_RETRIES`. That suggests the exact stderr shape may have missed the strict retry predicate; this is an inference pending sanitized error-shape verification, not a proven fix.

## Next safe action
Compare the local failed IAM error shape with the exact allowed retry predicate **without printing raw logs, tokens, credentials, or the email**. Add a narrow regression for the observed sanitized shape and retain fail-closed behavior for all other errors. Verify any corrected logic in disposable/offline CI, review the exact head, and separately reconcile LAB spending/time authorization. **Do not retry the 036/037 migration based on cleanup alone.** Recheck external writers, DB connection fence and schema predecessor from live LAB before any subsequently authorized operation.

## Release boundary
- No 036/037 transition success is evidenced.
- No Backend candidate has been deployed by this diagnostic.
- Production and Preview mutation remain prohibited; public Floot release is separate.
- No repeated restore, lab restart, IAM grant, or Google Cloud mutation is requested by this documentation.
