"""Offline, no-cloud safety checks for stable disabled Cloud Run assessment."""
import datetime as dt
import importlib.util
import io
from unittest.mock import patch
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "stable_zero", ROOT / "scripts" / "assess-preview-v2-stable-manual-zero.py"
)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

NOW = dt.datetime(2026, 11, 3, 16, 0, 0, tzinfo=dt.timezone.utc)


def service_fixture(update="2026-10-24T20:40:32Z"):
    return {
        "name": m.FULL_SERVICE,
        "uid": "example-stable-uid",
        "generation": "8",
        "observedGeneration": "8",
        "reconciling": False,
        "terminalCondition": {"state": "CONDITION_SUCCEEDED"},
        "scaling": {"scalingMode": "MANUAL", "manualInstanceCount": 0},
        "latestReadyRevision": m.FULL_REVISION,
        "updateTime": update,
        "template": {"timeout": "300s"},
        "trafficStatuses": [{"revision": m.FULL_REVISION, "percent": 100}],
    }


def successor_fixture():
    return {
        "stage": "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED",
        "project": m.PROJECT,
        "region": m.REGION,
        "evidence_utc": "2026-11-03T16:01:00+00:00",
        "authority": {"all_granted": True, "policy_troubleshooter_complete": True},
        "service_state": {
            "tagged_revision_count": 0,
            "latest_ready_revision": m.REVISION,
            "serving_revision_count": 1,
            "template_uses_candidate_image": False,
            "service_scaling": {"scalingMode": "MANUAL", "manualInstanceCount": 0},
            "traffic": [{"revision": m.REVISION, "percent": 100, "tag": None}],
        },
        "database_activity": {
            "read_only": "on",
            "runtime_sessions_total": 0,
            "migrator_sessions_other": 0,
            "other_sessions_by_identity": 0,
        },
    }


class ExistingZeroTests(unittest.TestCase):
    def test_stable_manual_zero_is_a_review_candidate_not_release(self):
        state = m.service_state(service_fixture(), NOW)
        self.assertGreater(state["settled_seconds"], 3600 + 600)
        self.assertEqual(state["manual_instances"], 0)
        self.assertEqual(state["tagged_revision_count"], 0)
        result = m.require_zero_snapshot(
            successor_fixture(), NOW, NOW + dt.timedelta(minutes=5)
        )
        self.assertEqual(result["runtime_sessions_total"], 0)
        script = (ROOT / "scripts" / "assess-preview-v2-stable-manual-zero.py").read_text()
        self.assertIn('"writer_quiescence_verified": False', script)
        self.assertIn('"release_authorized": False', script)
        self.assertIn('"cloud_resource_mutation": False', script)
        self.assertNotIn("gcloud run services update", script)
        self.assertNotIn("run deploy", script)

    def test_recent_state_is_not_proof(self):
        with self.assertRaisesRegex(SystemExit, "SERVICE_ZERO_NOT_SETTLED_LONG_ENOUGH"):
            m.service_state(service_fixture("2026-11-03T15:59:00Z"), NOW)

    def test_tagged_revision_fails_closed(self):
        value = service_fixture()
        value["trafficStatuses"][0]["tag"] = "old"
        with self.assertRaisesRegex(SystemExit, "TRAFFIC_OR_TAG_DRIFT"):
            m.service_state(value, NOW)

    def test_nonzero_instances_rejected(self):
        value = service_fixture()
        value["scaling"]["manualInstanceCount"] = 1
        with self.assertRaisesRegex(SystemExit, "SERVICE_NOT_MANUAL_ZERO"):
            m.service_state(value, NOW)

    def test_unobserved_generation_rejected(self):
        value = service_fixture()
        value["observedGeneration"] = "7"
        with self.assertRaisesRegex(SystemExit, "SERVICE_RECONCILIATION_INCOMPLETE"):
            m.service_state(value, NOW)

    def test_forged_foreign_identity_rejected(self):
        value = service_fixture()
        value["name"] = "projects/other/locations/europe-west1/services/a"
        with self.assertRaisesRegex(SystemExit, "SERVICE_IDENTITY_DRIFT"):
            m.service_state(value, NOW)

    def test_successor_snapshot_must_be_fresh(self):
        with self.assertRaisesRegex(SystemExit, "SUCCESSOR_SNAPSHOT_NOT_FRESH"):
            m.require_zero_snapshot(
                successor_fixture(), NOW + dt.timedelta(minutes=2),
                NOW + dt.timedelta(minutes=5)
            )

    def test_successor_other_writer_blocks_candidate(self):
        value = successor_fixture()
        value["database_activity"]["other_sessions_by_identity"] = 1
        with self.assertRaisesRegex(SystemExit, "DATABASE_WRITERS_NOT_ZERO"):
            m.require_zero_snapshot(value, NOW, NOW + dt.timedelta(minutes=5))

    def test_missing_monitoring_cannot_convert_into_release(self):
        s = (ROOT / "scripts" / "assess-preview-v2-stable-manual-zero.py").read_text()
        self.assertIn('"missing_monitoring_metrics_are_zero_proof": False', s)
        self.assertIn('"independent_writer_inventory_review_required": True', s)
        self.assertNotIn('"writer_quiescence_verified": True', s)

    def test_rejected_cloud_get_closes_sensitive_error_stream(self):
        body = io.BytesIO(b"private-token-would-be-here")
        error = m.urllib.error.HTTPError(
            m.SERVICE_URL, 403, "private", {}, body,
        )
        with patch.object(m.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(SystemExit, "^STOP: CLOUD_RUN_GET_FAILED$"):
                m.get_service("test-access-token")
        self.assertTrue(body.closed)

    def test_invalid_invocation_fails_closed(self):
        with self.assertRaisesRegex(SystemExit, "USE_INSPECT_ONLY"):
            m.main(["--apply"])


if __name__ == "__main__":
    unittest.main()
