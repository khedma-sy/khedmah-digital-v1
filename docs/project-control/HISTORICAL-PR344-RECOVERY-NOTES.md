# Historical recovery draft notes

The following text was added by PR #344 against an older main. It is historical evidence, not current operational guidance. For current decisions use CURRENT-STATE.md and NEXT-ACTION.md.

## Original file: ROADMAP-EXECUTION-2026-09-08.md


## Google login recovery — live owner evidence and image-reference repair — 2026-11-05 UTC

Owner receipt at `2026-11-05T12:25:01.547562+00:00` reached `PREVIEW_V2_RUNTIME_LOGIN_READONLY_VERIFIED`: runtime login true, EXPECTED_GRANTS_PRESENT, exact ACLs, 62 allowed and 2 denied read probes. No application rows read/printed, schema/grant/cloud changes. The former missing runtime-credential receipt is now closed; this is not full schema, DML or Cloud Run network acceptance.

Subsequent owner Cloud Run reads: generation=observedGeneration=9, MANUAL/0, latest created/ready and sole untagged 100% target `khedmah-pr-274-backend-00008-tg8`. Service template references DATABASE_URL version 1 and the expected runtime identity/Cloud SQL instance. The revision independently has that identity and SQL attachment, and exact immutable digest `sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17`. Historical Ready/ContainerHealthy conditions do not prove present availability; TrafficShutDown is true. No restoration occurred in these reads.

**Concrete source defect repaired:** service template carries the exact historical `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a` tag, while the revision resolves it to a digest. The validator incorrectly required both strings to equal a digest. Implementation `8efdf4f22c7e4b86cab6c8fdebf179f0939175fa` accepts only that known service tag or the exact canonical digest reference, and independently requires the fixed revision's canonical repository plus digest. It does not resolve or deploy the mutable tag. Tests `9fec43dc896b0bd06264eb2012826a95bb9f5842`: 17 local Python cases pass; regression rejects arbitrary tags, foreign repositories with the same digest, and unresolved revision tags. Files: scripts/recover-preview-v2-login.py and tests/test_preview_v2_login_recovery.py. PR #344 remains validation-only; latest-head CI must be checked separately.

**Next concrete action:** finish current-head validation/review, then prepare the reviewed recovery operation and reconcile exclusion from 036/037 transitions, current schema compatibility and uncertain-operation handling. Existing successful owner receipts are evidence, not prompts to restart IAM/Monitoring discovery. Do not infer that historical 025/incomplete037 evidence proves today's full schema. A successful validateOnly call cannot authorize or perform restoration. No apply operator, migration, candidate deployment, merge, Floot publication or Google login success is claimed. Preserve the existing owner authorization; the remaining issue is technical gate evidence, not repeated generic consent.


## Historical checkpoint (superseded; retained for audit)

## Original file: docs/project-control/CURRENT-STATE.md


## Google login recovery — live owner evidence and image-reference repair — 2026-11-05 UTC

Owner receipt at `2026-11-05T12:25:01.547562+00:00` reached `PREVIEW_V2_RUNTIME_LOGIN_READONLY_VERIFIED`: runtime login true, EXPECTED_GRANTS_PRESENT, exact ACLs, 62 allowed and 2 denied read probes. No application rows read/printed, schema/grant/cloud changes. The former missing runtime-credential receipt is now closed; this is not full schema, DML or Cloud Run network acceptance.

Subsequent owner Cloud Run reads: generation=observedGeneration=9, MANUAL/0, latest created/ready and sole untagged 100% target `khedmah-pr-274-backend-00008-tg8`. Service template references DATABASE_URL version 1 and the expected runtime identity/Cloud SQL instance. The revision independently has that identity and SQL attachment, and exact immutable digest `sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17`. Historical Ready/ContainerHealthy conditions do not prove present availability; TrafficShutDown is true. No restoration occurred in these reads.

**Concrete source defect repaired:** service template carries the exact historical `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a` tag, while the revision resolves it to a digest. The validator incorrectly required both strings to equal a digest. Implementation `8efdf4f22c7e4b86cab6c8fdebf179f0939175fa` accepts only that known service tag or the exact canonical digest reference, and independently requires the fixed revision's canonical repository plus digest. It does not resolve or deploy the mutable tag. Tests `9fec43dc896b0bd06264eb2012826a95bb9f5842`: 17 local Python cases pass; regression rejects arbitrary tags, foreign repositories with the same digest, and unresolved revision tags. Files: scripts/recover-preview-v2-login.py and tests/test_preview_v2_login_recovery.py. PR #344 remains validation-only; latest-head CI must be checked separately.

