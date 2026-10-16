"""Boundary tests for the owner-run metadata reader; all cloud calls are mocked."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("reader", Path(__file__).resolve().parents[1]
                                           / "scripts/read-preview-v2-application-config.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class ApplicationConfigTests(unittest.TestCase):
    def fixture(self, *, firebase=False, wrong_project=False, deny=False, override=False):
        calls = []
        def execute(args, **kwargs):
            calls.append(args)
            self.assertIn("--project=" + reader.PROJECT, args)
            self.assertIn("--account=" + reader.ACCOUNT, args)
            self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
            self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
            result, code, error = None, 0, ""
            if args[1:3] == ["config", "get-value"]:
                return subprocess.CompletedProcess(args, 0, "override" if override else "(unset)", "")
            if args[1:3] == ["auth", "print-access-token"]:
                return subprocess.CompletedProcess(args, 0, "DO_NOT_PRINT_TOKEN", "")
            if args[1:3] == ["projects", "describe"]:
                result = dict(projectId="other" if wrong_project else reader.PROJECT,
                              projectNumber=reader.NUMBER, lifecycleState="ACTIVE",
                              parent=dict(type="organization", id=reader.ORGANIZATION))
            elif args[1:3] == ["services", "list"]:
                result = [{"config": {"name": "firebase.googleapis.com"}}] if firebase else []
            elif args[1:3] == ["secrets", "describe"]:
                result = {"name": "projects/" + reader.NUMBER + "/secrets/" + args[3]}
            elif args[1:4] == ["secrets", "versions", "describe"]:
                self.assertEqual(args[4], "latest")
                code = 1
                error = ("PERMISSION_DENIED" if deny else "NOT_FOUND") + " DO_NOT_PRINT_ERROR"
            else:
                self.fail("Unexpected command: " + str(args[:3]))
            return subprocess.CompletedProcess(args, code, json.dumps(result), error)
        return calls, execute

    def invoke(self, execute):
        output = io.StringIO()
        with patch.dict(reader.os.environ, {}, clear=True), patch.object(reader.subprocess, "run", execute), contextlib.redirect_stdout(output):
            reader.run()
        self.assertNotIn("DO_NOT_PRINT", output.getvalue())
        return [json.loads(line) for line in output.getvalue().splitlines()]

    def test_missing_versions_reported_without_payload_or_firebase_access(self):
        calls, execute = self.fixture()
        with patch.object(reader.urllib.request, "build_opener", side_effect=AssertionError("API disabled")):
            rows = self.invoke(execute)
        secrets = [r for r in rows if r["stage"] == "APPLICATION_SECRET_METADATA"]
        self.assertEqual(len(secrets), 9)
        self.assertTrue(all(r["latest"]["outcome"] == "NOT_FOUND_REPORTED" for r in secrets))
        self.assertFalse(rows[-1]["configuration_values_verified"])
        self.assertFalse(any("DATABASE_URL" in " ".join(c) or "access" in c or "enable" in c for c in calls))
        self.assertFalse(any(c[1:3] == ["auth", "print-access-token"] for c in calls))

    def test_denial_is_not_absence_and_raw_error_is_redacted(self):
        _, execute = self.fixture(deny=True)
        rows = self.invoke(execute)
        self.assertTrue(all(r["latest"] == {"outcome": "PERMISSION_DENIED"}
                            for r in rows if r["stage"] == "APPLICATION_SECRET_METADATA"))

    def test_wrong_project_and_auth_override_stop_before_resource_inventory(self):
        for kwargs, code in [({"wrong_project": True}, "PROJECT_IDENTITY_MISMATCH"),
                             ({"override": True}, "AUTH_OVERRIDE_PRESENT")]:
            calls, execute = self.fixture(**kwargs)
            with self.assertRaisesRegex(SystemExit, code):
                self.invoke(execute)
            self.assertFalse(any(c[1] in ("services", "secrets", "auth") for c in calls))

    def test_enabled_latest_version_and_foreign_namespace_rejection(self):
        for foreign in (False, True):
            _, execute = self.fixture()
            def version(args, **kwargs):
                if args[1:4] == ["secrets", "versions", "describe"]:
                    secret = args[5].split("=", 1)[1]
                    name = "projects/" + ("other" if foreign else reader.NUMBER) + "/secrets/" + secret + "/versions/3"
                    return subprocess.CompletedProcess(args, 0, json.dumps(dict(name=name, state="ENABLED")), "")
                return execute(args, **kwargs)
            if foreign:
                with self.assertRaisesRegex(SystemExit, "INVALID_SECRET_VERSION_METADATA"):
                    self.invoke(version)
            else:
                rows = self.invoke(version)
                self.assertTrue(all(r["latest"]["state"] == "ENABLED" for r in rows
                                    if r["stage"] == "APPLICATION_SECRET_METADATA"))

    def test_firebase_gets_are_fixed_project_and_paginate_without_sdk_config(self):
        _, execute = self.fixture(firebase=True)
        requests = []
        project = dict(name="projects/" + reader.PROJECT, projectId=reader.PROJECT,
                       projectNumber=reader.NUMBER, state="ACTIVE")
        def app(n):
            return dict(name="projects/" + reader.PROJECT + "/webApps/app" + str(n),
                        projectId=reader.PROJECT, state="ACTIVE")
        responses = [project, dict(apps=[app(1)], nextPageToken="next/+"), dict(apps=[app(2)])]
        class Opener:
            def open(_self, request, timeout):
                requests.append(request)
                return io.BytesIO(json.dumps(responses.pop(0)).encode())
        with patch.object(reader.urllib.request, "build_opener", return_value=Opener()):
            rows = self.invoke(execute)
        self.assertEqual(rows[-2]["active_app_count"], 2)
        for request in requests:
            self.assertEqual(request.get_method(), "GET")
            self.assertTrue(request.full_url.startswith("https://firebase.googleapis.com/v1beta1/projects/" + reader.PROJECT))
            self.assertNotIn("/config", request.full_url)
            self.assertIsNone(request.data)
        self.assertIn("pageToken=next%2F%2B", requests[-1].full_url)

    def test_firebase_denial_stops_app_reads_and_does_not_imply_absence(self):
        _, execute = self.fixture(firebase=True)
        with patch.object(reader.urllib.request, "build_opener") as opener:
            opener.return_value.open.side_effect = urllib.error.HTTPError("x", 403, "DO_NOT_PRINT_ERROR", {}, None)
            rows = self.invoke(execute)
        self.assertEqual(opener.return_value.open.call_count, 1)
        self.assertEqual(rows[-2]["outcome"], "PERMISSION_DENIED")
        self.assertTrue(rows[-2]["existence_unconfirmed"])
        self.assertIsNone(reader.NoRedirect().redirect_request(None, None, None, None, None, None))


if __name__ == "__main__":
    unittest.main()
