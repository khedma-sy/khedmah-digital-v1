# Account navigation and operational workflow audit — 2026-11-05

Baseline: main `cc8d49809cb9543ee1620432d9c0ba73fb801cbb`. Scope: repository source review only. No browser, production, or database acceptance has been performed.

## Evidence and findings

1. **Account navigation (UX gap):** `apps/frontend/app/users/me/page.tsx` exposes professional profiles, businesses, classifieds, store, mobility, billing and account deletion, but not `/orders` (customer orders), `/orders/courier` (courier tasks), `/orders/merchant` (merchant operations), or `/courier-signup`. Do not blindly expose privileged courier/merchant operations: show role/eligibility-aware destinations and server-authorize all operations. Existing `/orders/courier` already offers a registration path for users without a courier business.
2. **Account session:** the page distinguishes HTTP 401 from transient session-fetch errors; the latter preserves a retry action. Live Google login was reported intermittent by owner; a successful user session after a full PC restart is not root-cause closure.
3. **Admin:** `apps/frontend/app/admin/page.tsx` fetches session and operations overview; it gates navigation by `operations.read`, `security.manage`, `content.approvals.approve`, `trust.approvals.approve`, and `mobility.approvals.approve`. Verify server-side enforcement for every underlying endpoint with ordinary-user, reviewer, and owner roles. The page explicitly says incident/change records are in-process, not durable audit records.
4. **Courier:** `apps/frontend/app/orders/courier/page.tsx` polls every eight seconds while mounted and optionally plays alerts on newly observed assigned/ready orders. This does not establish push/full-screen/repeating sound when the app is backgrounded or closed. Confirm duplicate-delivery prevention, order ownership, cash collection, and location privacy in live acceptance.
5. **Customer orders:** `apps/frontend/app/orders/page.tsx` presents merchant/courier lifecycle, contact links and ratings. Test complete transitions, refusal, cancellations, and authorization with separate accounts.
6. **Taxi:** `apps/frontend/app/taxi/page.tsx` includes passenger/driver modes, quotes, acceptance, consent, recovery and ratings. Source presence is not proof of live dispatch, pricing or settlement readiness.
7. **Professionals:** a 404 on `/api/v1/professionals/me` was observed in read-only Cloud Run logs, but whether this is expected absence of a profile or a broken endpoint remains unresolved. Test both new user and existing professional accounts.

## Prioritized next acceptance matrix

| Priority | Journey | Required proof |
| --- | --- | --- |
| P0 | Google login → session → account refresh/reopen | Same user, request correlation, correct auth path, no regression |
| P0 | Ordinary user → admin routes | All restricted APIs reject without exposing data |
| P0 | Merchant order → courier → customer | Two/three separate approved accounts, status transitions, recovery, cash/evidence |
| P0 | Passenger → approved driver → completed taxi trip | Actual backend state, consent, location and notifications |
| P1 | Account navigation and icons | Every displayed action leads to intended reachable destination; keyboard and mobile checks |
| P1 | Professional profile creation and /professionals/me | New/existing user 404 distinction, ownership and moderation |
| P1 | KORA/CEO/GM/Expose/Autopsy | Read-only evidence provenance, privilege boundaries, durable audit trail |
| P1 | Store/classifieds/restaurant approval | Create → smart-admin proposal → human-gated decision → published state |
| P1 | Notifications | Foreground, background, closed-app iOS/Android; documented OS limits |

## Guardrails

No production mutation, deployment, permission grant, automatic approval, or merge is authorized by this audit. Audit findings require regression tests and exact-head CI before approval. PR #344 (Google recovery), #346 (Android account), and #348 (professional smart-admin planning) were draft at review time; do not confuse those proposals with deployed fixes.
