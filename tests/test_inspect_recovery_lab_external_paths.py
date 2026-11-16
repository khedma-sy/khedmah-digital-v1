"""Read-only recovery-lab external network inspection tests."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
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


if __name__ == "__main__": unittest.main()