**Next concrete action:** finish current-head validation/review, then prepare the reviewed recovery operation and reconcile exclusion from 036/037 transitions, current schema compatibility and uncertain-operation handling. Existing successful owner receipts are evidence, not prompts to restart IAM/Monitoring discovery. Do not infer that historical 025/incomplete037 evidence proves today's full schema. A successful validateOnly call cannot authorize or perform restoration. No apply operator, migration, candidate deployment, merge, Floot publication or Google login success is claimed. Preserve the existing owner authorization; the remaining issue is technical gate evidence, not repeated generic consent.


## Original file: docs/project-control/NEXT-ACTION.md


## Google login recovery — live owner evidence and image-reference repair — 2026-11-05 UTC

Owner receipt at `2026-11-05T12:25:01.547562+00:00` reached `PREVIEW_V2_RUNTIME_LOGIN_READONLY_VERIFIED`: runtime login true, EXPECTED_GRANTS_PRESENT, exact ACLs, 62 allowed and 2 denied read probes. No application rows read/printed, schema/grant/cloud changes. The former missing runtime-credential receipt is now closed; this is not full schema, DML or Cloud Run network acceptance.

Subsequent owner Cloud Run reads: generation=observedGeneration=9, MANUAL/0, latest created/ready and sole untagged 100% target `khedmah-pr-274-backend-00008-tg8`. Service template references DATABASE_URL version 1 and the expected runtime identity/Cloud SQL instance. The revision independently has that identity and SQL attachment, and exact immutable digest `sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17`. Historical Ready/ContainerHealthy conditions do not prove present availability; TrafficShutDown is true. No restoration occurred in these reads.

**Concrete source defect repaired:** service template carries the exact historical `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a` tag, while the revision resolves it to a digest. The validator incorrectly required both strings to equal a digest. Implementation `8efdf4f22c7e4b86cab6c8fdebf179f0939175fa` accepts only that known service tag or the exact canonical digest reference, and independently requires the fixed revision's canonical repository plus digest. It does not resolve or deploy the mutable tag. Tests `9fec43dc896b0bd06264eb2012826a95bb9f5842`: 17 local Python cases pass; regression rejects arbitrary tags, foreign repositories with the same digest, and unresolved revision tags. Files: scripts/recover-preview-v2-login.py and tests/test_preview_v2_login_recovery.py. PR #344 remains validation-only; latest-head CI must be checked separately.

**Next concrete action:** finish current-head validation/review, then prepare the reviewed recovery operation and reconcile exclusion from 036/037 transitions, current schema compatibility and uncertain-operation handling. Existing successful owner receipts are evidence, not prompts to restart IAM/Monitoring discovery. Do not infer that historical 025/incomplete037 evidence proves today's full schema. A successful validateOnly call cannot authorize or perform restoration. No apply operator, migration, candidate deployment, merge, Floot publication or Google login success is claimed. Preserve the existing owner authorization; the remaining issue is technical gate evidence, not repeated generic consent.



**Pinned old-image startup audit (2026-11-05):** source `f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a` has Dockerfile.backend CMD `node apps/backend/dist/main.js`; main.ts/app.ts create Nest and listen. DatabaseModule registers DatabaseMigrator, whose onModuleInit performs catalog/privilege SELECTs and requires canonical version **035**, not 037. Its AdSchemaGuard requires **025**. These sources do not execute migration DDL. Accordingly, absence of 036/037 alone is not an old-runtime startup incompatibility and must not be presented as one. This bounded audit does not establish all runtime hooks or today's complete schema compatibility.

**Next missing binding evidence:** old DatabasePool uses the Cloud SQL socket only when CLOUD_SQL_INSTANCE_CONNECTION_NAME is set; without it, DATABASE_URL's localhost host is used. Prior owner projections showed Cloud SQL attachment but not this variable or command/args overrides. Read only the fixed revision, emit whether the exact connection variable is present once and matches, and whether startup overrides are absent. Never print other environment values. Then reconcile the old-runtime recovery plan against actual schema and concurrent transitions; do not apply the newer migrations simply to repair authentication.


