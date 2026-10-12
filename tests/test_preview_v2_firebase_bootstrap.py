"""Exercise real bootstrap orchestration and HTTP boundaries using a recording fake."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

spec = importlib.util.spec_from_file_location("bootstrap", Path(__file__).resolve().parents[1]
                                           / "scripts/bootstrap-preview-v2-firebase.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def project():
    return dict(name=module.PARENT, projectId=module.PROJECT, projectNumber=module.NUMBER, state="ACTIVE")


def app():
    return dict(name=module.PARENT + "/webApps/opaque-app-id", appId="opaque-app-id",
                displayName=module.WEB_NAME, projectId=module.PROJECT, state="ACTIVE", apiKeyId="key-uid-metadata")


class FakeCloud:
    def __init__(self):
        self.exists = False
        self.apps = []
        self.calls, self.commands = [], []
        self.eligible, self.allowed = True, True
        self.project_denied = self.pending = self.fail_app_post = self.foreign_operation = False
        self.override = False
        self.gcp_id = module.PROJECT
        self.operations = {}

    def gcloud(self, args, **kwargs):
        self.commands.append(args)
        assert "--project=" + module.PROJECT in args
        assert "--account=" + module.ACCOUNT in args
        assert kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"] == "false"
        assert kwargs["stdin"] == subprocess.DEVNULL
        if args[1:3] == ["config", "get-value"]:
            return subprocess.CompletedProcess(args, 0, "override" if self.override else "(unset)", "")
        if args[1:3] == ["auth", "print-access-token"]:
            return subprocess.CompletedProcess(args, 0, "DO_NOT_PRINT_TOKEN", "")
        if args[1:3] == ["projects", "describe"]:
            data = dict(projectId=self.gcp_id, projectNumber=module.NUMBER, lifecycleState="ACTIVE",
                        parent=dict(type="organization", id=module.ORGANIZATION))
        elif args[1:3] == ["services", "list"]:
            data = [dict(config=dict(name=name)) for name in module.SERVICES]
        else:
            raise AssertionError("Unexpected gcloud command")
        return subprocess.CompletedProcess(args, 0, json.dumps(data), "")

    def open(self, request, timeout):
        url = urllib.parse.urlsplit(request.full_url)
        path = url.path
        method = request.get_method()
        body = json.loads(request.data) if request.data else None
        self.calls.append((method, request.full_url, body))
        assert request.headers["Authorization"] == "Bearer DO_NOT_PRINT_TOKEN"
        assert request.headers["X-goog-user-project"] == module.PROJECT
        assert timeout == 45
        if url.netloc == "cloudresourcemanager.googleapis.com":
            assert path == "/v3/" + module.PARENT + ":testIamPermissions"
            assert body == {"permissions": list(module.PERMISSIONS)}
            data = dict(permissions=list(module.PERMISSIONS) if self.allowed else [])
        else:
            assert url.netloc == "firebase.googleapis.com"
            path = path.removeprefix("/v1beta1/")
            if path == module.PARENT and method == "GET":
                if self.project_denied or not self.exists:
                    raise urllib.error.HTTPError(request.full_url, 403 if self.project_denied else 404,
                                                 "DO_NOT_PRINT_ERROR", {}, None)
                data = project()
            elif path == "availableProjects":
                query = urllib.parse.parse_qs(url.query)
                if "pageToken" not in query:
                    data = dict(projectInfo=[dict(project="projects/unrelated")], nextPageToken="page/+2")
                else:
                    assert query["pageToken"] == ["page/+2"]
                    data = dict(projectInfo=[dict(project=module.PARENT)] if self.eligible else [])
            elif path == module.PARENT + "/webApps" and method == "GET":
                assert urllib.parse.parse_qs(url.query)["showDeleted"] == ["true"]
                data = dict(apps=copy.deepcopy(self.apps))
            elif path == module.PARENT + ":addFirebase":
                assert method == "POST" and body == {}
                data = dict(name="operations/add-1", done=False)
                self.operations[data["name"]] = "project"
            elif path == module.PARENT + "/webApps" and method == "POST":
                assert body == dict(displayName=module.WEB_NAME)
                if self.fail_app_post:
                    raise OSError("DO_NOT_PRINT_ERROR")
                data = dict(name="operations/app-1", done=False)
                self.operations[data["name"]] = "app"
            elif path in self.operations:
                if self.pending:
                    data = dict(name=path, done=False)
                else:
                    kind = self.operations[path]
                    if kind == "project":
                        self.exists = True
                        response = project()
                        if self.foreign_operation:
                            response["projectId"] = "foreign"
                    else:
                        self.apps = [app()]
                        response = self.apps[0]
                    data = dict(name=path, done=True, response=response)
            else:
                raise AssertionError("Unexpected HTTP route")
        return io.BytesIO(json.dumps(data).encode())

    def mutations(self):
        return [call for call in self.calls if call[0] == "POST" and "testIamPermissions" not in call[1]]


class FirebaseBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / "journal"
        self.cloud = FakeCloud()
        self.output = io.StringIO()

    def run_helper(self, apply=True):
        with patch.dict(module.os.environ, {}, clear=True), patch.object(module.subprocess, "run", self.cloud.gcloud), \
                patch.object(module.urllib.request, "build_opener", return_value=self.cloud), \
                patch.object(module.time, "sleep"), contextlib.redirect_stdout(self.output):
            module.run(apply, self.directory)
        self.assertNotIn("DO_NOT_PRINT", self.output.getvalue())
        return [json.loads(line) for line in self.output.getvalue().splitlines()]

    def test_plan_lists_complete_eligibility_without_cloud_writes_or_local_journal(self):
        rows = self.run_helper(False)
        self.assertEqual(self.cloud.mutations(), [])
        self.assertFalse(self.directory.exists())
        self.assertEqual(rows[-1]["stage"], "PREVIEW_FIREBASE_PLAN_COMPLETE_NO_MUTATION")
        self.assertTrue(rows[-2]["add_firebase"])
        self.assertEqual(len([c for c in self.cloud.calls if "availableProjects" in c[1]]), 2)

    def test_fresh_apply_creates_exact_project_and_app_then_rerun_is_read_only(self):
        rows = self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)
        self.assertEqual(rows[-1]["stage"], "PREVIEW_V2_FIREBASE_PROJECT_AND_WEB_APP_VERIFIED")
        for field in ("browser_configuration_ready", "auth_providers_configured", "secret_versions_created",
                      "sdk_configuration_read", "api_key_restrictions_verified", "application_deployed", "floot_connected"):
            self.assertFalse(rows[-1][field])
        self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)
        journal = self.directory / "state.json"
        self.assertEqual(journal.stat().st_mode & 0o777, 0o600)
        self.assertNotIn("DO_NOT_PRINT", journal.read_text())
        self.assertNotIn("key-uid-metadata", journal.read_text())
        self.assertTrue(all(v["verified"] for v in json.loads(journal.read_text())["stages"].values()))

    def test_existing_exact_app_is_verified_without_mutations(self):
        self.cloud.exists, self.cloud.apps = True, [app()]
        self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])

    def test_denial_never_becomes_creation_eligibility(self):
        self.cloud.project_denied = True
        with self.assertRaisesRegex(SystemExit, "HTTP_403"):
            self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])
        self.assertFalse(any("availableProjects" in call[1] for call in self.cloud.calls))
        self.assertNotIn("DO_NOT_PRINT", self.output.getvalue())

    def test_missing_permission_and_ineligible_target_stop_without_mutations(self):
        for field, code in (("allowed", "PERMISSIONS_INCOMPLETE"), ("eligible", "ELIGIBILITY_UNCONFIRMED")):
            self.cloud = FakeCloud()
            setattr(self.cloud, field, False)
            with self.assertRaisesRegex(SystemExit, code):
                self.run_helper()
            self.assertEqual(self.cloud.mutations(), [])

    def test_project_mismatch_and_auth_override_stop_before_http(self):
        for field, value, code in (("gcp_id", "foreign", "PROJECT_IDENTITY_MISMATCH"),
                                   ("override", True, "AUTH_OVERRIDE_PRESENT")):
            self.cloud = FakeCloud()
            setattr(self.cloud, field, value)
            with self.assertRaisesRegex(SystemExit, code):
                self.run_helper()
            self.assertEqual(self.cloud.calls, [])

    def test_conflicting_duplicate_deleted_foreign_or_unready_apps_never_mutate(self):
        variants = [[app(), app()], [dict(app(), displayName="Other app")],
                    [dict(app(), projectId="foreign")], [dict(app(), state="DELETED")],
                    [dict(app(), apiKeyId="")]]
        for apps in variants:
            self.cloud = FakeCloud()
            self.cloud.exists, self.cloud.apps = True, apps
            with self.assertRaises(SystemExit):
                self.run_helper()
            self.assertEqual(self.cloud.mutations(), [])

    def test_unconfirmed_app_post_is_never_repeated_and_live_unique_app_can_reconcile(self):
        self.cloud.fail_app_post = True
        with self.assertRaisesRegex(SystemExit, "API_REQUEST_UNCONFIRMED"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)
        with self.assertRaisesRegex(SystemExit, "UNCONFIRMED_CREATE_WEB_APP"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)
        self.cloud.apps = [app()]
        self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)

    def test_acknowledged_pending_operation_resumes_without_duplicate_post(self):
        self.cloud.pending = True
        with self.assertRaisesRegex(SystemExit, "OPERATION_PENDING_RERUN"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 1)
        self.cloud.pending, self.cloud.eligible = False, False
        self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)
        self.assertIn("FIREBASE_OPERATION_RESUMED", self.output.getvalue())

    def test_foreign_operation_result_stops_before_app_creation(self):
        self.cloud.foreign_operation = True
        with self.assertRaisesRegex(SystemExit, "FIREBASE_PROJECT_MISMATCH"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 1)

    def test_operation_failure_is_redacted_and_does_not_start_next_stage(self):
        original = self.cloud.open
        def failed(request, timeout):
            if "/operations/" in request.full_url:
                return io.BytesIO(json.dumps(dict(name="operations/add-1", done=True,
                                                  error=dict(code=9, message="DO_NOT_PRINT_ERROR"))).encode())
            return original(request, timeout)
        self.cloud.open = failed
        with self.assertRaisesRegex(SystemExit, "OPERATION_FAILED_9"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 1)
        self.assertNotIn("DO_NOT_PRINT", self.output.getvalue())

    def test_repeated_pagination_and_resource_replacement_are_rejected(self):
        client = module.Client("token", False)
        with patch.object(client, "request", return_value=dict(projectInfo=[], nextPageToken="repeat")):
            with self.assertRaisesRegex(SystemExit, "INVALID_PAGINATION"):
                list(client.pages("availableProjects", "projectInfo", "projectInfo(project),nextPageToken"))
        self.run_helper()
        self.cloud.apps = [dict(app(), appId="other-id", name=module.PARENT + "/webApps/other-id")]
        with self.assertRaisesRegex(SystemExit, "JOURNAL_RESOURCE_MISMATCH"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)

    def test_verified_resource_disappearance_is_not_recreated(self):
        self.run_helper()
        self.cloud.apps = []
        with self.assertRaisesRegex(SystemExit, "VERIFIED_RESOURCE_NOW_MISSING"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 2)

    def test_journal_rejects_foreign_target_and_parallel_writer(self):
        self.directory.mkdir()
        state = self.directory / "state.json"
        state.write_text(json.dumps(dict(project="foreign", number=module.NUMBER, stages={})))
        with self.assertRaisesRegex(SystemExit, "JOURNAL_RECONCILE"):
            self.run_helper()
        state.unlink()
        with module.Journal(self.directory):
            with self.assertRaisesRegex(SystemExit, "ALREADY_RUNNING"):
                self.run_helper()
        self.assertEqual(self.cloud.calls, [])

    def test_request_scope_cannot_reach_config_keys_analytics_or_another_project(self):
        client = module.Client("DO_NOT_PRINT_TOKEN", True)
        for path in (module.PARENT + "/webApps/app/config", "projects/foreign", "https://elsewhere.invalid"):
            with self.assertRaisesRegex(SystemExit, "READ_SCOPE_REJECTED"):
                client.request(path)
        for path, body in ((module.PARENT + ":addGoogleAnalytics", {}),
                           (module.PARENT + "/webApps", dict(displayName="Other")),
                           (module.PARENT + ":addFirebase", dict(locationId="other"))):
            with self.assertRaisesRegex(SystemExit, "WRITE_SCOPE_REJECTED"):
                client.request(path, body=body)
        client.apply = False
        with self.assertRaisesRegex(SystemExit, "WRITE_SCOPE_REJECTED"):
            client.request(module.PARENT + ":addFirebase", body={})
        self.assertIsNone(module.NoRedirect().redirect_request(None, None, None, None, None, None))


if __name__ == "__main__":
    unittest.main()
