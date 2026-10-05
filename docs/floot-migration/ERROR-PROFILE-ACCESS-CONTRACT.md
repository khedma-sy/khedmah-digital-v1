# Khedmah to Floot — errors, personal profile and Operations Product access

Status: source-backed migration specification, NOT a deployed Floot adapter or Production acceptance report.
Source repository: `khedma-sy/khedmah-digital-v1`.
Reviewed source commit: `5a961be5035dce1197ba2d0c65519e86f65ca4c6`.
Review date: 2026-10-04.
Companion: [authentication transport contract](AUTH-API-CONTRACT.md).

## 1. Scope and source owners

This slice maps the shared error decoder, two personal-profile routes, and six Operations Product routes. It is NOT a complete inventory of every product, business/professional profile, administrator role, or account-deletion API.

| Source owner, read at the pinned commit | Responsibility |
| --- | --- |
| [global-exception.filter.ts](../../apps/backend/src/filters/global-exception.filter.ts) | Filter-generated error envelope, status mapping and safe identity exceptions. |
| [identity.errors.ts](../../apps/backend/src/identity/identity.errors.ts) | Typed validation, invalid-credential and verification-required exceptions. |
| [api-errors.ts](../../apps/frontend/lib/api-errors.ts) | Canonical/legacy error decoding and four Arabic translations. |
| [identity-api.ts](../../apps/frontend/lib/identity-api.ts) | Credentialed identity requests and preservation of HTTP status/code on errors. |
| [users.controller.ts](../../apps/backend/src/identity/users.controller.ts) | Current-user and personal-profile update routes. |
| [identity.service.ts](../../apps/backend/src/identity/identity.service.ts) | Session-derived user, active-account checks, profile update and public projection. |
| [identity.validation.ts](../../apps/backend/src/identity/identity.validation.ts) | Display-name validation used by the profile update. |
| [operations-product.controller.ts](../../apps/backend/src/operations-product/operations-product.controller.ts) | Six Operations Product routes. |
| [operations-product.service.ts](../../apps/backend/src/operations-product/operations-product.service.ts) | Permission checks, configuration summaries and requested changes. |
| [operations-rbac.service.ts](../../apps/backend/src/operations-product/operations-rbac.service.ts) | Server-owned email-to-role bindings and permission assertions. |
| [operations-product.types.ts](../../apps/backend/src/operations-product/operations-product.types.ts) | Eight Operations Product roles and seven permission names. |
| [operations-product.dto.ts](../../apps/backend/src/operations-product/dto/operations-product.dto.ts) | Change/incident/rollback request fields and validation decorators. |
| [operations-product.repository.ts](../../apps/backend/src/operations-product/operations-product.repository.ts) | In-process arrays for Operations Product changes, incidents and its local audit list. |

The `api/v1` prefix and browser-origin/session transport are mapped in the companion document. Relative links identify source owners; use the pinned commit above when reproducing this review.

## 2. Error transport observed in source

For exceptions handled by `GlobalExceptionFilter`, the body is `{ error: { code, message, timestamp, requestId?, correlationId? } }`. The HTTP response status remains separate; do not infer it solely from `error.code`.

| Exception/status handled by the filter | Exposed code | Exposed message |
| --- | --- | --- |
| Typed `SafeAuthenticationError` / 401 | `INVALID_CREDENTIALS` | تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور. |
| Typed `EmailVerificationRequiredError` / 403 | `EMAIL_VERIFICATION_REQUIRED` | يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول. |
| Other 400 | `validation_error` | Request validation failed. |
| Other 404 | `not_found` | Resource was not found. |
| 500 and above | `internal_error` | Unexpected platform error. |
| Other handled statuses, including ordinary 401/403/409/429 | `request_error` | Request could not be completed. |

The filter deliberately does not expose arbitrary exception messages, response objects or stack traces. Recovery-code exceptions are explicitly typed; a client cannot treat every 403 as email verification or every `request_error` as session expiry.

This is not a claim that every possible middleware/edge response uses the nested envelope. For example, the separately reviewed CSRF middleware writes a top-level `statusCode` and `message` response directly. Preserve compatibility instead of forcing an assumed uniform shape.

### Existing decoder and identity-client behavior

`readApiError` selects an object-valued `error` before the top-level record. It accepts a nonempty trimmed string message, or an all-string array joined with `. ` after trimming/removing empty parts. Object-valued messages and mixed-type arrays are not stringified. A missing message falls back to `تعذر إكمال الطلب (<status>).`. A code is retained only when it is a string.

