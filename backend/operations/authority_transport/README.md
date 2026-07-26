# OP-004A Authenticated Authority Transport Foundation

This foundation receives signed Policy and Role authority envelopes, authenticates their identities against a trusted in-process authority registry, verifies Ed25519 integrity, timestamp freshness, and correlation, and only then passes their payloads to OP-003C.

Lifecycle is `RECEIVED → AUTHENTICATED → VERIFIED`. No authentication provider, login/session/JWT/OAuth system, API gateway, persistence, UI, infrastructure, runtime engine, business capability, or business behavior is implemented.

