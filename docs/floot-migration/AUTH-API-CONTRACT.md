# Khedmah to Floot — authentication transport contract

Status: source-backed design input, NOT an implemented or certified Floot integration.
Reviewed source: `khedma-sy/khedmah-digital-v1` at `5a961be5035dce1197ba2d0c65519e86f65ca4c6`.
Date: 2026-10-04.

## 1. Existing behavior observed in source

The current browser client uses an empty API base and requests `/api/v1` on the frontend origin. Next.js rewrites `/api/v1/:path*` to the configured backend origin. Moving screens to another host therefore does not, by itself, preserve the existing authentication transport.

The existing social sign-in flow is Firebase sign-in followed by a Khedmah session exchange. It is not a standalone Khedmah Google OAuth client-secret callback:

```text
Browser Firebase signInWithPopup
  -> credential.user.getIdToken(true)
  -> POST /api/v1/auth/google with { idToken }
  -> backend Firebase accounts:lookup
  -> Khedmah account/session persistence
  -> khedmah_session cookie + { user }
```

The function is named `getGoogleIdToken`, but the inspected implementation returns a Firebase user's ID token. Do not substitute an arbitrary Google OAuth access token, a raw Google ID token, or a Floot session token for that payload.

### Source references

All paths below were read at the pinned SHA above; links locate the corresponding repository owners.

| Source | Observed responsibility |
| --- | --- |
| [api-client.ts](../../apps/frontend/lib/api-client.ts) | `API_BASE = ''`; comment explains the frontend-origin proxy. |
| [next.config.ts](../../apps/frontend/next.config.ts) | `/api/v1/:path*` rewrite; upstream comes from `NEXT_PUBLIC_API_URL`, with a localhost development fallback. |
| [auth.controller.ts](../../apps/backend/src/identity/auth.controller.ts) | Register, login, social exchange, logout, session and password-recovery routes. |
| [auth.dto.ts](../../apps/backend/src/identity/dto/auth.dto.ts) | Request interface field names; these interfaces alone do not certify runtime validation. |
| [session-cookie.ts](../../apps/backend/src/identity/session-cookie.ts) | Cookie name, path, maxAge, HTTPS-environment policy and clear behavior. |
| [google-auth.service.ts](../../apps/backend/src/identity/google-auth.service.ts) | Firebase accounts lookup, provider/email checks, account lookup and Khedmah session creation. |
| [firebase/auth.ts](../../apps/frontend/lib/firebase/auth.ts) | Google/Facebook popup and Firebase ID token retrieval. |
| [app.ts](../../apps/backend/src/app.ts) | Global `api/v1` prefix, credentialed CORS, CSRF middleware, authentication rate limits and exception filter. |
| [csrf-origin.middleware.ts](../../apps/backend/src/middleware/csrf-origin.middleware.ts) | `CORS_ORIGIN` parsing and unsafe session-request origin checks. |

## 2. Existing authentication endpoints

These are controller-level contracts, not claims that Production or Floot has passed these journeys. Bodies below identify fields; service-level validation and error contracts must remain authoritative.

| Method and path | Body fields | Controller behavior |
| --- | --- | --- |
| POST `/api/v1/auth/register` | `email`, `password`, `displayName` | Returns user/verification-required result and requests email verification; does not attach a session cookie here. |
| POST `/api/v1/auth/login` | `email`, `password` | Attaches the Khedmah session cookie; returns `{ user }`. |
| POST `/api/v1/auth/google` | `idToken` from Firebase | Verifies social sign-in, attaches cookie; returns `{ user }`. |
| POST `/api/v1/auth/facebook` | `idToken` from Firebase | Uses Facebook provider verification and the same Khedmah cookie model. Frontend exposure is separately gated. |
| POST `/api/v1/auth/logout` | none in the controller | Reads the cookie, calls backend logout, clears the cookie; returns `{ status: 'ok' }`. |
| GET `/api/v1/auth/session` | none | Returns `{ user }` from the Khedmah session or raises unauthorized when no valid session exists. |
| POST `/api/v1/auth/forgot-password` | `email` | Uses a uniform message that does not disclose whether the email exists. |
| POST `/api/v1/auth/reset-password` | `token`, `newPassword` | Calls password recovery and returns a success message after completion. |

Email-verification confirmation, profile modification, account deletion, role APIs and other product contracts are not mapped by this table. Do not invent endpoints for them from this document.

## 3. Cookie and request-origin boundary

Observed in `session-cookie.ts`:
- Name: `khedmah_session`.
- `httpOnly: true`.
- Path: `/api/v1`.
- Client maxAge: 3,600 seconds. This is the cookie setting, not an independent assertion about every server-side expiry rule.
- `production`, `preview` and `staging`: secure cookie with `SameSite=None`.
- Other environments: non-secure cookie with `SameSite=Strict` in this function.
- No `Domain` option is set.
- Cookie clearing uses the same path/security/SameSite options.