The four generic filter messages above are translated to Arabic by this decoder. An existing but empty canonical error object still takes precedence over a legacy top-level message. This behavior was tested below; the migration should not silently change precedence.

`identityRequest` sends `credentials: 'include'`, tolerates failed JSON parsing with an empty object, and on a non-success HTTP response throws an Error carrying `statusCode: response.status` and the decoded `code`. Its additional legacy identity-message translations are separate from the shared decoder. A fetch/network rejection is not converted into HTTP 401 by this wrapper.

### Migration requirements, not completed implementation

Preserve HTTP status, safe recovery code and safe message independently. An adapter must not turn a server failure into an empty successful response, invent request/correlation IDs, or expose a raw upstream stack/body as user-facing diagnostics. Do not serialize tokens or cookies into an error log. The decoder is not a general-purpose security sanitizer for every arbitrary string.

## 3. Personal-profile contract

| Route | Input and identity | Observed result |
| --- | --- | --- |
| GET `/api/v1/users/me` | Session read from the Khedmah cookie; no client-supplied target user ID | `{ user }` from `getCurrentUser`; missing/invalid session is unauthorized. |
| PATCH `/api/v1/users/me/profile` | Same session; body field `displayName` | Validates and updates the authenticated user's display name, records `profile.update`, returns `{ user }`. |

The public projection contains `id`, `email`, `status`, and `profile: { displayName, locale }`. It does not contain Operations Product roles or permissions. Do not manufacture admin access from this profile, its display name, or its email in frontend code.

`getSession` requires an active session plus an existing account/profile and `account.status === 'active'`. `getCurrentUser` throws unauthorized if no such user is found. `updateProfile` obtains that user before validation/update and uses that user's ID for the write.

The inspected update validator requires a string display name, trims it and accepts lengths 2–80. This route does not implement changing the user's email, password, role or verification state. Do not infer unknown-field rejection from the TypeScript interface alone; broader malformed-body behavior is outside this review.

## 4. Operations Product permission boundary

The service authenticates with `IdentityService.getCurrentUser` and then checks a named permission with `OperationsRbacService.assert`. Bindings come from server configuration `OPERATIONS_PRODUCT_ROLE_BINDINGS`, not from a Floot label/session or a request-body role.

Observed binding behavior:
- Missing configuration yields no roles.
- Malformed JSON or a non-object/array binding configuration throws an error, not a default administrator grant.
- The lookup key is the authenticated email converted to lowercase; this does not normalize every stored configuration key automatically.
- A non-array role entry or an entry containing an unknown role yields no roles.
- `assert` throws forbidden when no assigned role grants the requested permission; `permissionsFor` returns the deduplicated union of recognized roles' permissions.

| Operations Product role | Permissions in the inspected map |
| --- | --- |
| `operations_product_director` | `operations.read`, `infrastructure.manage`, `deployments.manage`, `releases.manage`, `security.manage`, `incidents.manage`, `rbac.manage` |
| `infrastructure_manager` | `operations.read`, `infrastructure.manage`, `deployments.manage` |
| `cloud_administrator` | `operations.read`, `infrastructure.manage`, `security.manage` |
| `devops_engineer` | `operations.read`, `deployments.manage`, `releases.manage` |
| `production_engineer` | `operations.read`, `deployments.manage`, `incidents.manage` |
| `release_manager` | `operations.read`, `releases.manage` |
| `security_operations_engineer` | `operations.read`, `security.manage`, `incidents.manage` |
| `site_reliability_engineer` | `operations.read`, `deployments.manage`, `incidents.manage` |

This is only the Operations Product map. It must not be conflated with PostgreSQL roles or the separate `admin_roles` mechanism. `ai.manage` is not in this inspected current-main map; a legacy draft's AI permission is not proof of current access. The existence of `rbac.manage` also does not prove a role-editing endpoint exists in this controller.

## 5. Six protected Operations Product routes

Base path: `/api/v1/admin/operations-product`. All routes first resolve an authenticated Khedmah user.

