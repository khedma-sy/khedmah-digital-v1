# Floot live anonymous HTTP boundary — 2026-11-16

## Live read-only / deliberately unauthenticated requests
Executed via connected Floot VM against `[public web origin]`, no session token, no real customer data, no authenticated writes:

| Method | Path | HTTP |
| --- | --- | --- |
| GET | `/_api/integrations/khedmah_orders` | 401 |
| GET | `/_api/integrations/khedmah_order_action` | 404 (endpoint supports POST) |
| POST | `/_api/integrations/khedmah_order_action` with `{}` | 403 |
| POST | `/_api/integrations/khedmah_order` with `{}` | 403 |

Requests used `redirect: manual`, no credentials or mutation-authorizing payload. The 403 status may involve CSRF/origin enforcement and cannot alone establish authorization correctness. No valid order was submitted. Backend candidate not started.

## Independent checks
- GitHub PR #398 head before this receipt: `22c63464c8e04b90023b02e35325d6e8060bef2d` at session start.
- Floot editor `helpers/khedmahReviewedQuoteConfirmation.spec.tsx` passed; incremental typecheck on order-action handler/schema was clean.
- **Not accepted**: new Backend runtime on clean schema-037 with signed HTTP traffic, atomic persisted `expectedQuote` compare, retry behavior, merchant/courier workflow, Floot full release.
- No production publication change, Cloud SQL restart or new paid cloud resource.

**Next:** build a disposable schema-037 full HTTP test harness, obtain signed fixture accounts and validate persisted quote-change conflict before any commercial launch.
