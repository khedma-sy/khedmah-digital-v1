# Khedmah Digital → Floot Migration Plan

## Strategy
This is an experience-layer migration, not a database or infrastructure replacement.

### Keep in Google Cloud / GitHub
- NestJS backend business logic.
- PostgreSQL / Cloud SQL.
- Database migrations.
- Google IAM/WIF.
- Secret Manager.
- Terraform.
- Artifact Registry and build/deploy controls.
- Production evidence and CI/CD.

### Move/rebuild for Floot experience
- Web application shell.
- User-facing navigation and pages.
- Forms, dashboards, client state, presentation.
- AI assistant UX.
- Voice/interview agent UX.
- Selected server-side adapters required by Floot.

## API-first rule
Every migrated screen must map to an existing or explicitly approved API contract before implementation.

Reviewed source maps: [authentication](AUTH-API-CONTRACT.md), [errors/profile/Operations access](ERROR-PROFILE-ACCESS-CONTRACT.md), [discovery](DISCOVERY-API-CONTRACT.md), [food/cart/order entry](FOOD-CART-ORDER-CONTRACT.md), [fulfillment](FULFILLMENT-LIFECYCLE-CONTRACT.md), and [media/Classifieds ownership and moderation](MEDIA-CLASSIFIEDS-CONTRACT.md). Each map retains its pinned-source and validation limits. [The acceptance backlog](IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) keeps unresolved findings separate from completed mapping; no live integration is certified by these documents.

Required mapping fields:
- Existing Next.js route.
- Target Floot route.
- API endpoint(s).
- Authentication requirement.
- Role/permission requirement.
- Read/write classification.
- Media dependency.
- Error model.
- Test/acceptance journey.

## Authentication
Preferred path: preserve Khedmah identity/session model through a controlled API/auth bridge. Do not create an independent Floot identity silo unless an architecture decision explicitly replaces the existing identity model.

Must validate:
- CORS.
- secure cookies/session handling.
- SameSite policy.
- CSRF.
- logout/revocation.
- Google OAuth redirects.
- role enforcement server-side.

## Secret policy
Floot-specific secure resources may be created only for direct Floot dependencies.
Examples:
- AI provider.
- ElevenLabs.
- dedicated/restricted Maps client key.
- Khedmah-owned OAuth client if direct Google integration is selected.

Never copy Production database or deployer credentials to Floot.

## Module acceptance sequence
Each module passes:
1. Contract mapping.
2. UI implementation.
3. Functional tests.
4. auth/RBAC negative tests.
5. mobile/RTL review.
6. error/retry behavior.
7. production API compatibility.
8. owner acceptance.

## Domain
Preview first on Floot-hosted URL.
Custom domain only after acceptance:
- `khedmah.uk` / `www.khedmah.uk` → Floot.
- `api.khedmah.uk` → Google Cloud production backend.
Cloudflare remains DNS authority.

## Launch philosophy
No big-bang rewrite. Migrate by bounded module, keep backend contracts stable, and retain a rollback path until the new frontend is accepted.