| Method/path suffix | Required permission | Body fields | Observed response/behavior |
| --- | --- | --- | --- |
| GET `/overview` | `operations.read` | None | `{ operationsProduct }`, including roles/permissions, configuration summary and repository counts. |
| GET `/inventory` | `operations.read` | None | `{ resources }` generated from a static list of service names, marked `configuration_driven`. |
| GET `/history` | `operations.read` | None | `builds`, `deployments`, `releases`, `changes`, `incidents`, `audit`; first three arrays are empty in this implementation. |
| POST `/changes` | `infrastructure.manage` | `area`, `action`, `reason` | `{ change }` with `status: 'pending_approval'`, authenticated actor and generated ID/time. No cloud executor is called here. |
| POST `/incidents` | `incidents.manage` | `title`, `severity`, `summary` | `{ incident }` with `status: 'open'`, generated ID/time; records an audit event. |
| POST `/rollbacks` | `releases.manage` | `deploymentId`, `reason` | `{ change }`, area `production`, action `rollback:<deploymentId>`, status `pending_approval`. It does NOT execute a deployment rollback. |

DTO rules observed: `area` is one of `google-cloud`, `firebase`, `ci-cd`, `production`, `monitoring`, `security`; action/title/deploymentId lengths are 3–120; reason/summary lengths are 10–500; severity is `low`, `medium`, `high` or `critical`. These describe the inspected decorators, not a newly performed HTTP validation test.

### Important truthfulness and durability limits

The overview sets `health.status` to the literal `ready` and `productionTrafficEnabled` to the literal `false`. Google/Firebase statuses inspect whether environment values are present; monitoring/logging statuses inspect flags. This method does not query live cloud health. The returned service inventory is likewise not a discovery of actual provisioned resources.

The repository keeps changes, incidents and its Operations Product audit list in instance arrays. That is not proof of a durable, cross-instance approval queue. The service also calls `IdentityRepository.appendAuditLog` for relevant actions; do not misdescribe all audit behavior as memory-only. This review does not certify end-to-end audit durability or an approval executor elsewhere.

Before a production control dashboard promises durable approvals or executed changes, resolve those requirements explicitly. A frontend migration must not hide these limitations, create a second contradictory queue in Floot, or label a `pending_approval` response as an applied infrastructure change.

## 6. Local decoder review evidence

The complete `api-errors.ts` content was copied from the pinned connector read into an isolated local test directory. `git hash-object` returned `1a29eecfbad616c567bf0278b6004a2b0ddea4da`, exactly matching the fetched repository blob. No whole-repository clone or dependency installation was needed.

Runtime: Node.js v22.16.0 with `--experimental-strip-types` and the built-in test runner. Twelve targeted cases passed, zero failed:
1. Canonical recovery code/message precede conflicting legacy fields.
2. Legacy all-string message arrays trim/filter/join correctly.
3. Object messages are not stringified.
4. Mixed-type arrays use the fallback.
5. An empty canonical error object does not expose a legacy message.
6. A non-object root uses the fallback.
7. String messages are trimmed and string codes retained.
8. Non-string codes are omitted.
9. Validation-message Arabic translation.
10. Not-found-message Arabic translation.
11. Internal-error-message Arabic translation.
12. Generic-request-message Arabic translation.

No network, Google command, secret, database, role update or Production operation was used. These tests certify only these decoder cases on that source blob. They do not test the backend filter, HTTP middleware, profile writes, RBAC, Floot compatibility, browser sessions or the full repository suite. No executable repository file was changed by this documentation slice.

## 7. Future adapter acceptance gates — all still open

- Preserve 401 versus 403 versus 409/429/5xx and both nested/legacy error envelopes without inventing success or a logged-out state.
- Keep `EMAIL_VERIFICATION_REQUIRED` as a verification-recovery path, not a generic wrong-password error.
- Read/update the same authenticated personal profile; an unrelated user ID or client-supplied role cannot change authority.
- Test every mapped Operations Product route for anonymous, authenticated-without-permission and authorized access; keep configured privilege checks server-side.
- Show requested change/rollback as pending, not executed; distinguish configuration summaries from live service health and address queue durability before relying on it operationally.
- Validate the actual Floot transport, browser cookie/origin handling and mobile journeys using the companion contract; existing Next.js Preview evidence is not Floot evidence.

The public category/search mapping is now recorded in [DISCOVERY-API-CONTRACT.md](DISCOVERY-API-CONTRACT.md); do not repeat that completed mapping as the next slice. Resume the first unresolved implementation/acceptance dependency from [NEXT-ACTION.md](../project-control/NEXT-ACTION.md). Account deletion, business/professional ownership, other administrator-role APIs, and all live infrastructure state remain outside this document's completed scope.
