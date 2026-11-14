"""Offline fail-closed checks for the exact lab/org IAM deny metadata reader."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/inspect-recovery-lab-deny-policies-readonly.py"
spec = importlib.util.spec_from_file_location("lab_deny_reader", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class TestLabDenyReadonly(unittest.TestCase):
    def test_no_policies_never_certifies_iam_or_spending(self):
        outcome = m.classify([], [])
        self.assertEqual(outcome["result"], "DENY_POLICY_METADATA_ONLY_NO_GO")
        self.assertEqual(outcome["project_deny_policy_count"], 0)
        self.assertFalse(outcome["denies_require_private_review"])
        self.assertEqual(outcome["planning_budget_ceiling_usd"], 20)
        for field in ("effective_iam_verified", "principal_access_boundaries_verified",
                      "private_network_verified", "all_in_quote_verified",
                      "budget_is_hard_cloud_spend_cap", "paid_resource_setup_authorized",
                      "restore_authorized", "production_release_authorized",
                      "cloud_resource_mutation"):
            self.assertIs(outcome[field], False)

    def test_private_deny_policy_contents_never_leak(self):
        secret_policy = {"name": "policies/a/denypolicies/private", "rules": [
            {"denyRule": {"deniedPrincipals": ["user:secret@example.invalid"]}}
        ]}
        outcome = m.classify([secret_policy], [])
        self.assertTrue(outcome["denies_require_private_review"])
        self.assertEqual(outcome["project_deny_policy_count"], 1)
        self.assertNotIn("secret@example.invalid", json.dumps(outcome))

    def test_invalid_policy_list_fails_closed(self):
        for example in (None, {}, "[]", [{"id": "missing-name"}], [{"name": ""}]):
            with self.subTest(example=str(example)), self.assertRaisesRegex(
                    SystemExit, "DENY_POLICY_LIST_INCOMPLETE_OR_INVALID"):
                m.classify(example, [])

    def test_only_exact_read_scopes_and_quiet_subprocess(self):
        for scope in ("lab", "organization"):
            with self.subTest(scope=scope), patch.object(
                    m.subprocess, "run", return_value=SimpleNamespace(
                        returncode=0, stdout=b"[]")) as run:
                self.assertEqual(m.read_policy_list(scope), [])
                args = run.call_args.args[0]
                self.assertIn("--attachment-point=" + m.ATTACHMENTS[scope], args)
                self.assertIn("--project=" + m.TARGET, args)
                self.assertEqual(args[-1], "--format=json")
                self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_USER_OUTPUT_ENABLED"], "true")
                self.assertEqual(run.call_args.kwargs["input"], b"")
                for forbidden in ("create", "delete", "update", "enable", "restore",
                                  "set-iam-policy", "disable"):
                    self.assertNotIn(forbidden, args)
        with patch.object(m.subprocess, "run") as run:
            with self.assertRaisesRegex(SystemExit, "UNKNOWN_ATTACHMENT_SCOPE"):
                m.read_policy_list("source")
            run.assert_not_called()

    def test_fail_closed_on_api_errors_and_mutation_mode(self):
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
                returncode=1, stdout=b"")):
            with self.assertRaisesRegex(SystemExit, "DENY_POLICY_READ_UNAVAILABLE"):
                m.read_policy_list("lab")
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout=b'{"policies":[]}')):
            with self.assertRaisesRegex(SystemExit, "DENY_POLICY_LIST_INCOMPLETE_OR_INVALID"):
                m.read_policy_list("lab")
        with patch.object(m, "read_policy_list") as read:
            with self.assertRaisesRegex(SystemExit, "READ_ONLY_INSPECT_ONLY"):
                m.main(["--execute"])
            read.assert_not_called()


if __name__ == "__main__":
    unittest.main()