Observed in `app.ts` and `csrf-origin.middleware.ts`:
- CORS uses configured origins and `credentials: true`.
- `CORS_ORIGIN` is a comma-separated list; unconfigured deployed environments receive an empty allowed-origin list, not the development origin.
- GET/HEAD/OPTIONS bypass the unsafe-method CSRF check.
- Unsafe requests carrying the session cookie require an allowed Origin or an allowed Referer-derived origin, except the existing explicit Android branch.

Migration requirements, not existing Floot behavior:
- Do not remove `httpOnly`, serialize the session into frontend storage, or make frontend JavaScript the session-token transport.
- Preserve Set-Cookie and Cookie behavior, status codes and the logout cookie attributes across any adapter.
- Do not use `x-khedmah-client: android` as a workaround for a web/Floot origin failure.
- Do not remove the origin checks or add wildcard production trust to make a test pass.
- Preserve the original browser origin through any server adapter and validate it; never blindly replace an untrusted origin with an allowed origin.

## 4. Candidate integration patterns — decision remains open

### Candidate A: preserve a same-origin API path

```text
https://khedmah.uk/api/v1/...
  -> reviewed same-origin adapter/routing layer
  -> existing Khedmah backend
```

This candidate most closely preserves the existing Next.js browser contract. Before selection, prove that the actual Floot deployment or approved edge supports the required path, request body, Cookie and multiple Set-Cookie header handling without caching private responses. The current Next.js rewrite file is not assumed to run inside Floot.

The adapter must use a fixed approved upstream; it must not accept an arbitrary destination URL supplied by a user. Authentication, authorization and business logic stay in Khedmah backend services.

### Candidate B: browser requests to `api.khedmah.uk`

This is a separate transport design, not a DNS-only substitution. It needs an explicit API client/config change, credentialed requests, exact allowed origins, cookie validation, and tests on the actual preview/custom-domain combinations. It must not be declared compatible merely because a public GET endpoint works.

No choice between A and B was deployed in this review. No Floot capability or browser acceptance result is inferred from repository source alone.

## 5. Configuration and credentials

| Item | Source-backed observation / boundary |
| --- | --- |
| Upstream API URL | Configuration, not a database credential. Current Next.js owner is `NEXT_PUBLIC_API_URL`; Floot configuration naming is still to be defined. |
| `CORS_ORIGIN` | Backend origin allowlist; changes are deferred until the selected integration is tested. |
| `FIREBASE_API_KEY` | The inspected backend uses it for Firebase accounts lookup; do not print its actual value in logs or documentation. |
| Browser Firebase setup | Reuse the intended Khedmah identity project only after its actual configuration and domain authorization are verified. |
| `GOOGLE_CLIENT_SECRET` | Not referenced by the inspected existing sign-in path. A new client secret is not a proven requirement merely because the frontend moves to Floot. Separate Google Workspace/provider integrations may have different requirements. |
| Khedmah session token / Firebase ID token | Sensitive runtime values; never put them in source, migration reports or model prompts. |
| Cloud SQL password, migration URL, deployer credentials, Terraform state access | Not needed by a frontend authentication adapter; remain outside Floot under the current architecture. |

## 6. Acceptance gate before any real frontend cutover

These are required future tests, not completed test results:
1. Register keeps the verification-required experience and does not pretend the user is already signed in.
2. Password login stores the expected cookie and session lookup returns the same Khedmah user after navigation and reload.
3. A Firebase-issued Google token exchanges successfully; invalid/provider-mismatched input remains rejected.
4. Logout removes the browser session and protected requests no longer succeed.
5. Expired, absent and malformed cookies fail safely; network/server failures are not disguised as a logged-out account.
6. Allowed origins work; foreign and absent origins on unsafe session requests remain rejected under the web contract.
7. Actual mobile Safari/Chrome and desktop journeys pass on the chosen preview and custom-domain transport. Existing Next.js Preview success is not Floot evidence.
8. Authorization negatives pass for other users and administrative resources; a frontend role label never grants backend authority.
9. Adapter retries do not invent a successful login or replay a business write; private responses and cookies do not leak through shared cache/logs.
10. Existing frontend rollback remains available until owner acceptance.

## 7. Current scope and next work

This document preserves the observed contract while Production database work is held. It adds no route, secret, OAuth client, DNS record, Floot resource or cloud deployment. The next repository-only mapping slice is the shared error envelope and protected profile/role APIs; actual adapter implementation waits for the agreed platform validation and Production prerequisites.
