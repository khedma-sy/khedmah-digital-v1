# AGENTS.md

## Scope

These instructions apply to the entire Khedmah Digital V1 repository.

## Mission Rules

- Treat this repository as the official source of truth for Khedmah Digital V1.
- For continuation and repair work, first read the live checkpoint at the top of `ROADMAP-EXECUTION-2026-09-08.md`, then verify the remote PR head and its workflow results. Read `docs/operations/SITE-ATLAS.md` only for the relevant page ownership and contracts.
- Resume the checkpoint's next unfinished action. Do not restart a whole-repository review or reimplement completed passes just because a conversation changed. Inspect subsequent commits and local changes before choosing the next action.
- Update that same checkpoint after a completed repair pass or before handing work off: implementation commit, exact validation evidence, unresolved blocker, next concrete action, and relevant files. Do not create another root report or present unverified work as complete.
- Owner instruction, 2026-09-10: use **خدمة ديجتل** only for the platform's principal/main brand title. Keep **خدمة** for assistant wording, buttons, functional labels, product journeys, descriptive copy and other in-app wording unless the owner explicitly names another title surface. Do not perform a broad replacement. Keep the existing umbrella symbol, slogan «تحت مظلة واحدة», and canonical navy/green/orange palette unless the owner separately changes them.
- Owner instruction, 2026-09-09: complete functional repairs and verification before changing page colors. Preserve current colors, layout, header and umbrella identity throughout repair passes; the full-page color redesign is a separate later phase, not authorized for this pass.
- Preserve the Arabic-first product direction.
- Preserve the business growth platform philosophy.
- Preserve the `أنا مع خدمة` brand direction as a historical/future-facing community expression; do not rename it automatically from the principal-title decision.
- Protect V1 scope. Do not expand V1 without approved governance documentation.
- Do not implement product features during documentation or governance missions.
- Do not create backend APIs, frontend screens, database models, migrations, or production infrastructure unless a mission explicitly authorizes implementation.

## Documentation Rules

- Keep governance, product, architecture, contracts, operations, decisions, and vision documents consistent with each other.
- Future modules must remain documented as reserved or future scope only.
- Use clear Markdown headings and repository-relative links.
- Do not include secrets, credentials, tokens, or production URLs.
