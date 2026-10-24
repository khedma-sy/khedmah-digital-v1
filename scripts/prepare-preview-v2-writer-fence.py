#!/usr/bin/env python3
"""Prepare the Preview V2 writer-fence plan offline; never mutate Cloud Run or PostgreSQL."""
import json
import sys

PROJECT = "khedmah-preview-v2-20261012"
REGION = "europe-west1"
SERVICE = "khedmah-pr-274-backend"
SERVING_REVISION = "khedmah-pr-274-backend-00008-tg8"
SERVING_IMAGE_DIGEST = "sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17"
CANDIDATE_IMAGE = (
    "europe-west1-docker.pkg.dev/khedmah-preview-v2-20261012/"
    "khedmah-preview/backend@sha256:"
    "2146d382d426568a510b6e76ff06129934e84beb86bc81c348454fe3e29e260e"
)

def stop(code):
    raise SystemExit("STOP: " + code)

def plan():
    return {
        "stage": "PREVIEW_V2_WRITER_FENCE_DESIGN_PREPARED",
        "project": PROJECT,
        "region": REGION,
        "service": SERVICE,
        "known_serving_revision": SERVING_REVISION,
        "known_serving_image_digest": SERVING_IMAGE_DIGEST,
        "candidate_image": CANDIDATE_IMAGE,
        "authority_gate_required": True,
        "authority_all_granted_observed": True,
        "current_tagged_revision_count_required": 0,
        "current_single_serving_revision_required": True,
        "maintenance_revision": {
            "purpose": "HTTP maintenance only; no database client initialization",
            "reuse_current_immutable_image": True,
            "override_entrypoint_required": True,
            "must_not_receive_database_secret": True,
            "must_not_receive_migration_secret": True,
        },
        "future_reviewed_mutation_sequence": [
            "re-read exact service generation and fail on drift",
            "create inert maintenance revision from the proven current immutable image with no DB secrets",
            "move 100 percent service traffic to that maintenance revision and require zero tags",
            "delete/retire every older application revision after it has zero traffic",
            "re-read revision inventory and require only the maintenance revision reachable",
            "open fresh read-only database observation and require zero runtime sessions and zero other unexpected writers",
            "only then mark writer_quiescence_verified=true for the bounded migration operator",
            "run the already prepared atomic 036+037 transaction with fresh predecessor locks",
            "require commit acknowledgement plus an independent exact readback",
            "deploy the pinned compatible candidate image and accept it before promotion",
        ],
        "fail_closed_on": [
            "service generation drift",
            "any tagged revision",
            "more than one reachable application revision",
            "maintenance revision using database credentials",
            "old application revision still present after retirement step",
            "runtime or unexpected database session present",
            "unknown migration commit outcome",
        ],
        "execution_enabled": False,
        "cloud_access_performed": False,
        "cloud_resource_mutation": False,
        "database_access_performed": False,
        "database_mutation": False,
        "schema_mutation": False,
        "traffic_mutation": False,
        "scaling_mutation": False,
        "production_mutation": False,
        "floot_gate_activation": False,
        "writer_quiescence_verified": False,
    }

def main(argv):
    if argv != ["--plan"]:
        stop("USE_OFFLINE_PLAN_ONLY")
    print(json.dumps(plan(), sort_keys=True))

if __name__ == "__main__":
    main(sys.argv[1:])
