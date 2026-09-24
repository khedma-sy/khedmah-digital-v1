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
            if args[:2] == ["config", "list"]: return self.reply({})
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
        replies = [self.reply({}), self.reply([{"account": module.ACCOUNT}]),
                   self.reply({"projectId": module.PROJECT, "projectNumber": "999", "lifecycleState": "ACTIVE"})]
        with patch.dict(os.environ, {}, clear=True), patch.object(module.subprocess, "run", side_effect=replies) as runner:
            with self.assertRaises(RuntimeError): module.Audit().collect()
            self.assertEqual(runner.call_count, 3)


if __name__ == "__main__":
    unittest.main()
