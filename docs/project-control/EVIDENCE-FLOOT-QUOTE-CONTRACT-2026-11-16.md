# Floot merchant confirmation contract — fresh editor test receipt (2026-11-16)

**Scope:** editor-only read and helper Jasmine test. No live Backend HTTP, no Google Cloud or Floot publication changes.

- Floot project: `5e271f43-96a6-40de-a634-ec3eae023a49`; editor source version `1794784873909` from file inspection.
- Inspected `endpoints/integrations/khedmah_order_action_POST.ts`, `.schema.ts` and `helpers/khedmahReviewedQuoteConfirmation.spec.tsx`.
- `confirm` endpoint's local preflight requires status `quoted`, present total and delivery fee, matching reviewed amount/currency, matching order revision `updatedAt`, and arithmetic coherence. It passes a body `{status: "merchant_confirmed", expectedQuote: {updatedAt, total, currency}}` to upstream `commerce.call("status")`. This preflight is **not atomic** with the backend update; the upstream must enforce the same snapshot condition during the write.
- Current Floot spec `helpers/khedmahReviewedQuoteConfirmation.spec.tsx`: `1 spec file(s) passed, 0 failed` via connected Floot `run_tests`, validating absent fields rejection, 409 stale quote reporting, and no automatic retry.
- Floot incremental TypeScript check on these two endpoint files: `typecheck: clean`.
- GitHub prior head `f64c2175246d5cca926ea0268cc796135e578146`: six workflows completed/success, including disposable PostgreSQL schema-037 privacy check. The new independent Floot check does **not** establish Backend runtime compatibility, transactional quote enforcement, merchant/courier E2E or production readiness.

**Immediate next gate:** on a clean disposable schema-037 PostgreSQL and retained Backend candidate, issue HTTP confirmation after a concurrent quote update. Require a 409/not-applied outcome and unchanged persisted status; matching exact expectedQuote should succeed once, stale/replayed attempt should fail. Record image digest, test fixture lifecycle and request/response evidence. No Production mutation or old restored SQL restart.
