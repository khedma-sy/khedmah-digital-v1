import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "plan-bootstrap-state-adoption.py"
spec = importlib.util.spec_from_file_location("bootstrap_adoption", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def base_report():
    secrets = sorted(module.RUNTIME_SECRET_NAMES | module.SPECIAL_SECRET_NAMES)
    return {
        "project": module.PROJECT,
        "region": module.REGION,
        "secretPayloadsRead": False,
        "cloudMutations": False,
        "results": {
            "service_accounts": {
                "status": "COLLECTED",
                "data": [
                    {"email": module.LEGACY_SERVICE_ACCOUNTS["runtime"], "disabled": False},
                    {"email": module.LEGACY_SERVICE_ACCOUNTS["deployer"], "disabled": False},
                    {"email": module.CANONICAL_SERVICE_ACCOUNTS["build"], "disabled": False},
                    {"email": module.CANONICAL_SERVICE_ACCOUNTS["migration"], "disabled": False},
                ],
            },
            "secret_names": {
                "status": "COLLECTED",
                "data": [{"name": f"projects/311026134906/secrets/{name}"} for name in secrets],
            },
            "artifact_repositories": {
                "status": "COLLECTED",
                "data": [
                    {
                        "name": "projects/khedma-dl/locations/europe-west1/repositories/khedmah-digital",
                        "format": "DOCKER",
                    }
                ],
            },
            "buckets": {
                "status": "COLLECTED",
                "data": [
                    {
                        "name": "khedma-dl-cloudbuild-source",
                        "location": "EUROPE-WEST1",
                    }
                ],
            },
            "sql_instances": {
                "status": "COLLECTED",
                "data": [
                    {
                        "name": "khedmah-v1-db",
                        "region": "europe-west1",
                        "databaseVersion": "POSTGRES_16",
                        "settings": {
                            "tier": "db-f1-micro",
                            "availabilityType": "ZONAL",
                            "deletionProtectionEnabled": True,
                            "backupConfiguration": {"startTime": "20:00"},
                        },
                    }
                ],
            },
            "sql_databases": {
                "status": "COLLECTED",
                "data": [{"name": "postgres"}, {"name": "khedmah"}],
            },
            "wif_pools": {
                "status": "COLLECTED",
                "data": [
                    {
                        "name": "projects/311026134906/locations/global/workloadIdentityPools/khedmah-github",
                        "state": "ACTIVE",
                    }
                ],
            },
            "wif_providers": {
                "status": "COLLECTED",
                "data": [
                    {
                        "name": "projects/311026134906/locations/global/workloadIdentityPools/khedmah-github/providers/github-actions",
                        "state": "ACTIVE",
                        "attributeCondition": (
                            'attribute.repository == "khedma-sy/khedmah-digital-v1" && '
                            'attribute.repository_id == "1307435925" && '
                            'attribute.repository_owner_id == "307214577" && '
                            'attribute.ref == "refs/heads/main"'
                        ),
                        "attributeMapping": {
                            "attribute.repository_id": "assertion.repository_id",
                            "attribute.repository_owner_id": "assertion.repository_owner_id",
                        },
                        "oidc": {"issuerUri": "https://token.actions.githubusercontent.com"},
                    }
                ],
            },
            "cloud_run_services": {"status": "COLLECTED", "data": []},
        },
    }


class BootstrapAdoptionManifestTests(unittest.TestCase):
    def test_live_legacy_identity_split_is_never_treated_as_importable_canonical_identity(self):
        manifest = module.build_manifest(base_report())
        by_identity = {
            item.get("identity"): item
            for item in manifest["resources"]
            if item.get("identity")
        }

        self.assertEqual(
            by_identity[module.CANONICAL_SERVICE_ACCOUNTS["runtime"]]["classification"],
            "CREATE_LATER",
        )
        self.assertEqual(
            by_identity[module.CANONICAL_SERVICE_ACCOUNTS["deployer"]]["classification"],
            "CREATE_LATER",
        )
        self.assertEqual(
            by_identity[module.CANONICAL_SERVICE_ACCOUNTS["build"]]["classification"],
            "IMPORT_CANDIDATE",
        )
        self.assertEqual(
            by_identity[module.CANONICAL_SERVICE_ACCOUNTS["migration"]]["classification"],
            "IMPORT_CANDIDATE",
        )
        self.assertEqual(
            by_identity[module.LEGACY_SERVICE_ACCOUNTS["runtime"]]["classification"],
            "HOLD_LEGACY",
        )
        self.assertEqual(
            by_identity[module.LEGACY_SERVICE_ACCOUNTS["deployer"]]["classification"],
            "HOLD_LEGACY",
        )

    def test_known_sql_and_wif_drift_are_explicit_hold_points(self):
        manifest = module.build_manifest(base_report())
        by_kind_name = {(x["kind"], x["name"]): x for x in manifest["resources"]}

        self.assertEqual(
            by_kind_name[("cloud_sql_instance", "khedmah-v1-db")]["classification"],
            "IMPORT_THEN_REVIEW_DRIFT",
        )
        self.assertIn("20:00", by_kind_name[("cloud_sql_instance", "khedmah-v1-db")]["reason"])
        self.assertEqual(
            by_kind_name[("wif_provider", "github-actions")]["classification"],
            "IMPORT_THEN_REVIEW_DRIFT",
        )

    def test_existing_secret_containers_are_import_candidates_without_payload_access(self):
        manifest = module.build_manifest(base_report())
        secret_items = [x for x in manifest["resources"] if x["kind"] == "secret_container"]

        self.assertEqual(
            {x["name"] for x in secret_items},
            module.RUNTIME_SECRET_NAMES | module.SPECIAL_SECRET_NAMES,
        )
        self.assertTrue(all(x["classification"] == "IMPORT_CANDIDATE" for x in secret_items))
        self.assertFalse(manifest["secretPayloadsRequired"])

    def test_manifest_never_authorizes_state_or_cloud_mutation(self):
        manifest = module.build_manifest(base_report())
        self.assertFalse(manifest["stateMutationAuthorized"])
        self.assertFalse(manifest["cloudMutationAuthorized"])
        self.assertIn("no terraform import/apply", manifest["nextPhase"])

    def test_wrong_project_region_or_mutating_inventory_is_rejected(self):
        for field, value in (
            ("project", "wrong-project"),
            ("region", "us-central1"),
            ("secretPayloadsRead", True),
            ("cloudMutations", True),
        ):
            report = base_report()
            report[field] = value
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    module.build_manifest(report)

    def test_cli_reads_only_the_given_local_json_file(self):
        report = base_report()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "inventory.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(module.main([str(path)]), 0)

        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("subprocess", source)
        self.assertNotIn("gcloud ", source)
        self.assertNotIn("terraform import", source)
        self.assertNotIn("terraform apply", source)


if __name__ == "__main__":
    unittest.main()
