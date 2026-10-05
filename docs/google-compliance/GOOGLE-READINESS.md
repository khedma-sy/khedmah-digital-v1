# Khedmah Digital — Google Readiness for Floot Transition

## Goal
Prepare Google Cloud and Google user-data integrations for the new Floot application layer without changing the Production source of truth or weakening least-privilege controls.

## Service matrix to finalize
For every Google service record:
- feature/purpose;
- API;
- OAuth scope(s), if any;
- user-visible disclosure;
- storage destination;
- retention/deletion rule;
- server-side vs browser-side access;
- credential owner;
- allowed origins/redirect URIs;
- Production monitoring owner.

## Core services
- Google Sign-In / Firebase Auth.
- Firebase web configuration and authorized domains.
- Google Maps Platform for map/places/routes use cases.
- Gmail, Calendar, Drive only when the corresponding user-facing feature is enabled.
- Google Cloud backend services, Secret Manager, Cloud SQL, Cloud Storage.
- Google Play declarations for Android when publishing.

## Least-privilege rules
- Login must not silently request Gmail/Calendar/Drive.
- Ask for feature-specific scopes only in context.
- Browser keys must be API-restricted and referrer-restricted.
- Server secrets remain in Secret Manager or the owning platform's secure resource store.
- Production service-account credentials must never be embedded in Floot/frontend code.
- Keep Development/verification flows separate from Production where practical.

## Domain readiness
Target public structure:
- `https://khedmah.uk`
- `https://www.khedmah.uk`
- `https://api.khedmah.uk`

Before cutover, update and test:
- OAuth authorized domains/origins/redirects.
- Firebase authorized domains.
- CORS/CSRF/session cookie policies.
- Maps referrer restrictions.
- Privacy, terms, support, and account-deletion URLs.

## Compliance evidence
Maintain evidence for:
- user-data flow;
- OAuth scopes and rationale;
- account deletion;
- Data Safety;
- consent/analytics;
- third-party processors;
- incident/security controls.

The actual declarations must match the deployed behavior. Documentation must not claim a Google capability is active before it is implemented and tested.
