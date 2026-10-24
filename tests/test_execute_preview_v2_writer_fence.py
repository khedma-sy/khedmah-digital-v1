"""Offline tests for the Preview V2 writer-fence operator."""
import datetime
import importlib.util
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "writer_fence_operator", ROOT / "scripts/execute-preview-v2-writer-fence.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def receipt():
    return {
        "stage": "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED",
        "authority": {"all_granted": True},
        "service_state": {
            "tagged_revision_count": 0,
            "serving_revision_count": 1,
            "latest_ready_revision": m.OLD_REVISION,
            "runtime_service_account_matches": True,
            "service_scaling": {"maxInstanceCount": 20},
            "traffic": [{"revision": m.OLD_REVISION, "percent": 100, "tag": None}],
        },
        "database_activity": {
            "read_only": "on",
            "runtime_sessions_total": 0,
            "migrator_sessions_other": 0,
            "other_sessions_by_identity": 0,
        },
    }

class WriterFenceOperatorTests(unittest.TestCase):
    def test_plan_is_non_mutating_and_does_not_run_migrations(self):
        p = m.plan()
        self.assertFalse(p["execution_enabled_by_default"])
        self.assertFalse(p["migrations_executed"])
        self.assertFalse(p["candidate_deployed"])
        self.assertFalse(p["production_mutation"])
        self.assertFalse(p["floot_gate_activation"])
        self.assertFalse(p["missing_monitoring_data_is_proof"])
        self.assertFalse(p["elapsed_time_alone_is_proof"])

    def test_preflight_requires_exact_old_revision_and_zero_tags(self):
        m.require_preflight(receipt())
        bad = receipt()
        bad["service_state"]["tagged_revision_count"] = 1
        with self.assertRaisesRegex(SystemExit, "TAGGED_REVISION_PRESENT"):
            m.require_preflight(bad)

    def test_execute_requires_explicit_confirmation_before_any_read(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(m, "read_successor") as read:
            with self.assertRaisesRegex(SystemExit, "EXPLICIT_FENCE_CONFIRMATION_REQUIRED"):
                m.execute()
            read.assert_not_called()

    def test_disable_uses_manual_scaling_zero(self):
        response = '{"scaling":{"scalingMode":"MANUAL","manualInstanceCount":0},"trafficStatuses":[]}'
        completed = subprocess.CompletedProcess([], 0, response, "")
        with patch.object(m, "run", return_value=completed) as run:
            m.disable_service()
        args = run.call_args.args[0]
        self.assertIn("--scaling=0", args)
        self.assertNotIn("update-traffic", args)

    def test_disable_accepts_gcloud_annotation_shape(self):
        response = '{"metadata":{"annotations":{"run.googleapis.com/scalingMode":"manual","run.googleapis.com/manualInstanceCount":"0"}},"status":{"traffic":[{"revisionName":"khedmah-pr-274-backend-00008-tg8","percent":100}]}}'
        completed = subprocess.CompletedProcess([], 0, response, "")
        with patch.object(m, "run", return_value=completed):
            m.disable_service()

    def test_disable_rejects_missing_manual_zero_evidence(self):
        response = '{"metadata":{"annotations":{}},"status":{"traffic":[]}}'
        completed = subprocess.CompletedProcess([], 0, response, "")
        with patch.object(m, "run", return_value=completed):
            with self.assertRaisesRegex(SystemExit, "SERVICE_NOT_MANUAL_ZERO"):
                m.disable_service()

    def test_wait_requires_explicit_zero_metric_point(self):
        when = datetime.datetime.now(datetime.timezone.utc)
        with patch.object(m, "monitoring_instance_count", side_effect=[
            {"explicit_zero_after_disable": False, "latest_point_end": None},
            {"explicit_zero_after_disable": True, "latest_point_end": when},
        ]), patch.object(m.time, "sleep") as sleep:
            result = m.wait_for_instance_zero(when)
        self.assertTrue(result["explicit_zero_after_disable"])
        sleep.assert_called_once_with(15)

    def test_final_database_zero_requires_disabled_service(self):
        good = receipt()
        good["service_state"]["service_scaling"] = {
            "scalingMode": "MANUAL", "manualInstanceCount": 0
        }
        with patch.object(m, "read_successor", return_value=good):
            self.assertEqual(m.final_database_zero(), good)
        bad = receipt()
        with patch.object(m, "read_successor", return_value=bad):
            with self.assertRaisesRegex(SystemExit, "SERVICE_NOT_DISABLED_FINAL"):
                m.final_database_zero()

    def test_source_has_no_migration_candidate_or_revision_deletion(self):
        source = (ROOT / "scripts/execute-preview-v2-writer-fence.py").read_text()
        self.assertNotIn("036_classifieds", source)
        self.assertNotIn("037_verification", source)
        self.assertNotIn("2146d382d426", source)
        self.assertNotIn("revisions\", \"delete", source)
        self.assertNotIn("--args", source)
        self.assertNotIn("deploy_maintenance", source)
        self.assertIn("--scaling=0", source)

if __name__ == "__main__":
    unittest.main()
