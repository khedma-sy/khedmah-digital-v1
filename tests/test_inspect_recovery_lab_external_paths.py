"""Read-only recovery-lab external network inspection tests."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import urllib.error
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / "scripts/inspect-recovery-lab-external-paths.py"
spec = importlib.util.spec_from_file_location("lab_paths", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ExternalPaths(unittest.TestCase):
    def test_main_reports_only_safe_results_and_never_claims_a_fence(self):
        urls = []
        def get(url, secret):
            self.assertEqual(secret, "synthetic-private-token")
            urls.append(url)
            path = url.split("?", 1)[0]
            if path == m.NCC: return {"spokes": []}
            if path == m.VPC: return {"locations": [{"locationId": m.REGION}]}
            if path == m.VPC + "/" + m.REGION + "/connectors": return {"connectors": []}
            if path == m.APP: raise m.Unavailable("HTTP_404")
            if path == m.ASSET: return {"assets": []}
            raise AssertionError(path)
        output = io.StringIO()
        with patch.object(m, "token", return_value="synthetic-private-token"), \
             patch.object(m, "read_json", side_effect=get), contextlib.redirect_stdout(output):
            self.assertEqual(m.main(), 0)
        for url in urls:
            self.assertTrue(url.startswith((m.NCC, m.VPC, m.APP, m.ASSET)))
            self.assertNotIn("synthetic-private-token", url)
        text = output.getvalue()
        self.assertIn("LAB_GLOBAL_NCC_SPOKES=EMPTY", text)
        self.assertIn("LAB_ALL_REGIONS_VPC_CONNECTORS=EMPTY", text)
        self.assertIn("LAB_APP_ENGINE_APPLICATION=ABSENT_HTTP_404", text)
        self.assertIn("LAB_ASSET_SNAPSHOT_MAY_BE_DELAYED=True", text)
        self.assertIn("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", text)
        self.assertIn("READ_ONLY_NO_CLOUD_MUTATIONS=True", text)
        self.assertNotIn("synthetic-private-token", text)

    def test_paginated_responses_reject_incomplete_or_repeated_pages(self):
        replies = [{"spokes": [{}], "nextPageToken": "page"}, {"spokes": [{}]}]
        with patch.object(m, "read_json", side_effect=replies):
            self.assertEqual(len(m.pages(m.NCC, "spokes", "token")), 2)
        for bad in ({"spokes": [], "unreachable": ["region"]},
                    {"spokes": [], "nextPageToken": 0}, {"error": {"message": "secret"}}):
            with patch.object(m, "read_json", return_value=bad):
                with self.assertRaises(m.Unavailable): m.pages(m.NCC, "spokes", "token")
        with patch.object(m, "read_json", return_value={"nextPageToken": "same"}):
            with self.assertRaisesRegex(m.Unavailable, "PAGINATION_INVALID"):
                m.pages(m.NCC, "spokes", "token")

    def test_locations_must_be_complete_and_valid(self):
        for data in ([], [{"locationId": []}], [{"locationId": "us-central1"}],
                     [{"locationId": m.REGION}, {"locationId": m.REGION}]):
            with patch.object(m, "pages", return_value=data):
                with self.assertRaisesRegex(m.Unavailable, "LOCATIONS_INVALID"):
                    m.connectors("token")

    def test_http_request_is_get_to_exact_endpoint_and_token_is_never_printed(self):
        captured = []
        class Opener:
            def open(self, request, timeout):
                captured.append(request)
                return io.BytesIO(json.dumps({"spokes": []}).encode())
        with patch.object(m.urllib.request, "build_opener", return_value=Opener()):
            m.read_json(m.NCC, "synthetic-token")
        self.assertEqual(captured[0].get_method(), "GET")
        self.assertEqual(captured[0].full_url, m.NCC)
        self.assertEqual(captured[0].get_header("Authorization"), "Bearer synthetic-token")

    def test_unavailable_access_is_not_reported_as_empty(self):
        output = io.StringIO()
        def fail(url, token): raise m.Unavailable("HTTP_403")
        with patch.object(m, "token", return_value="token"), patch.object(m, "read_json", side_effect=fail), \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(), 0)
        self.assertIn("LAB_GLOBAL_NCC_SPOKES=UNKNOWN_HTTP_403", output.getvalue())
        self.assertIn("LAB_ALL_REGIONS_VPC_CONNECTORS=UNKNOWN_HTTP_403", output.getvalue())
        self.assertNotIn("=EMPTY", output.getvalue())

    def test_google_403_reason_is_allowlisted_without_private_details(self):
        class Opener:
            def open(self, request, timeout):
                body = json.dumps({"error": {"message": "private detail", "details": [{
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo", "domain": "googleapis.com",
                    "reason": "SERVICE_DISABLED", "metadata": {"private": "secret"}}]}}).encode()
                raise urllib.error.HTTPError(request.full_url, 403, "forbidden", {}, io.BytesIO(body))
        with patch.object(m.urllib.request, "build_opener", return_value=Opener()):
            with self.assertRaises(m.Unavailable) as error:
                m.read_json(m.NCC, "synthetic-secret")
        self.assertEqual(str(error.exception), "HTTP_403_SERVICE_DISABLED")
        self.assertNotIn("private", str(error.exception)); self.assertNotIn("secret", str(error.exception))

    def test_403_diagnosis_reads_only_failed_services_and_never_claims_isolation(self):
        urls = []
        def get(url, secret):
            urls.append(url)
            if url.startswith(m.SERVICE_USAGE):
                service = url.split("/")[-1]
                return {"name": "projects/" + m.PROJECT_NUMBER + "/services/" + service,
                        "state": "DISABLED"}
            raise m.Unavailable("HTTP_403_SERVICE_DISABLED")
        output = io.StringIO()
        with patch.object(m, "token", return_value="private-token"), \
             patch.object(m, "read_json", side_effect=get), contextlib.redirect_stdout(output):
            self.assertEqual(m.diagnose_403(), 0)
        self.assertEqual(len(urls), 4)
        self.assertFalse(any(url.startswith(m.ASSET) for url in urls))
        self.assertIn("LAB_NCC_SERVICE=DISABLED", output.getvalue())
        self.assertIn("LAB_VPC_ACCESS_READ=UNKNOWN_HTTP_403_SERVICE_DISABLED", output.getvalue())
        self.assertIn("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", output.getvalue())
        self.assertNotIn("private-token", output.getvalue())

    def test_wrong_service_identity_is_unknown_not_disabled(self):
        output = io.StringIO()
        with patch.object(m, "token", return_value="token"), \
             patch.object(m, "read_json", return_value={"name": "wrong", "state": "DISABLED"}), \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.diagnose_403(), 0)
        self.assertIn("LAB_NCC_SERVICE=UNKNOWN_SERVICE_STATE_INVALID", output.getvalue())
        self.assertNotIn("LAB_NCC_SERVICE=DISABLED", output.getvalue())

    def test_quota_override_is_fixed_and_resource_remains_lab(self):
        captured = []
        class Opener:
            def open(self, request, timeout):
                captured.append(request)
                return io.BytesIO(b'{"spokes": []}')
        with patch.object(m.urllib.request, "build_opener", return_value=Opener()):
            m.read_json(m.NCC, "secret", quota_project=m.SHELL_QUOTA_PROJECT)
            with self.assertRaisesRegex(m.Unavailable, "QUOTA_PROJECT_UNEXPECTED"):
                m.read_json(m.NCC, "secret", quota_project="production")
        self.assertEqual(len(captured), 1)
        self.assertIn(m.PROJECT, captured[0].full_url)
        self.assertEqual(captured[0].get_header("X-goog-user-project"), m.SHELL_QUOTA_PROJECT)
        self.assertEqual(captured[0].get_method(), "GET")

    def test_quota_fallback_never_calls_a_write_or_claims_session_fence(self):
        calls = []
        def get(url, secret, quota_project=None):
            calls.append((url, quota_project))
            self.assertEqual(quota_project, m.SHELL_QUOTA_PROJECT)
            path = url.split("?", 1)[0]
            if path == m.NCC: return {"spokes": []}
            if path == m.VPC: return {"locations": [{"locationId": m.REGION}]}
            if path == m.VPC + "/" + m.REGION + "/connectors": return {"connectors": []}
            raise AssertionError(path)
        output = io.StringIO()
        with patch.object(m, "token", return_value="private-token"), \
             patch.object(m, "read_json", side_effect=get), contextlib.redirect_stdout(output):
            self.assertEqual(m.quota_fallback(), 0)
        self.assertEqual(len(calls), 3)
        self.assertIn("LAB_GLOBAL_NCC_SPOKES=EMPTY", output.getvalue())
        self.assertIn("LAB_ALL_REGIONS_VPC_CONNECTORS=EMPTY", output.getvalue())
        self.assertIn("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", output.getvalue())
        self.assertNotIn("private-token", output.getvalue())

    def test_execution_gate_rejects_unknown_or_nonempty_network_paths(self):
        def app_absent(url, token, quota_project=None): raise m.Unavailable("HTTP_404")
        with patch.object(m, "pages", return_value=[]) as pages, patch.object(m, "connectors", return_value=0) as connectors, \
             patch.object(m, "read_json", side_effect=app_absent):
            self.assertTrue(m.require_no_additional_network_paths("token"))
        pages.assert_called_once_with(m.NCC, "spokes", "token")
        connectors.assert_called_once_with("token")
        with patch.object(m, "pages", return_value=[{}]), patch.object(m, "connectors") as con:
            with self.assertRaisesRegex(m.Unavailable, "NCC_SPOKES_PRESENT"):
                m.require_no_additional_network_paths("token")
        con.assert_not_called()
        with patch.object(m, "pages", return_value=[]), patch.object(m, "connectors", return_value=1):
            with self.assertRaisesRegex(m.Unavailable, "VPC_CONNECTORS_PRESENT"):
                m.require_no_additional_network_paths("token")
        with patch.object(m, "pages", return_value=[]), patch.object(m, "connectors", return_value=0), \
             patch.object(m, "read_json", side_effect=m.Unavailable("HTTP_403")):
            with self.assertRaisesRegex(m.Unavailable, "APP_ENGINE_UNVERIFIED"):
                m.require_no_additional_network_paths("token")


if __name__ == "__main__": unittest.main()
