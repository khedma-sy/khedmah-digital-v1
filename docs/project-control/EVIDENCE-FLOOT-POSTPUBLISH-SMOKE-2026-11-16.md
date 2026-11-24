# Post-deployment smoke receipt — Floot web 2026-11-16

Live release independently reconfirmed via Floot get_publish_status: `17948620376495ecb4a1f-0013-496c-9ce6-b198bcf08bc9`, published `2026-11-16T20:47:12.558Z`, no later failed publish. Domains attached `[public web origin]`, `[public web origin]`.

Unauthenticated HTTP probes from Floot VM, no customer or operational data touched:

| Request | Observed |
| --- | --- |
| GET `[public web origin]/` | 301 to `/platform`; redirects followed: 200 |
| GET `[public web origin]/` | 301 to `/platform`; redirects followed: 200 |
| GET `/_api/integrations/khedmah_orders` | 401 JSON |
| POST `/_api/integrations/khedmah_order_action` empty JSON | 403 JSON |
| POST `/_api/integrations/khedmah_order` empty JSON | 403 JSON |

The 403 can be an Origin/CSRF rejection and is not sufficient to prove all authorization controls; authenticated role E2E and persistence remain unverified. These responses confirm only anonymous boundary and publicly served landing pages. No new publish was initiated in this check.

At pre-check, PR #398 head `a27995f6cb836cedfe493d72fce8d8797f041911`; 6 exact-head workflows complete/success and 3 in_progress. Floot scheduled jobs remain inactive on current free plan.

Next: signed test account login, checkout order, merchant quote, customer confirmation, courier assignment, delivered completion, notifications; investigate 5 Floot endpoints without internal call sites. Avoid production live-data testing with irreversible side effects without a dedicated fixture.
