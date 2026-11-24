# Floot production web safety release — 2026-11-20

## Result
**WEB PUBLISHED** by the owner-authorized Floot action; not a Google Cloud Backend release or commercial order activation.

- Floot project `5e271f43-96a6-40de-a634-ec3eae023a49`
- Publish job `fe6d93bf-b0fb-49ae-a1e3-bf52eda30e6a`: `succeeded`
- Independent publish-status readback `published=true`; current release `1795185426658cc00620c-adbb-413c-942e-d5ddfc24ed63`, `publishedAt=2026-11-20T14:37:00.745Z`, `sourceDigest=29808b87445952074c39b2c42a2aef2bf5b5e74a015956e692effaefc5d0bbb9`, 1397 source files, no later failed publish.
- Live URL `[public web origin]/platform`. Read-only HTTP probe: root redirect-followed 200; GET anonymous order list 401; POST order creation `{}` without session 401.
- Floot checkpoint: `f046cf1c-61af-45af-995e-b063ca5b71d9`.

## Shipping change
Backend Preview still served legacy `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`, which omits the `expectedQuote` server guard. Existing Floot quote confirmation was already fail-closed; **new orders could previously be submitted that could not safely be confirmed**.

Changed Floot editor:
- New shared version-check helper `helpers/khedmahReviewedQuoteBackend.tsx`.
- Existing customer-confirmation adapter `endpoints/integrations/khedmah_order_action_POST.ts` now reuses the shared strict version gate.
- `endpoints/integrations/khedmah_order_POST.ts` checks serving Backend compatibility after authentication/session identity binding and **before order creation POST**. Unknown/mismatched versions or unreachable health fail closed with HTTP 503 and `outcome:not_applied`. No completed order-creation mutation.
- `endpoints/integrations/khedmah_order_POST.schema.ts` gives a clear Arabic temporary-unavailable message.
- Regression specs updated: `helpers/khedmahCommerceContracts.spec.tsx` and `helpers/khedmahAdapterEndpoints.spec.tsx`. Specifically verified legacy Backend is rejected before POST and no credentials or body are changed for a compatible fixture.

Quality: all **160/160** Floot Jasmine spec files passed in eight explicit batches (zero failures). Project shipment TypeScript `typecheck: clean`. No production DB test order was created. The gate is intentionally strict and **does not prove enabled Backend rollout configuration**; unlock only after a hosted test proves the expectedQuote persisted match and exact running revision.

## Release blockers
- Floot's authoritative `get_publish_status`: `plan=free`, `customDomains=[]`. HTTP fetch from Floot VM to `[public web origin]/` and `[public web origin]/` failed. A direct request to set up custom domain returned `Custom domains are a paid-plan feature`. **User must change billing/setup** to restore own domain; .floot.app public origin remains live.
- Backend Cloud Run Preview still on legacy `f4f8ce2...`, schema037 candidate not deployed there. Do NOT unlock order confirmation/creation or claim commercial readiness. No Cloud SQL/Production mutation was executed.
- Floot scheduled jobs on free plan do not run; in-editor timed foreground alerts do not constitute background push.
- Floot publish additionally flagged five no-internal-caller endpoints; inspect external usage before removal.
- GitHub `main=20951b4eb991440083a61c611771f7828e440944`, open drafts #398/#399 at initial inspection. #398 head before adding this receipt `a330154c842449fd6a6d61a7b972403dd1f81ac5`. Nine workflows for prior head `d9ccfbfde69eacbf1cb5997b62060c83b1d5ec89` succeeded; do not automatically transfer that status to this documentation commit.

## Next critical action
Finish reviewed-quote Backend deployment and signed real-user HTTP validation against safely isolated schema037, with `ORDER_CONFIRMATION_REQUIRE_REVIEWED_QUOTE=true`; separately restore custom domain through Floot account plan/domain setup, verify DNS and HTTPS. Then repeat restaurant/customer/merchant/courier/device acceptance before announcing the complete production launch.
