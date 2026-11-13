"""Offline tests for source-only recent automated backup candidate inspection."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts/inspect-preview-backup-candidate-readonly.py"
spec = importlib.util.spec_from_file_location("backup_candidate", SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
NOW = datetime(2026, 11, 12, 17, 0, tzinfo=timezone.utc)


def fixture():
    ins = {"name": m.INSTANCE, "region": m.REGION, "state": "RUNNABLE",
           "databaseVersion": "POSTGRES_16",
           "settings": {"backupConfiguration": {"enabled": True}}}
    b = [{"id": 1794448800000, "type": "AUTOMATED", "status": "SUCCESSFUL",
          "endTime": "2026-11-12T02:52:14.307Z"},
         {"id": 1794362400000, "type": "AUTOMATED", "status": "SUCCESSFUL",
          "endTime": "2026-11-11T02:50:00Z"}]
    return ins, b


class TestSourceOnlyBackupCandidate(unittest.TestCase):
    def test_success_is_not_restore_authorization(self):
        ins, backups = fixture()
        out = m.classify(ins, backups, NOW)
        self.assertEqual(out["result"], "FRESH_BACKUP_CANDIDATE_ONLY_NO_GO")
        self.assertEqual(out["candidate_backup_id"], "1794448800000")
        for key in ("restore_authorized", "target_network_verified", "target_iam_verified",
                    "source_writer_fenced", "total_cost_approved",
                    "production_release_authorized", "cloud_resource_mutation"):
            self.assertIs(out[key], False)
        self.assertNotIn("password", json.dumps(out).lower())

    def test_fails_closed_on_wrong_instance_or_backup_config(self):
        ins, b = fixture()
        ins["name"] = "khedmah-preview-v2-db-copy"
        with self.assertRaisesRegex(SystemExit, "IDENTITY_MISMATCH"):
            m.classify(ins, b, NOW)
        ins, b = fixture()
        ins["settings"]["backupConfiguration"]["enabled"] = False
        with self.assertRaisesRegex(SystemExit, "BACKUPS_NOT_ENABLED"):
            m.classify(ins, b, NOW)

    def test_stale_failed_and_empty_lists_stopped(self):
        ins, b = fixture()
        with self.assertRaisesRegex(SystemExit, "BACKUP_LIST_MISSING"):
            m.classify(ins, [], NOW)
        for item in b:
            item["endTime"] = "2026-11-01T02:52:14Z"
        with self.assertRaisesRegex(SystemExit, "NO_RECENT_SUCCESSFUL"):
            m.classify(ins, b, NOW)
        ins, b = fixture()
        for item in b:
            item["status"] = "FAILED"
        with self.assertRaisesRegex(SystemExit, "NO_RECENT_SUCCESSFUL"):
            m.classify(ins, b, NOW)

    def test_exact_source_gcloud_read_only_scope(self):
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
            returncode=0, stdout=b"[]")) as run:
            self.assertEqual(m.read_cloud("backups"), [])
            args = run.call_args.args[0]
            self.assertIn("--project=" + m.PROJECT, args)
            self.assertEqual(args[-1], "--format=json")
            self.assertNotIn(m.DESTINATION_PROJECT, args)
            self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_USER_OUTPUT_ENABLED"], "true")
            self.assertIs(run.call_args.kwargs["stderr"], m.subprocess.DEVNULL)
            self.assertIs(run.call_args.kwargs["stdout"], m.subprocess.PIPE)
            for word in ("create", "delete", "update", "restore", "enable", "patch"):
                self.assertNotIn(word, args)
        with patch.object(m.subprocess, "run") as run:
            with self.assertRaisesRegex(SystemExit, "READ_SCOPE_NOT_ALLOWED"):
                m.read_cloud("restore")
            run.assert_not_called()

    def test_unknown_mode_and_gcloud_errors_do_not_mutate(self):
        with patch.object(m, "read_cloud") as read:
            with self.assertRaisesRegex(SystemExit, "READ_ONLY_INSPECT_ONLY"):
                m.main(["--restore"])
            read.assert_not_called()
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
            returncode=1, stdout=b"")):
            with self.assertRaisesRegex(SystemExit, "CLOUD_READ_UNAVAILABLE"):
                m.read_cloud("instance")


if __name__ == "__main__":
    unittest.main()
