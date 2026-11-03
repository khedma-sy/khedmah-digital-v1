"""Offline/loopback safety tests for the Preview V2 maintenance entrypoint."""
import importlib.util
import json
import os
import shutil
from pathlib import Path
import socket
import subprocess
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

entry = load("scripts/prepare-preview-v2-maintenance-entrypoint.py", "maintenance_entrypoint")
old = load("scripts/execute-preview-v2-writer-fence.py", "historical_writer_fence")


class MaintenanceEntrypointTests(unittest.TestCase):
    def test_plan_is_inert_and_never_authorizes_a_release(self):
        p = entry.plan()
        self.assertEqual(p["stage"], "PREVIEW_V2_MAINTENANCE_ENTRYPOINT_PREPARED_OFFLINE")
        self.assertEqual(p["known_old_revision"], "khedmah-pr-274-backend-00008-tg8")
        self.assertEqual(p["command"], ["node", "-e"])
        self.assertEqual(p["args"], [entry.NODE_INLINE])
        self.assertEqual(p["expected_http_status"], 503)
        self.assertFalse(p["maintenance_service_account_provisioned_or_verified"])
        for key in ("writer_quiescence_verified", "schema_036_037_ready",
                    "release_authorized", "execution_enabled",
                    "cloud_mutation", "database_mutation", "production_mutation"):
            self.assertIs(p[key], False, key)

    def test_replacement_template_must_not_inherit_secrets_or_identity(self):
        required = entry.plan()["maintenance_template_requirements"]
        for key in ("minimal_template_replacement_not_patch_merge",
                    "exact_proven_old_image_digest",
                    "no_database_environment_variables",
                    "no_database_volume_mounts",
                    "no_cloudsql_connections",
                    "no_secret_manager_env_or_volumes",
                    "no_application_startup_hooks",
                    "dedicated_no_database_access_service_account",
                    "external_iam_review_and_denial_proof_required"):
            self.assertIs(required[key], True, key)

    def test_inline_server_has_no_application_database_or_cloud_dependencies(self):
        src = entry.NODE_INLINE
        self.assertIn('require("node:http")', src)
        self.assertNotIn("process.env.DATABASE_URL", src)
        for token in ("pg", "firebase", "google-auth", "fetch(", "import(", "child_process",
                      "require('fs')", 'require("node:fs")', "exec("):
            self.assertNotIn(token, src)
        self.assertIn("PREVIEW_MAINTENANCE", src)
        self.assertIn("no-store", src)

    def test_maintenance_node_returns_503_to_all_auth_routes(self):
        # The planned immutable image is Node based; this verifies just the
        # inert entrypoint locally. It is NOT proof of cloud image compatibility.
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node.js must exist in the test runner PATH")
        proc = subprocess.Popen(
            [node, "-e", entry.NODE_INLINE], env={"PORT": str(port)},
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True
        )
        try:
            deadline = time.monotonic() + 8
            while True:
                try:
                    req = urllib.request.Request(
                        f"http://127.0.0.1:{port}/api/v1/auth/google",
                        data=b"{}", method="POST",
                    )
                    with self.assertRaises(urllib.error.HTTPError) as captured:
                        urllib.request.urlopen(req, timeout=0.5)
                    err = captured.exception
                    self.assertEqual(err.code, 503)
                    self.assertEqual(err.headers["Cache-Control"], "no-store")
                    self.assertEqual(err.headers["Retry-After"], "60")
                    self.assertEqual(json.loads(err.read()), {
                        "code": "PREVIEW_MAINTENANCE", "available": False
                    })
                    err.close()
                    break
                except urllib.error.URLError:
                    if time.monotonic() >= deadline or proc.poll() is not None:
                        self.fail("inert HTTP listener did not start")
                    time.sleep(0.1)
        finally:
            proc.terminate()
            try:
                proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate(timeout=5)

    def test_legacy_execute_remains_forbidden_even_with_confirmation(self):
        with patch.dict(os.environ, {old.CONFIRM_ENV: old.CONFIRM_VALUE}), \
             patch.object(old, "read_successor") as reader, \
             patch.object(old, "disable_service") as mutation:
            with self.assertRaisesRegex(SystemExit, "LEGACY_WRITER_FENCE_REPLAY_FORBIDDEN"):
                old.execute()
            reader.assert_not_called()
            mutation.assert_not_called()

    def test_cli_rejects_any_execution_request(self):
        with self.assertRaisesRegex(SystemExit, "OFFLINE_PLAN_ONLY"):
            entry.main(["--execute"])


if __name__ == "__main__":
    unittest.main()
