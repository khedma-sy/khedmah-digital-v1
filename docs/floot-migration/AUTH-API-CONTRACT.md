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

#### Candidate B compatibility evidence

Reviewed 2026-10-05: the transport owners below were read at `cf6245e934d2c3251492412c559420e2a3ea60cc` and are source-equivalent at `b7b6d0aa6c06d7b9650158f5e49569656eb8aa4d`. The local MC-04 client change retains API base, credentials and JSON-header behavior. This is conditional architecture evidence, not implementation, deployed-source equivalence or browser acceptance.

| Browser context | Compatibility conclusion |
| --- | --- |
| Top-level HTTPS frontend and HTTPS API under the same registrable domain | Viable in principle: requests are [same-site](https://html.spec.whatwg.org/multipage/browsers.html#same-site), but cross-origin CORS remains required. No Floot endpoint proxy or method tunnel is needed. |
| `*.floot.app` frontend calling an API on another registrable domain | Cross-site. `SameSite=None` does not bypass [WebKit's default third-party-cookie blocking](https://webkit.org/tracking-prevention/). This preview cannot establish universal authenticated acceptance. |
| Frontend inside a cross-site editor iframe | [Ancestor context](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.2.1) can make the site-for-cookies opaque. A sandboxed opaque Origin is separate; do not trust `Origin: null` as a workaround. |

Khedmah's [cookie owner](../../apps/backend/src/identity/session-cookie.ts) sets host-only `khedmah_session`, `HttpOnly`, deployed-environment `Secure; SameSite=None`, `Path=/api/v1`. Direct API login creates an API-host cookie usable on that API path; existing frontend-host cookies do not transfer automatically. Business Desk's separately inspected `helpers/getSetServerSession.tsx` uses `floot_built_app_session`, `SameSite=Lax`, `Path=/` and its own JWT; it is not this transport.

Required validation:

- [API client](../../apps/frontend/lib/api-client.ts) and [Classifieds client](../../apps/frontend/lib/classifieds-client.ts): configure one approved API origin and retain `credentials: 'include'`. JSON Content-Type also causes cross-origin GET preflights. Verify OPTIONS, exact allowed origins, credentialed responses and required methods/headers under the [Fetch CORS rules](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials).
- Preserve [configured CORS](../../apps/backend/src/app.ts) and [unsafe cookie-authenticated Origin/Referer checks](../../apps/backend/src/middleware/csrf-origin.middleware.ts). GET/HEAD/OPTIONS exemptions and unauthenticated login behavior are not universal CSRF enforcement.
- Resolve media paths against the API independently of JSON clients. Test protected bytes and preserve [private/no-store behavior](../../apps/backend/src/media/media.controller.ts). [Anonymous image CORS mode](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes) omits cross-origin credentials; credentialed images/fetches and effective [frontend CSP](https://www.w3.org/TR/CSP3/) need browser proof.
- [Logout](../../apps/backend/src/identity/identity.service.ts) success alone is insufficient when no valid cookie arrived; verify subsequent session and protected-image denial. Preserve the [Firebase popup/token exchange](../../apps/frontend/lib/firebase/auth.ts), intended identity project and [authorized domain/provider configuration](https://firebase.google.com/docs/auth/web/google-signin).

**Next browser proof:** on an approved same-site nonproduction origin pair, test login, reload/session, protected image, rejected foreign-origin action, then logout/denial in Safari and Chromium; repeat the login/session segment with Google. Public GET success is insufficient.

Target Floot project, owner plan and validation/domain arrangement remain decisions. [Custom-domain setup](https://floot.com/docs/custom-domains/how-to-add-custom-domain) requires an owner paid plan and normally DNS-only Cloudflare records. Production prerequisites and owner acceptance remain authoritative; this finding authorizes no domain, credential, app or resource change.

No choice between A and B was deployed in this review. No Floot capability or browser acceptance result is inferred from repository source alone.

### Floot source and platform evidence — 2026-10-05

Read-only inspection identified **Khedma Business Desk**, project `5e271f43-96a6-40de-a634-ec3eae023a49`. Every inspected source owner returned version `1791086603173`. Publication metadata reported an existing published app, but no deployed-bundle/source equivalence or runtime journey was verified. Its existing B2B context does not establish it as the approved full-platform migration target.

The inspected authentication chain implements its own credentials and sessions:

| Floot source owners | Observed behavior |
| --- | --- |
| `helpers/useAuth.tsx`; `endpoints/auth/session_GET.schema.ts`; `endpoints/auth/login_with_password_POST.schema.ts` | Client requests use `/_api/auth/session` and `/_api/auth/login_with_password`, with SuperJSON responses. |
| `endpoints/auth/login_with_password_POST.ts` | Queries `users` and `userPasswords`, checks the password with bcrypt, creates a random session ID and inserts a `sessions` row. |
| `helpers/getSetServerSession.tsx` | Signs/verifies its own HS256 session JWT and issues `floot_built_app_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. |
| `helpers/getServerUserSession.tsx`; `endpoints/auth/session_GET.ts` | Resolve local session/user records and refresh that cookie. Session GET also updates activity and can delete expired sessions; it was not invoked. |
| `helpers/db.tsx` | Uses the environment-variable name `FLOOT_DATABASE_URL`; its value, physical database host and account data were not inspected. |

No Khedmah `/api/v1` forwarding or Firebase ID-token exchange exists in this inspected chain. This bounded finding does not rule out unrelated integrations elsewhere.

Official Floot connector guides `floot-overview` and `primitives`, read without a project ID, specify native `/_api/<route>` endpoints, GET/POST methods and no dynamic endpoint parameters. They do not establish a transparent `/api/v1/*` rewrite. Khedmah's unchanged `Path=/api/v1` cookie would not accompany `/_api/...` browser requests. Missing routing tools do not prove platform-wide impossibility. [Official API integration documentation](https://floot.com/docs/integrations/overview) supports external HTTPS calls, not this complete transport contract.

**Next compatibility proof:** establish supported `/api/v1/*` routing to a fixed upstream, preserving methods, bodies, Cookie, multiple Set-Cookie headers, status codes and the validated original browser origin, without shared caching of private responses. If unavailable, review Candidate B explicitly. Do not assume an edge workaround: [Floot's standard domain guide](https://floot.com/docs/custom-domains/how-to-add-custom-domain) specifies DNS-only Cloudflare records.

Production prerequisites remain authoritative. No adapter, credential, domain or app change was made; actual browser acceptance remains open.

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

This document preserves the observed contract while Production database work is held. It adds no route, secret, OAuth client, DNS record, Floot resource or cloud deployment. The shared error/profile/access, discovery, cart/order, fulfillment and media mappings are already indexed in [MIGRATION-PLAN.md](MIGRATION-PLAN.md); do not repeat them as unfinished work. Resolve the platform transport evidence above before actual adapter implementation, together with the agreed Production prerequisites and browser acceptance.
