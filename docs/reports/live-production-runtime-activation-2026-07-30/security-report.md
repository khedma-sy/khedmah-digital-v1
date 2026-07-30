# Live Security Report

## Status

**NOT VERIFIED**

Repository secret values were not printed or accessed. However, live security cannot be certified because project access, IAM, WIF, service accounts, Secret Manager, OAuth clients, Maps keys, domains, Android fingerprints, audit logs, and runtime bindings were unavailable.

| Control | Result |
|---|---|
| Secret existence/version/rotation metadata | **NOT VERIFIED** |
| Runtime secret access and unauthorized denial | **NOT VERIFIED** |
| No user-managed service-account keys | **NOT VERIFIED** |
| Least-privilege IAM and separation of duties | **NOT VERIFIED** |
| WIF issuer/audience/subject conditions | **NOT VERIFIED** |
| OAuth origins/redirects/audiences | **NOT VERIFIED** |
| Maps/Places/Geocoding/Directions restrictions | **NOT VERIFIED** |
| Android package and SHA-1 restrictions | **NOT VERIFIED** |
| Allowed Web domains/referrers | **NOT VERIFIED** |
| Audit Logging and sensitive-log redaction | **NOT VERIFIED** |

The only affirmative security evidence from this attempt is procedural: preflight printed presence/missing states only and stopped before any secret access or production mutation.
