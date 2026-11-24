# Owner scope clarification — prelaunch with no operational data (2026-11-16)

> **Owner correction, 2026-11-20 — NOT PUBLISHED / NOT LAUNCHED.** The owner explicitly states: **«الموقع بعده مش منشور» (the intended Khedma Digital website has not been published by the owner yet).** This is the authoritative owner acceptance/launch status; **no final site publication, official public launch, or operational go-live has been authorized or completed**. Technical evidence that a Floot subdomain returns HTTP 200 and that Floot lists an automatic/technical release is not proof that the owner published the intended site. The intended custom domain `[public web origin]` was not attached in Floot at the latest connector read; the serving Backend is still an older incompatible version, and the restaurant/store public catalogs had no records in the last anonymous read. Always distinguish **technical preview accessibility** from **owner-approved final publication**. Do not describe the project as "site published", "launched", or "live business" in release status, and do not deploy or publish without fresh explicit release authorization and verified safety gates.

Owner explicitly confirmed: **Khedma Digital has not commercially launched and contains no operational/business transactions or live customer data**. Treat as a **prelaunch** project; published Floot UI is a technical web publication, not acceptance of a running commercial service.

## Consequences for delivery
- Prioritize fastest safe **fresh disposable schema-037 acceptance** and modern Backend/Floot end-to-end integration rather than repeatedly reviewing a legacy restore when the latter is not needed to validate a fresh install.
- A clean disposable database is the preferred non-destructive test target. Do **not** delete or reset the existing stopped restored LAB SQL, or assume its data is empty, merely from this statement. Preserve it until an explicit replacement/data inventory decision.
- Operational-data absence reduces migration-continuity concerns but **does not** remove access isolation, secrets, external traffic, role authorization, billing, device notifications or acceptance gates.
- Build/run the retained backend candidate against an isolated clean schema-037 database; record exact image digest, provision/setup path, migrations 036/037 if applicable, HTTP API contract, expectedQuote atomic merchant confirmation, role matrix, taxi/restaurant workflows and Floot release acceptance.
- No Production changes or unbudgeted resources are authorized by this clarification. This is an owner scope receipt and a roadmap simplification, not a completed deployment.

## Immediate safe action
Review the existing isolated schema-037 startup receipt and identify reusable ephemeral test harness for functional API smoke/E2E on a disposable database. Produce test evidence before lab/production promotion. Do not conflate the existing restored-copy migration checkpoint with the new clean-launch path.
