#!/usr/bin/env python3
"""Offline-only Preview V2 maintenance entrypoint contract.

The maintenance process is a single Node standard-library HTTP listener.
It does not import Khedmah, open a database, call an API or run migrations.
This file NEVER deploys it, builds an image, modifies Cloud Run or authorizes
a writer fence. Any future live operator MUST independently prove that a
separate least-privilege service account has no DB or secret privileges,
and MUST construct a NEW minimal template (not inherit the old template).
"""
import json
import sys

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
OLD_REVISION = "khedmah-pr-274-backend-00008-tg8"
OLD_IMAGE_DIGEST = "sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17"
CANDIDATE_DIGEST = "sha256:2146d382d426568a510b6e76ff06129934e84beb86bc81c348454fe3e29e260e"

# Not copied to a separate image. This is intended only for a *future*
# reviewed Cloud Run revision command/args override of the already-pinned
# existing backend image. No environment or secrets may be inherited.
NODE_INLINE = (
    'const http=require("node:http");'
    'const raw=process.env.PORT||"8080";'
    'const port=Number(raw);'
    'if(!Number.isInteger(port)||port<1||port>65535){process.exit(2);}'
    'const server=http.createServer((_req,res)=>{'
    'res.writeHead(503,{"content-type":"application/json; charset=utf-8",'
    '"cache-control":"no-store","retry-after":"60",'
    '"x-content-type-options":"nosniff"});'
    'res.end(JSON.stringify({code:"PREVIEW_MAINTENANCE",available:false}));'
    '});'
    'server.requestTimeout=30000;server.headersTimeout=10000;'
    'server.listen(port,"0.0.0.0");'
)


def stop(code):
    raise SystemExit("STOP: " + code)


def plan():
    return {
        "stage": "PREVIEW_V2_MAINTENANCE_ENTRYPOINT_PREPARED_OFFLINE",
        "target": {"project": PROJECT, "region": REGION, "service": SERVICE},
        "known_old_revision": OLD_REVISION,
        "known_old_image_digest": OLD_IMAGE_DIGEST,
        "candidate_image_digest": CANDIDATE_DIGEST,
        "command": ["node", "-e"],
        "args": [NODE_INLINE],
        "expected_http_status": 503,
        "new_revision_required": True,
        "maintenance_template_requirements": {
            "minimal_template_replacement_not_patch_merge": True,
            "exact_proven_old_image_digest": True,
            "no_database_environment_variables": True,
            "no_database_volume_mounts": True,
            "no_cloudsql_connections": True,
            "no_secret_manager_env_or_volumes": True,
            "no_application_startup_hooks": True,
            "dedicated_no_database_access_service_account": True,
            "external_iam_review_and_denial_proof_required": True,
        },
        "next_operator_must_prove": [
            "generation precondition and exact Cloud Run service identity",
            "independent maintenance service account has no DB/secret access",
            "old revision has zero tags, no alternate reachable URLs",
            "maintenance revision is inert and only it receives traffic",
            "all old application revisions are retired before DB writer check",
            "complete fresh DB identity and external-writer inventory",
            "atomic migration 036+037 commit acknowledged and separate readback",
            "candidate pinned image, startup and Google session E2E",
        ],
        "source_only": True,
        "maintenance_service_account_provisioned_or_verified": False,
        "writer_quiescence_verified": False,
        "schema_036_037_ready": False,
        "release_authorized": False,
        "execution_enabled": False,
        "cloud_mutation": False,
        "database_mutation": False,
        "production_mutation": False,
    }


def main(argv):
    if argv != ["--plan"]:
        stop("OFFLINE_PLAN_ONLY")
    print(json.dumps(plan(), sort_keys=True))


if __name__ == "__main__":
    main(sys.argv[1:])
