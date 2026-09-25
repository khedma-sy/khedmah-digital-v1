"""Controlled subprocess tests. No gcloud binary or Google access is needed."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / "scripts/audit-new-google-hosting-readonly.py"
spec = importlib.util.spec_from_file_location("hosting_audit", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReadOnlyAuditTests(unittest.TestCase):
    def reply(self, data, code=0, err=""):
        return subprocess.CompletedProcess([], code, json.dumps(data), err)

    def sdk_context(self):
        return {"core": {"account": module.ACCOUNT, "project": module.PROJECT}}

    def test_mutations_and_payload_access_are_refused_without_subprocess(self):
        audit = module.Audit()
        for args in (["services", "enable", "x"], ["secrets", "versions", "access", "latest"],
                     ["run", "deploy", "backend"], ["builds", "submit"],
                     ["auth", "login"], ["config", "set", "project", "x"],
                     ["sql", "backups", "restore", "1"], ["storage", "buckets", "update", "x"]):
            with patch.object(module.subprocess, "run") as runner:
                with self.assertRaises(ValueError): audit.query("bad", args, "json")
                runner.assert_not_called()

    def test_disabled_api_does_not_attempt_auto_enable_or_call(self):
        audit = module.Audit()
        with patch.object(module.subprocess, "run") as runner:
            self.assertIsNone(audit.query("run", ["run", "services", "list"], "json(metadata.name)", "run.googleapis.com"))
            runner.assert_not_called()
        self.assertEqual(audit.results["run"]["status"], "API_NOT_ENABLED")

    def test_cloud_calls_pin_project_account_and_disable_http_logging(self):
        audit = module.Audit()
        with patch.object(module.subprocess, "run", return_value=self.reply({})) as runner:
            audit.query("project", ["projects", "describe", module.PROJECT], "json(projectId)")
        args, kwargs = runner.call_args
        self.assertIn("--project=khedma-dl", args[0])
        self.assertIn("--account=haifawi30@gmail.com", args[0])
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_DISABLE_PROMPTS"], "1")

    def test_query_error_is_not_an_empty_success_and_does_not_export_stderr(self):
        audit = module.Audit()
        with patch.object(module.subprocess, "run", return_value=self.reply(None, 1, "PERMISSION_DENIED test-sentinel-do-not-export")):
            self.assertIsNone(audit.query("secrets", ["secrets", "list"], "json(name)"))
        self.assertEqual(audit.results["secrets"]["status"], "PERMISSION_DENIED")
        self.assertNotIn("test-sentinel", json.dumps(audit.results))
        self.assertNotIn("data", audit.results["secrets"])

    def test_empty_iam_policy_projections_are_collected_as_empty_binding_sets(self):
        cases = [
            (["iam", "service-accounts", "get-iam-policy",
              "firebase-adminsdk-fbsvc@khedma-dl.iam.gserviceaccount.com"], "iam.googleapis.com"),
            (["secrets", "get-iam-policy", "BOOTSTRAP_ADMIN_SECRET"], "secretmanager.googleapis.com"),
            (["storage", "buckets", "get-iam-policy", "gs://khedma-dl-khedmah-tfstate"], "storage.googleapis.com"),
        ]
        for args, api in cases:
            for empty_response in ([], None):
                with self.subTest(args=args, empty_response=empty_response):
                    audit = module.Audit()
                    audit.enabled.add(api)
                    with patch.object(module.subprocess, "run", return_value=self.reply(empty_response)):
                        result = audit.query("empty_policy", args, "json(bindings)", api)
                    self.assertEqual(result, {"bindings": []})
                    self.assertEqual(audit.results["empty_policy"]["status"], "COLLECTED")

    def test_timeouts_remain_unresolved(self):
        audit = module.Audit()
        with patch.object(module.subprocess, "run", side_effect=subprocess.TimeoutExpired("gcloud", 45)):
            audit.query("project", ["projects", "describe", module.PROJECT], "json(projectId)")
        self.assertEqual(audit.results["project"]["status"], "TIMEOUT")

    def test_invalid_json_remains_unresolved(self):
        audit = module.Audit()
        with patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "NOT_JSON", "")):
            audit.query("project", ["projects", "describe", module.PROJECT], "json(projectId)")
        self.assertEqual(audit.results["project"]["status"], "INVALID_OR_UNAVAILABLE_RESPONSE")

    def test_env_credential_override_stops_before_any_cloud_calls(self):
        with patch.dict(os.environ, {"CLOUDSDK_AUTH_ACCESS_TOKEN": "test-not-a-real-token"}, clear=True):
            audit = module.Audit()
            with patch.object(module.subprocess, "run") as runner:
                with self.assertRaises(RuntimeError): audit.collect()
                runner.assert_not_called()

    def test_config_credential_override_is_redacted_and_stops(self):
        with patch.dict(os.environ, {}, clear=True):
            audit = module.Audit()
            with patch.object(module.subprocess, "run", return_value=self.reply({"auth": {"credential_file_override": "/private/test-file"}})) as runner:
                with self.assertRaises(RuntimeError): audit.collect()
                self.assertEqual(runner.call_count, 1)
                self.assertEqual(runner.call_args.args[0][1:3], ["config", "list"])
            self.assertNotIn("/private", json.dumps(audit.results))

    def test_full_metadata_fixture_never_queries_secret_data_or_environment_values(self):
        calls = []
        apis = ["iam", "storage", "sqladmin", "secretmanager", "run", "artifactregistry", "cloudbuild", "monitoring"]
        def execute(cmd, **kwargs):
            calls.append(cmd)
            args = cmd[1:]
            if args[:2] == ["config", "list"]: return self.reply(self.sdk_context())
            if args[:2] == ["auth", "list"]: return self.reply([{"account": module.ACCOUNT}])
            if args[:2] == ["projects", "describe"]: return self.reply({"projectId": module.PROJECT, "projectNumber": module.NUMBER, "lifecycleState": "ACTIVE"})
            if args[:2] == ["services", "list"]: return self.reply([{"config": {"name": x + ".googleapis.com"}} for x in apis])
            if args[:3] == ["iam", "service-accounts", "list"]: return self.reply([{"email": "khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com"}])
            if args[:3] == ["sql", "instances", "list"]: return self.reply([{"name": "khedmah-v1-db"}])
            if args[:3] == ["storage", "buckets", "list"]: return self.reply([{"name": "khedma-dl-khedmah-media"}])
            if args[:3] == ["iam", "workload-identity-pools", "list"]: return self.reply([{"name": "projects/311026134906/locations/global/workloadIdentityPools/khedmah-github"}])
            if args[:2] == ["secrets", "list"]: return self.reply([{"name": "projects/khedma-dl/secrets/DATABASE_URL"}])
            if args[:3] == ["secrets", "versions", "describe"]: return self.reply({"name": "1", "state": "ENABLED"})
            return self.reply([])
        with patch.dict(os.environ, {}, clear=True), patch.object(module.subprocess, "run", side_effect=execute):
            audit = module.Audit(); audit.collect()
        self.assertEqual(audit.results["secret_latest:DATABASE_URL"]["data"]["state"], "ENABLED")
        self.assertEqual(audit.results["secret:RESEND_API_KEY"]["status"], "MISSING_FROM_SUCCESSFUL_LIST")
        for cmd in calls:
            self.assertNotIn("access", cmd)
            self.assertFalse(any("containers.env" in arg or "secretData" in arg for arg in cmd))
            self.assertFalse(any(x in cmd for x in ("deploy", "execute", "enable", "submit", "set-password")))
        self.assertTrue(any("--region=europe-west1" in cmd for cmd in calls))
        self.assertTrue(any("--region=global" in cmd for cmd in calls))

    def test_wrong_project_number_stops_before_service_queries(self):
        replies = [self.reply(self.sdk_context()), self.reply([{"account": module.ACCOUNT}]),
                   self.reply({"projectId": module.PROJECT, "projectNumber": "999", "lifecycleState": "ACTIVE"})]
        with patch.dict(os.environ, {}, clear=True), patch.object(module.subprocess, "run", side_effect=replies) as runner:
            with self.assertRaises(RuntimeError): module.Audit().collect()
            self.assertEqual(runner.call_count, 3)


    def test_identity_projection_reproduces_and_fixes_cloud_shell_null(self):
        fields = ("core.account", "core.project", "auth.impersonate_service_account",
                  "auth.credential_file_override", "auth.access_token_file")
        expected = "--format=json(" + ",".join(fields) + ")"

        def execute(cmd, **kwargs):
            if cmd[1:3] == ["config", "list"]:
                # Observed CLI behavior: auth-only projection produced JSON null.
                return self.reply(self.sdk_context() if expected in cmd else None)
            self.assertEqual(cmd[1:3], ["auth", "list"])
            return self.reply([])  # Stop after the second LOCAL query.

        with patch.dict(os.environ, {}, clear=True), patch.object(module.subprocess, "run", side_effect=execute) as runner:
            audit = module.Audit()
            with self.assertRaisesRegex(RuntimeError, "Expected owner account"):
                audit.collect()
            self.assertEqual(runner.call_count, 2)
            self.assertEqual(audit.results["sdk_credential_context"]["status"], "COLLECTED")

    def test_absent_null_or_unset_auth_requires_verified_core_identity(self):
        contexts = [self.sdk_context()]
        for auth in (None, {}, {"impersonate_service_account": None,
                               "credential_file_override": "", "access_token_file": None}):
            contexts.append(dict(self.sdk_context(), auth=auth))
        for context in contexts:
            with self.subTest(context=context), patch.dict(os.environ, {}, clear=True), patch.object(
                    module.subprocess, "run", side_effect=[self.reply(context), self.reply([])]) as runner:
                audit = module.Audit()
                with self.assertRaisesRegex(RuntimeError, "Expected owner account"):
                    audit.collect()
                self.assertEqual(runner.call_count, 2)
                self.assertEqual(audit.results["sdk_credential_context"]["status"], "COLLECTED")

    def test_null_empty_and_malformed_context_never_become_success(self):
        for context in (None, [], "", False, 0, {}, {"auth": None}, {"core": None}, {"core": []}):
            with self.subTest(context=context), patch.dict(os.environ, {}, clear=True), patch.object(
                    module.subprocess, "run", return_value=self.reply(context)) as runner:
                audit = module.Audit()
                with self.assertRaisesRegex(RuntimeError, "SDK credential context"):
                    audit.collect()
                self.assertEqual(runner.call_count, 1)
                self.assertNotEqual(audit.results["sdk_credential_context"]["status"], "COLLECTED")
                self.assertNotIn("data", audit.results["sdk_credential_context"])

    def test_mismatched_or_incomplete_core_stops_before_account_or_cloud_reads(self):
        for core in ({}, {"account": module.ACCOUNT}, {"project": module.PROJECT},
                     {"account": "other@example.invalid", "project": module.PROJECT},
                     {"account": module.ACCOUNT, "project": "other-project"}):
            with self.subTest(core=core), patch.dict(os.environ, {}, clear=True), patch.object(
                    module.subprocess, "run", return_value=self.reply({"core": core})) as runner:
                audit = module.Audit()
                with self.assertRaisesRegex(RuntimeError, "SDK credential context"):
                    audit.collect()
                self.assertEqual(runner.call_count, 1)
                self.assertEqual(audit.results["sdk_credential_context"]["status"], "UNVERIFIED_CREDENTIAL_CONTEXT")

    def test_every_auth_override_and_invalid_auth_shape_stays_blocked_and_redacted(self):
        auths = [[], "", False, 0]
        for key in ("impersonate_service_account", "credential_file_override", "access_token_file"):
            for value in ("/private/test-sentinel", [], {}, False, 0):
                auths.append({key: value})
        for auth in auths:
            with self.subTest(auth=auth), patch.dict(os.environ, {}, clear=True), patch.object(
                    module.subprocess, "run", return_value=self.reply(dict(self.sdk_context(), auth=auth))) as runner:
                audit = module.Audit()
                with self.assertRaisesRegex(RuntimeError, "SDK credential context"):
                    audit.collect()
                self.assertEqual(runner.call_count, 1)
                self.assertEqual(audit.results["sdk_credential_context"]["status"], "UNVERIFIED_CREDENTIAL_CONTEXT")
                self.assertNotIn("data", audit.results["sdk_credential_context"])
                self.assertNotIn("test-sentinel", json.dumps(audit.results))

    def test_sdk_command_failure_timeout_or_invalid_json_is_never_normalized(self):
        cases = [(self.reply(self.sdk_context(), 1, "PERMISSION_DENIED private-sentinel"), "PERMISSION_DENIED"),
                 (subprocess.CompletedProcess([], 0, "NOT_JSON", ""), "INVALID_OR_UNAVAILABLE_RESPONSE"),
                 (subprocess.TimeoutExpired("gcloud", 45), "TIMEOUT")]
        for result, status in cases:
            kwargs = {"side_effect": result} if isinstance(result, Exception) else {"return_value": result}
            with self.subTest(status=status), patch.dict(os.environ, {}, clear=True), patch.object(
                    module.subprocess, "run", **kwargs) as runner:
                audit = module.Audit()
                with self.assertRaisesRegex(RuntimeError, "SDK credential context"):
                    audit.collect()
                self.assertEqual(runner.call_count, 1)
                self.assertEqual(audit.results["sdk_credential_context"]["status"], status)
                self.assertNotIn("private-sentinel", json.dumps(audit.results))

    def test_null_non_context_response_remains_unresolved(self):
        for args in (["projects", "describe", module.PROJECT], ["secrets", "list"]):
            with self.subTest(args=args), patch.object(module.subprocess, "run", return_value=self.reply(None)):
                audit = module.Audit()
                self.assertIsNone(audit.query("query", args, "json"))
                self.assertEqual(audit.results["query"]["status"], "INVALID_OR_UNAVAILABLE_RESPONSE")

    def test_all_environment_credential_overrides_still_stop_before_sdk(self):
        for key in ("CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
                    "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT"):
            with self.subTest(key=key), patch.dict(os.environ, {key: "private-sentinel"}, clear=True), patch.object(
                    module.subprocess, "run") as runner:
                with self.assertRaisesRegex(RuntimeError, "Credential override detected"):
                    module.Audit().collect()
                runner.assert_not_called()


if __name__ == "__main__":
    unittest.main()
