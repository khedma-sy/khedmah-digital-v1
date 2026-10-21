# Human Admin Approval Permissions

## Outcome

`smart_admin_approver` is a bounded, authenticated **human reviewer** role. The name does not create an autonomous AI actor and does not allow KORA to decide a review. Every acceptance still requires an explicit button/API action from a signed-in reviewer and the domain service records that review against the authenticated user.

The role is bound only through the server-side `OPERATIONS_PRODUCT_ROLE_BINDINGS` runtime configuration. Email addresses, role claims, and reviewer identities are never accepted from a request body or browser header.

## Exact authority

| Permission | May read | May accept | Explicitly excluded |
| --- | --- | --- | --- |
| `content.approvals.approve` | Pending Classifieds, Store products, business profiles, professional profiles, and the public images exposed to their review queues | The exact revision shown in the queue | Reject, suspend, resolve reports, edit owner content, or change prices |
| `trust.approvals.approve` | Current pending business/professional verification requests, their current private evidence images, and the exact profile revision | The current request and evidence state, with mandatory human review notes | Reject, suspend trust, reactivate an account, or claim an automated identity/authenticity check |
| `mobility.approvals.approve` | Current private driver/vehicle documents and Taxi operational candidates | A visually reviewed current document; then the eligible driver/vehicle/zone record when all four latest documents are accepted | Reject a document, suspend/revoke an operational approval, dispatch a trip, or change Taxi pricing |

The role does not receive `operations.read`. The existing `overview` endpoint accepts one of the three bounded approval permissions only to open the authenticated administration shell. In that limited context it returns roles and permissions with an empty service list and neutral incident/change counts; it does not read environment service status or the operations repository. Operational inventory, history, KORA, and supervised-admin audit remain protected by `operations.read`. The role also does not receive `security.manage`, infrastructure, deployment, release, incident, RBAC, billing, finance, secret, IAM, database-migration, or Production mutation authority.

## Mandatory safeguards

- Approval of a record owned by the reviewer is forbidden on the server.
- Approval remains bound to the current domain revision or review revision. A changed record must be reloaded and reviewed again.
- The backend enforces approval-only authority even if a caller forges a rejection, suspension, or revocation request. Those decisions remain restricted to `security.manage`.
- The limited-role UI does not request report data and hides rejection, suspension, and revocation actions. Hiding controls is usability defense only; the backend permission checks remain authoritative.
- Classifieds Smart Admin output remains an advisory, structural assessment with `automatedDecisionAllowed=false`; it never authorizes automatic publication.
- Document hashes and upload signatures prove byte integrity and type framing only. A human reviewer must open private driver/vehicle evidence and assess it before acceptance.
- Business/professional verification accepts from one to three private evidence **images** per profile (JPEG, PNG, or WebP, at most 5 MiB each). This V1 flow does not accept PDFs and is not a document archive.
- A trust reviewer can open private verification evidence only while that profile's latest verification request is pending. The server rechecks the media metadata and authorization after reading the stored object; a decided or superseded request does not leave a reviewer-readable evidence link.
- The decision is a review of the current evidence state. Uploading or deleting verification evidence advances the locked parent revision. If a prior request was approved, the prior decision row remains historical, a new pending request is created, and the public business trust/verification state is invalidated until another explicit human review.
- Business/professional verification is a human attestation recorded with notes. The platform must describe the public result as **human-reviewed verification**, not as an automated identity, document-authenticity, or government-registry check. The flow does not preserve deleted evidence files for later forensic reconstruction.

## Activation boundary

Source support does not change a live account or environment. Activation requires a reviewed role-binding update for the intended administrator, Preview/Staging negative tests (including rejection/suspension denial and self-approval denial), a reviewed merge, and a separately authorized deployment. No Floot operation, IAM change, secret write, database migration, or Production deployment is part of this source change.
