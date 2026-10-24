"""Offline tests for the Preview V2 writer-fence live operator."""
import importlib.util
import json
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

def old_receipt():
    return {
        "stage": "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED",
        "authority": {"all_granted": True},
        "service_state": {
            "tagged_revision_count": 0,
            "serving_revision_count": 1,
            "latest_ready_revision": m.OLD_REVISION,
            "runtime_service_account_matches": True,
            "traffic": [{"revision": m.OLD_REVISION, "percent": 100, "tag": None}],
        },
        "database_activity": {
            "read_only": "on",
            "runtime_sessions_total": 0,
            "migrator_sessions_other": 0,
            "other_sessions_by_identity": 0,
        },
    }

def maintenance_receipt(runtime=0):
    return {
        "stage": "PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED",
        "authority": {"all_granted": True},
        "service_state": {
            "tagged_revision_count": 0,
            "serving_revision_count": 1,
            "latest_ready_revision": m.MAINT_REVISION,
            "runtime_service_account_matches": True,
            "traffic": [{"revision": m.MAINT_REVISION, "percent": 100, "tag": None}],
        },
        "database_activity": {
            "read_only": "on",
            "runtime_sessions_total": runtime,
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

    def test_preflight_requires_exact_old_revision_and_zero_tags(self):
        m.require_preflight(old_receipt())
        bad = old_receipt()
        bad["service_state"]["tagged_revision_count"] = 1
        with self.assertRaisesRegex(SystemExit, "TAGGED_REVISION_PRESENT"):
            m.require_preflight(bad)

    def test_maintenance_only_requires_exact_revision_and_no_tag(self):
        self.assertTrue(m.receipt_is_maintenance_only(maintenance_receipt()))
        bad = maintenance_receipt()
        bad["service_state"]["traffic"][0]["tag"] = "debug"
        self.assertFalse(m.receipt_is_maintenance_only(bad))

    def test_execute_requires_explicit_confirmation_before_any_read(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(m, "read_successor") as read:
            with self.assertRaisesRegex(SystemExit, "EXPLICIT_FENCE_CONFIRMATION_REQUIRED"):
                m.execute()
            read.assert_not_called()

    def test_deploy_command_clears_database_bindings_and_starts_without_traffic(self):
        calls = []
        def fake_run(args, check=True):
            calls.append(args)
            if "describe" in args:
                return subprocess.CompletedProcess(args, 1, "", "NOT_FOUND")
            return subprocess.CompletedProcess(args, 0, "{}", "")
        with patch.object(m, "run", side_effect=fake_run), patch.object(m, "revision_exists", side_effect=[False, True]):
            m.deploy_maintenance()
        cmd = next(c for c in calls if "services" in c and "update" in c)
        for flag in ("--no-traffic", "--clear-env-vars", "--clear-secrets",
                     "--clear-cloudsql-instances", "--clear-volumes", "--clear-volume-mounts"):
            self.assertIn(flag, cmd)
        self.assertIn(m.CURRENT_IMAGE, cmd)

    def test_wait_never_accepts_elapsed_time_without_zero_session_receipt(self):
        with patch.object(m, "read_successor", side_effect=[maintenance_receipt(2), maintenance_receipt(0)]),              patch.object(m.time, "sleep") as sleep:
            result = m.wait_for_database_quiescence()
        self.assertEqual(result["database_activity"]["runtime_sessions_total"], 0)
        sleep.assert_called_once_with(5)

    def test_source_has_no_migration_or_candidate_deploy(self):
        source = (ROOT / "scripts/execute-preview-v2-writer-fence.py").read_text()
        self.assertNotIn("036_classifieds", source)
        self.assertNotIn("037_verification", source)
        self.assertNotIn("2146d382d426", source)
        self.assertIn("migrations_executed", source)
        self.assertIn("False", source)

if __name__ == "__main__":
    unittest.main()
