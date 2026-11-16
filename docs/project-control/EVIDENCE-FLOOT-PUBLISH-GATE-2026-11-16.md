# Floot republish gate — 2026-11-16

## Verified current state
- Live release `17944528331124c03df28-23e1-4345-ad73-f248adfce602`, published `2026-11-12T03:07:07.733Z` at `https://khedma-meeting.floot.app`; custom domains `khedmah.uk` and `www.khedmah.uk` attached (Floot `get_publish_status`).
- Floot editor version observed: `1794784873909`.
- Current editor project-wide TypeScript: **`typecheck: clean`**.
- Three targeted Jasmine suites passed, zero failed: `helpers/khedmahReviewedQuoteConfirmation.spec.tsx`, `helpers/khedmahMerchantAlerts.spec.tsx`, `helpers/khedmahCustomerOrderAccountIsolation.spec.tsx`.
- Connected live anonymous GET orders returned 401 and unauthenticated order POST endpoints rejected 403 in prior stored HTTP receipt; not authenticated acceptance.
- PR #398 head at checkpoint: `530091fab8e65744afdf2d4367dd183925b0faf9`.

## Publish decision — blocked, fail-closed
Floot's `publish_app` publishes the whole editor source (including API endpoints and scheduled tasks), rather than selectively releasing individual safe frontend changes. The current editor's merchant confirmation sends `expectedQuote` upstream, but no live Backend evidence proves atomic persisted-quote enforcement. No signed restaurant/taxi/courier E2E acceptance. The three helper specs + clean typecheck are insufficient to waive those gates. **No new Floot publish was executed**; retain currently published release.

## Next specific acceptance
Run exact retained Backend candidate against disposable clean schema-037 PostgreSQL, verify HTTP signed merchant order confirmation rejects stale persisted quote atomically and tests role-scoped order flow. Then compare full Floot editor/release and publish only after the combined API/scheduled-job surface is verified. Document image hash, command results and rollback before publish.
