"""Offline regression tests: Recovery Lab read-only admission is not a GO."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/inspect-recovery-lab-readonly.py"
spec = importlib.util.spec_from_file_location("recovery_lab_guard", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    return {
        "identity": {"projectId": m.TARGET, "projectNumber": m.NUMBER,
                     "lifecycleState": "ACTIVE", "parent": {"id": m.ORG, "type": "organization"}},
        "billing": {"projectId": m.TARGET, "billingEnabled": False},
        "services": [],
        "project_iam": {"bindings": [{"role": "roles/owner", "members": ["user:dummy@example.invalid"]}]},
        "org_iam": {"bindings": [
            {"role": "roles/billing.admin", "members": ["user:dummy@example.invalid"]},
            {"role": "roles/cloudasset.viewer", "members": ["serviceAccount:test@example.invalid"]},
        ]},
    }


class TestRecoveryLabSafety(unittest.TestCase):
    def test_initial_clean_receipt_cannot_authorize_resource_changes(self):
        receipt = m.classify(fixture())
        self.assertEqual(receipt["result"], "INITIAL_INVENTORY_ONLY_NO_GO")
        for name in ("effective_iam_verified", "network_isolation_verified",
                     "pricing_approved", "restore_authorized", "production_release_authorized",
                     "cloud_resource_mutation"):
            self.assertFalse(receipt[name])
        self.assertNotIn("example.invalid", json.dumps(receipt))

    def test_wrong_target_parent_or_billing_stops(self):
        for field, value in (("projectId", "khedma-dl-e409d"), ("projectNumber", "123"),
                             ("parent", {"type": "organization", "id": "wrong"}),
                             ("lifecycleState", "DELETE_REQUESTED")):
            data = fixture()
            data["identity"][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(SystemExit, "IDENTITY_MISMATCH"):
                m.classify(data)
        data = fixture()
        data["billing"]["billingEnabled"] = True
        with self.assertRaisesRegex(SystemExit, "BILLING_NOT_DISABLED"):
            m.classify(data)

    def test_apis_and_unexpected_iam_fail_closed(self):
        data = fixture()
        data["services"] = [{"config": {"name": "sqladmin.googleapis.com"}}]
        with self.assertRaisesRegex(SystemExit, "ENABLED_SERVICES_NOT_EMPTY"):
            m.classify(data)
        data = fixture()
        data["project_iam"]["bindings"].append(
            {"role": "roles/editor", "members": ["user:dummy@example.invalid"]})
        with self.assertRaisesRegex(SystemExit, "PROJECT_IAM_CHANGED"):
            m.classify(data)
        data = fixture()
        data["org_iam"]["bindings"].append({"role": "roles/viewer", "members": ["allUsers"]})
        with self.assertRaisesRegex(SystemExit, "ORG_PRINCIPAL_TYPES"):
            m.classify(data)

    def test_read_only_command_scope_and_no_execute_mode(self):
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
            returncode=0, stdout=b"{}")) as runner:
            m.gcloud_read("identity")
        args = runner.call_args.args[0]
        self.assertEqual(args[:2], ["gcloud", "--quiet"])
        self.assertIn("--project=" + m.TARGET, args)
        self.assertEqual(args[-1], "--format=json")
        self.assertTrue(all(word not in args for word in (
            "create", "enable", "disable", "update", "delete", "restore", "set-iam-policy")))
        self.assertEqual(runner.call_args.kwargs["env"]["CLOUDSDK_CORE_DISABLE_PROMPTS"], "1")
        with patch.object(m, "gcloud_read") as cloud:
            with self.assertRaisesRegex(SystemExit, "READ_ONLY_INSPECT_ONLY"):
                m.main(["--execute"])
            cloud.assert_not_called()

    def test_cloud_failure_fails_closed_without_leaking_stderr(self):
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
            returncode=1, stdout=b"failed")):
            with self.assertRaisesRegex(SystemExit, "CLOUD_READ_UNAVAILABLE"):
                m.gcloud_read("identity")


if __name__ == "__main__":
    unittest.main()
