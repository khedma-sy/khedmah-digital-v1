"""Privacy and matching tests for local gcloud log diagnosis; no cloud."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / "scripts/diagnose-lab-secret-iam-log.py"
spec = importlib.util.spec_from_file_location("lab_log_diagnostic", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Diagnosis(unittest.TestCase):
    def test_finds_specific_failed_log_without_disclosing_its_contents(self):
        with tempfile.TemporaryDirectory() as config:
            logs = Path(config) / "logs" / "2026.11.15"
            logs.mkdir(parents=True)
            (logs / "good.log").write_text(
                "Running [gcloud.secrets.add-iam-policy-binding] with arguments: "
                "khedmah-lab-transition-sql khedmah-restore-lab-20261112\n"
                "ERROR: service account some-private-email does not exist. "
                "SECRET-SENTINEL-NEVER-PRINT\n")
            output = io.StringIO()
            with patch.dict(os.environ, {"CLOUDSDK_CONFIG": config}), contextlib.redirect_stdout(output):
                mod.main()
            value = output.getvalue()
            self.assertIn("MATCHING_FAILED_LOG_FOUND", value)
            self.assertIn("SERVICE_ACCOUNT_MISSING: True", value)
            self.assertIn("NOT_FOUND_OR_MISSING: True", value)
            self.assertIn("PROJECT_MARKER_PRESENT: True", value)
            self.assertNotIn("SECRET-SENTINEL-NEVER-PRINT", value)
            self.assertNotIn("some-private-email", value)

    def test_requires_both_secret_and_command_and_a_failure(self):
        self.assertIsNone(mod.inspect_log("ERROR " + mod.COMMAND))
        self.assertIsNone(mod.inspect_log("ERROR " + mod.SECRET))
        self.assertIsNone(mod.inspect_log(mod.COMMAND + " " + mod.SECRET + " success"))

    def test_multiple_hints_and_unknown_are_not_misreported_as_cause(self):
        prefix = mod.COMMAND + " " + mod.SECRET + "\nERROR: "
        result = mod.inspect_log(prefix + "PERMISSION_DENIED by organization policy")
        self.assertTrue(result["PERMISSION_DENIED"])
        self.assertTrue(result["ORG_POLICY"])
        unknown = mod.inspect_log(prefix + "unrecognized error text")
        self.assertFalse(any(unknown.values()))

    def test_exact_lab_account_is_distinguished_from_other_missing_accounts(self):
        prefix = mod.COMMAND + " " + mod.SECRET + "\nERROR: INVALID_ARGUMENT: "
        exact = mod.inspect_log(prefix + "Service account [" + mod.LAB_PRINCIPAL + "] does not exist.")
        other = mod.inspect_log(prefix + "Service account another@example.com does not exist.")
        self.assertTrue(exact["EXACT_LAB_ACCOUNT_MISSING"])
        self.assertFalse(other["EXACT_LAB_ACCOUNT_MISSING"])

    def test_missing_directory_is_reported_as_no_match(self):
        with tempfile.TemporaryDirectory() as folder:
            state, when, result = mod.classify(Path(folder) / "absent")
            self.assertEqual(state, "NO_MATCHING_FAILED_LOG")
            self.assertIsNone(when)
            self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
