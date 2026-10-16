"""Offline contract tests: no real credential, cloud request, email or deployment."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("resend_config", Path(__file__).resolve().parents[1]
    / "scripts" / "stage-preview-v2-resend-config.py")
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
KEY = b"re_offline_fixture_not_a_real_key"
VERSION = {"name": M.PARENT + "/versions/1", "state": "ENABLED"}


class FakeCloud:
    def __init__(self):
        self.versions = []
        self.payload = KEY
        self.calls = []
        self.project = {"projectId": M.PROJECT, "projectNumber": M.NUMBER,
            "lifecycleState": "ACTIVE", "parent": {"id": M.ORGANIZATION, "type": "organization"}}
        self.overrides = {}
        self.fail = None
        self.race = False
        self.lists = 0

    def __call__(self, command, **options):
        self.calls.append((command, options))
        self_key = command[1:4]
        value = None
        if self_key[:2] == ["config", "get-value"]:
            return subprocess.CompletedProcess(command, 0, b"(unset)\n", b"")
        if self_key == ["config", "list", "api_endpoint_overrides/"]:
            value = self.overrides
        elif self_key[:2] == ["auth", "list"]:
            value = [{"account": M.ACCOUNT}]
        elif self_key[:2] == ["projects", "describe"]:
            value = self.project
        elif self_key[:2] == ["secrets", "describe"]:
            value = {"name": M.PARENT}
        elif self_key == ["secrets", "versions", "list"]:
            self.lists += 1
            if self.race and self.lists == 2:
                self.versions = [VERSION.copy()]
            value = self.versions
        elif self_key == ["secrets", "versions", "describe"]:
            value = self.versions[0]
        elif self_key == ["secrets", "versions", "add"]:
            self.versions = [VERSION.copy()]
            if self.fail == "ambiguous_write":
                raise subprocess.TimeoutExpired(command, 90, output=KEY, stderr=KEY)
            value = VERSION
        elif self_key == ["secrets", "versions", "access"]:
            if self.fail == "access_denied":
                return subprocess.CompletedProcess(command, 1, KEY, KEY)
            return subprocess.CompletedProcess(command, 0, self.payload, b"")
        else:
            raise AssertionError("Unexpected operation: " + repr(command))
        return subprocess.CompletedProcess(command, 0, json.dumps(value).encode(), b"")

    def writes(self):
        return [item for item in self.calls if item[0][1:4] == ["secrets", "versions", "add"]]


class ResendConfigTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name) / "attempt"
        self.fake = FakeCloud()
        self.output = io.StringIO()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(os.environ, {}, clear=True))
        self.stack.enter_context(patch.object(M.subprocess, "run", side_effect=self.fake))
        self.input = self.stack.enter_context(patch.object(M, "read_key", return_value=KEY))
        self.stack.enter_context(contextlib.redirect_stdout(self.output))

    def run_helper(self):
        M.run(self.directory)

    def test_first_write_is_scoped_private_and_verified(self):
        self.run_helper()
        writes = self.fake.writes()
        self.assertEqual(len(writes), 1)
        self.assertIn("--data-file=-", writes[0][0])
        self.assertEqual(writes[0][1]["input"], KEY)
        for command, options in self.fake.calls:
            self.assertIn("--project=" + M.PROJECT, command)
            self.assertIn("--account=" + M.ACCOUNT, command)
            self.assertNotIn(KEY.decode(), repr(command))
            self.assertNotIn(KEY.decode(), repr(options["env"]))
            self.assertEqual(options["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
            self.assertEqual(options["env"]["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true")
        self.assertNotIn(KEY.decode(), self.output.getvalue())
        result = json.loads(self.output.getvalue().splitlines()[-1])
        self.assertTrue(result["created"])
        self.assertTrue(result["value_verified"])
        self.assertFalse(result["email_delivery_verified"])
        marker = self.directory / "version-attempt.json"
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o700)
        self.assertNotIn(KEY.decode(), marker.read_text())

    def test_existing_matching_version_is_read_only(self):
        self.fake.versions = [VERSION.copy()]
        self.run_helper()
        self.assertFalse(self.fake.writes())
        self.assertFalse(json.loads(self.output.getvalue().splitlines()[-1])["created"])

    def test_existing_different_value_is_never_overwritten(self):
        self.fake.versions = [VERSION.copy()]
        self.fake.payload = b"different"
        with self.assertRaisesRegex(SystemExit, "STORED_VALUE_MISMATCH"):
            self.run_helper()
        self.assertFalse(self.fake.writes())

    def test_conflicting_inventory_stops_before_input(self):
        for versions in ([dict(VERSION, state="DISABLED")], [VERSION, VERSION],
                         [dict(VERSION, name=M.PARENT + "/versions/2")]):
            with self.subTest(versions=versions):
                self.fake.versions = versions
                with self.assertRaises(SystemExit):
                    self.run_helper()
        self.input.assert_not_called()
        self.assertFalse(self.fake.writes())

    def test_wrong_project_number_or_parent_stops_before_input(self):
        for key, bad in (("projectId", "wrong"), ("projectNumber", "1"),
                         ("parent", {}), ("lifecycleState", "DELETE_REQUESTED")):
            with self.subTest(key=key), patch.dict(self.fake.project, {key: bad}):
                with self.assertRaisesRegex(SystemExit, "PROJECT_IDENTITY"):
                    self.run_helper()
        self.input.assert_not_called()

    def test_auth_and_endpoint_overrides_stop_before_input(self):
        for key in ("CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
                    "CLOUDSDK_API_ENDPOINT_OVERRIDES_SECRET_MANAGER"):
            with self.subTest(key=key), patch.dict(os.environ, {key: "override"}):
                with self.assertRaisesRegex(SystemExit, "OVERRIDE_PRESENT"):
                    self.run_helper()
        self.fake.overrides = {"api_endpoint_overrides": {"secret_manager": "override"}}
        with self.assertRaisesRegex(SystemExit, "API_ENDPOINT_OVERRIDE"):
            self.run_helper()
        self.input.assert_not_called()

    def test_ambiguous_write_can_only_resume_by_matching_existing_version(self):
        self.fake.fail = "ambiguous_write"
        with self.assertRaisesRegex(SystemExit, "UNCONFIRMED_RECONCILE"):
            self.run_helper()
        self.assertNotIn(KEY.decode(), self.output.getvalue())
        self.fake.fail = None
        self.run_helper()
        self.assertEqual(len(self.fake.writes()), 1)

    def test_previous_attempt_with_empty_inventory_blocks_retry(self):
        M.mark_attempt(M.marker_path(self.directory))
        with self.assertRaisesRegex(SystemExit, "PREVIOUS_WRITE_ATTEMPT"):
            self.run_helper()
        self.input.assert_not_called()
        self.assertFalse(self.fake.writes())

    def test_another_writer_before_add_is_verified_without_add(self):
        self.fake.race = True
        self.run_helper()
        self.assertFalse(self.fake.writes())

    def test_readback_denial_has_no_payload_or_success_verdict(self):
        self.fake.fail = "access_denied"
        with self.assertRaisesRegex(SystemExit, "FAILED_RECONCILE") as error:
            self.run_helper()
        self.assertNotIn(KEY.decode(), str(error.exception) + self.output.getvalue())
        self.assertNotIn("CONFIG_STAGED", self.output.getvalue())

    def test_symlink_or_public_attempt_directory_rejected(self):
        self.directory.symlink_to(Path(self.tmp.name), target_is_directory=True)
        with self.assertRaisesRegex(SystemExit, "ATTEMPT_PATH_REJECTED"):
            self.run_helper()
        self.directory.unlink()
        self.directory.mkdir(mode=0o700)
        self.directory.chmod(0o755)
        with self.assertRaisesRegex(SystemExit, "NOT_PRIVATE"):
            self.run_helper()
        self.input.assert_not_called()


class HiddenInputTest(unittest.TestCase):
    def test_hidden_input_confirmation_and_syntax(self):
        with patch.object(M.sys.stdin, "isatty", return_value=True), \
             patch.object(M.sys.stderr, "isatty", return_value=True):
            for values, error in (([KEY.decode(), KEY.decode()], None),
                                  ([KEY.decode(), "different"], "CONFIRMATION"),
                                  (["bad", "bad"], "FORMAT")):
                with self.subTest(error=error), patch.object(M.getpass, "getpass", side_effect=values):
                    if error:
                        with self.assertRaisesRegex(SystemExit, error):
                            M.read_key()
                    else:
                        self.assertEqual(M.read_key(), KEY)

    def test_no_terminal_or_echo_fallback_never_reads_key(self):
        with patch.object(M.sys.stdin, "isatty", return_value=False), \
             patch.object(M.getpass, "getpass") as reader:
            with self.assertRaisesRegex(SystemExit, "INTERACTIVE_TERMINAL"):
                M.read_key()
            reader.assert_not_called()
        with patch.object(M.sys.stdin, "isatty", return_value=True), \
             patch.object(M.sys.stderr, "isatty", return_value=True), \
             patch.object(M.getpass, "getpass", side_effect=M.getpass.GetPassWarning):
            with self.assertRaisesRegex(SystemExit, "HIDDEN_INPUT_UNAVAILABLE"):
                M.read_key()


if __name__ == "__main__":
    unittest.main()
