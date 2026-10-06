# Floot / Google integration gate

Status: repository release contract. This file does not authorize a Production mutation.

## Canonical ownership

| Surface | Owner / authority | Canonical target |
| --- | --- | --- |
| Source, CI/CD, IaC, release evidence | GitHub | `khedma-sy/khedmah-digital-v1` |
| Backend/API, Cloud SQL, IAM/WIF, Secret Manager, media/runtime | Google Cloud | `api.khedmah.uk` |
| Public web experience after acceptance | Floot | `khedmah.uk`, `www.khedmah.uk` |
| DNS control plane | Cloudflare | authoritative DNS for `khedmah.uk` |
| Production session/authorization authority | Khedmah backend | existing server-side identity/session/RBAC model |

## Non-negotiable boundaries

1. Floot is an experience layer, not a replacement for Cloud SQL, Terraform, Secret Manager, IAM/WIF, migrations, backend authorization or release evidence.
2. Floot must never receive Cloud SQL credentials, Terraform/state write authority, Production deployer/migrator credentials, unrestricted Google API keys, or Secret Manager payloads.
3. Browser authentication preserves the backend-issued HttpOnly session cookie, credentialed requests, server-side role checks and CSRF origin validation.
4. The final public topology is same-site by registered domain: `khedmah.uk` / `www.khedmah.uk` for the frontend and `api.khedmah.uk` for the backend. This does not remove the need for CORS, CSRF and browser acceptance testing.
5. A Floot-hosted preview is a different origin and may be cross-site. Do not widen Production CORS, CSRF or cookie policy merely to make preview authentication work. Use a bounded test origin/session or an approved adapter/proxy and retest the final custom-domain topology.
6. Cloudflare remains the DNS authority. Domain cutover happens only after Floot preview acceptance and Google backend readiness are both green.
7. Production Google Cloud runtime/media region remains `europe-west1`. Explicit staging configuration may differ and must remain isolated from Production.

## Required protected configuration before cutover

### Backend / browser origin contract
- `NEXT_PUBLIC_SITE_URL`: final public frontend URL, normally `https://khedmah.uk`.
- `CORS_ORIGIN`: explicit accepted browser origin list; never wildcard with credentialed sessions.
- Backend session cookie remains HttpOnly + Secure in deployed environments.
- CSRF middleware continues to reject unsafe cookie-authenticated requests from origins outside `CORS_ORIGIN`.

### Google OAuth / Firebase
- OAuth authorized origins and redirect URIs must match the accepted final domain topology.
- Firebase authorized domains must include only approved frontend/auth domains.
- Login scopes stay identity-only unless a feature explicitly requests Gmail/Calendar/Drive with contextual consent.

### Maps
- Browser key is restricted by API and approved HTTPS referrers.
- Server key remains server-side.
- Android key remains package/SHA restricted.
- Floot receives only a browser-safe Maps credential if it directly renders Maps; never the unrestricted/server credential.

## Acceptance sequence

1. Repository control docs and this gate agree on the exact protected `main`.
2. GitHub CI/checks pass on the exact candidate head.
3. Google Cloud read-only reconciliation is complete.
4. Database/recovery/schema/hardening gates close in their governed order.
5. Google domain/OAuth/Firebase/Maps configuration is verified without weakening IAM.
6. Floot preview passes functional, auth/RBAC-negative, error/retry, mobile/RTL and browser acceptance using a bounded non-Production arrangement.
7. Final custom-domain topology is configured and tested again on `khedmah.uk` / `api.khedmah.uk`.
8. DNS cutover is staged with rollback retained.

## Stop conditions

Do not proceed to domain cutover or Production browser acceptance if any of these is true:
- wildcard or unreviewed Production CORS is required;
- Floot requires Production database/service-account credentials;
- OAuth/Firebase/Maps restrictions cannot be narrowed to approved domains;
- session/logout/CSRF behavior differs between preview and final topology without an explicit bridge;
- Google Production gates or repository exact-SHA checks are not green;
- rollback is not defined.
