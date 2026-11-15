"""Offline tests for isolated 036+037 lab transition. No GCP access."""
import importlib.util
import contextlib
import io
import subprocess
import urllib.error
from pathlib import Path
from unittest.mock import patch
import unittest

HERE = Path(__file__).resolve().parents[1] / "scripts/run-recovery-lab-schema-transition.py"
spec = importlib.util.spec_from_file_location("lab_transition", HERE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Transition(unittest.TestCase):
    def test_pinned_atomic_sql_is_single_commit_with_readback(self):
        sql = m.candidate_sql()
        self.assertIn("BEGIN ISOLATION LEVEL READ COMMITTED, READ WRITE;", sql)
        self.assertIn("APPROVAL_TRANSITION_PREDECESSOR_MISMATCH", sql)
        self.assertIn("APPROVAL_TRANSITION_TARGET_MISMATCH", sql)
        self.assertIn("APPROVAL_TRANSITION_PRESERVED_METADATA_CHANGED", sql)
        self.assertEqual(sql.count("COMMIT;"), 1)
        self.assertLess(sql.index("COMMIT;"), sql.index("LAB_PROBE_037_PRIVATE"))
        self.assertIn("LAB_PROBE_036", sql)
        self.assertIn("LAB_PROBE_037_TYPE", sql)
        self.assertIn("LAB_PROBE_037_PRIVATE", sql)
        self.assertNotIn("khedmah-preview-v2-20261012", m.LAB)

    def test_plan_is_read_only(self):
        calls = []
        with patch.object(m, "guarded_preflight", return_value="10.166.4.5"), \
             patch.object(m, "apply", side_effect=AssertionError("apply called")):
            self.assertEqual(m.main(["--plan"]), 0)
        with patch.object(m, "guarded_preflight", side_effect=lambda: calls.append(1) or "10.166.4.5"):
            self.assertEqual(m.main(["--execute"]), 2)
        self.assertEqual(calls, [])

    def test_lab_operators_strictly_isolate_writers(self):
        def fake(args, *, data=None, timeout=240, output_json=False):
            if args[:3] == ["run", "services", "list"]: return []
            if args[:3] == ["run", "jobs", "list"]: return []
            if args[:3] == ["iam", "service-accounts", "list"]: return []
            if args[:2] == ["secrets", "list"]: return []
            if args[:3] == ["sql", "users", "list"]:
                return [{"name": "khedmah_migrator", "type": "BUILT_IN"}]
            raise AssertionError(args)
        with patch.object(m.catalog, "preflight", return_value="10.166.1.9"), \
             patch.object(m, "call", side_effect=fake), \
             patch.object(m, "require_project_secret_iam_capability"):
            self.assertEqual(m.guarded_preflight(), "10.166.1.9")
        def extra_job(args, *, data=None, timeout=240, output_json=False):
            if args[:3] == ["run", "services", "list"]: return [{"name": "writer"}]
            raise AssertionError(args)
        with patch.object(m.catalog, "preflight", return_value="10.166.1.9"), \
             patch.object(m, "call", side_effect=extra_job):
            with self.assertRaisesRegex(m.GuardStop, "WRITERS_NOT_QUIESCENT"):
                m.guarded_preflight()

    def test_secret_iam_project_permission_read_only_diagnostic(self):
        permissions = m.SECRET_IAM_PERMISSIONS
        self.assertEqual(permissions, (
            "secretmanager.secrets.getIamPolicy",
            "secretmanager.secrets.setIamPolicy",
        ))
        # Test permissions is advisory; no IAM grant is requested.
        class Token:
            returncode = 0
            stdout = b"dummy-token"
        payload = b'{"permissions":["secretmanager.secrets.getIamPolicy","secretmanager.secrets.setIamPolicy"]}'
        with patch.object(m.subprocess, "run", return_value=Token()) as token, \
             patch.object(m.urllib.request, "urlopen", return_value=io.BytesIO(payload)) as web:
            m.require_project_secret_iam_capability()
        self.assertEqual(token.call_args.args[0][-2:], ["auth", "print-access-token"])
        req = web.call_args.args[0]
        self.assertEqual(req.get_method(), "POST")
        self.assertIn(m.LAB, req.full_url)
        self.assertNotIn("preview-v2", req.full_url)

        with patch.object(m.subprocess, "run", return_value=Token()), \
             patch.object(m.urllib.request, "urlopen",
                          return_value=io.BytesIO(b'{"permissions":["secretmanager.secrets.getIamPolicy"]}')):
            with self.assertRaisesRegex(m.GuardStop, "POLICY_WRITE_PERMISSION_NOT_REPORTED"):
                m.require_project_secret_iam_capability()

        with patch.object(m.subprocess, "run", return_value=Token()), \
             patch.object(m.urllib.request, "urlopen",
                          side_effect=OSError("network unavailable")):
            with self.assertRaisesRegex(m.GuardStop, "LAB_IAM_DIAGNOSTIC_UNAVAILABLE"):
                m.require_project_secret_iam_capability()

    def test_missing_secret_iam_permission_blocks_before_create(self):
        def inventory(args, *, data=None, timeout=240, output_json=False):
            if args[:3] == ["run", "services", "list"]: return []
            if args[:3] == ["run", "jobs", "list"]: return []
            if args[:3] == ["iam", "service-accounts", "list"]: return []
            if args[:2] == ["secrets", "list"]: return []
            if args[:3] == ["sql", "users", "list"]:
                return [{"name": m.MIGRATOR, "type": "BUILT_IN"}]
            raise AssertionError("Mutation or unexpected read: " + repr(args))
        with patch.object(m.catalog, "preflight", return_value="10.166.1.9"), \
             patch.object(m, "call", side_effect=inventory), \
             patch.object(m, "require_project_secret_iam_capability",
                          side_effect=m.GuardStop("LAB_SECRET_POLICY_WRITE_PERMISSION_NOT_REPORTED")):
            self.assertEqual(m.main(["--plan"]), 2)

    def test_new_lab_principal_propagation_retries_only_specific_rejection(self):
        email = m.SA + "@" + m.LAB + ".iam.gserviceaccount.com"
        error = ("ERROR: (gcloud.secrets.add-iam-policy-binding) "
                 "INVALID_ARGUMENT: Service account [" + email + "] does not exist.\n")
        failed = subprocess.CompletedProcess([], 1, b"", error.encode())
        success = subprocess.CompletedProcess([], 0, b"sensitive-output", b"")
        output = io.StringIO()
        with patch.object(m.subprocess, "run", side_effect=[failed, success]) as run, \
             patch.object(m.time, "sleep") as wait, \
             patch.object(m.secrets, "randbelow", return_value=0), \
             contextlib.redirect_stdout(output):
            m.bind_temporary_secret_accessor(m.SQL_SECRET)
        self.assertEqual(run.call_count, 2)
        command = run.call_args.args[0]
        self.assertEqual(command[:6], ["gcloud", "--quiet", "--project=" + m.LAB,
                                      "secrets", "add-iam-policy-binding", m.SQL_SECRET])
        self.assertIn("--member=serviceAccount:" + email, command)
        self.assertIn("--role=roles/secretmanager.secretAccessor", command)
        self.assertNotIn("khedmah-preview-v2-20261012", " ".join(command))
        wait.assert_called_once_with(2)
        self.assertIn("LAB_SERVICE_ACCOUNT_PROPAGATION_RETRY", output.getvalue())
        self.assertNotIn(email, output.getvalue())
        self.assertNotIn("sensitive-output", output.getvalue())

    def test_unrelated_bind_errors_or_uncertain_outcomes_never_retry(self):
        email = m.SA + "@" + m.LAB + ".iam.gserviceaccount.com"
        prefix = "ERROR: (gcloud.secrets.add-iam-policy-binding) "
        cases = [
            prefix + "PERMISSION_DENIED: not allowed",
            prefix + "INVALID_ARGUMENT: Service account other@example.com does not exist.",
            prefix + "INVALID_ARGUMENT: Service account " + email + " does not exist. EXTRA",
        ]
        for error in cases:
            with self.subTest(error=error), \
                 patch.object(m.subprocess, "run", return_value=subprocess.CompletedProcess(
                     [], 1, b"SENSITIVE", error.encode())) as run, \
                 patch.object(m.time, "sleep") as wait:
                with self.assertRaisesRegex(m.GuardStop, "LAB_SECRET_BINDING_FAILED"):
                    m.bind_temporary_secret_accessor(m.SQL_SECRET)
                self.assertEqual(run.call_count, 1)
                wait.assert_not_called()
        with patch.object(m.subprocess, "run", side_effect=subprocess.TimeoutExpired("gcloud", 45)) as run, \
             patch.object(m.time, "sleep") as wait:
            with self.assertRaisesRegex(m.GuardStop, "LAB_SECRET_BINDING_OUTCOME_UNCERTAIN"):
                m.bind_temporary_secret_accessor(m.SQL_SECRET)
            self.assertEqual(run.call_count, 1)
            wait.assert_not_called()
        with patch.object(m.subprocess, "run") as run:
            with self.assertRaisesRegex(m.GuardStop, "LAB_SECRET_BINDING_TARGET_UNEXPECTED"):
                m.bind_temporary_secret_accessor("unrelated-secret")
            run.assert_not_called()

    def test_missing_service_account_retry_is_bounded(self):
        email = m.SA + "@" + m.LAB + ".iam.gserviceaccount.com"
        error = ("ERROR: (gcloud.secrets.add-iam-policy-binding) "
                 "INVALID_ARGUMENT: Service account " + email + " does not exist.")
        failed = subprocess.CompletedProcess([], 1, b"", error.encode())
        with patch.object(m.subprocess, "run", return_value=failed) as run, \
             patch.object(m.time, "sleep") as wait, \
             patch.object(m.secrets, "randbelow", return_value=0), \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(m.GuardStop, "LAB_SERVICE_ACCOUNT_NOT_VISIBLE_AFTER_RETRIES"):
                m.bind_temporary_secret_accessor(m.PASSWORD_SECRET)
        self.assertEqual(run.call_count, 7)
        self.assertEqual(wait.call_count, 6)
        self.assertEqual(sum(c.args[0] for c in wait.call_args_list), 90)

    def test_failed_binding_cleans_up_before_password_or_job(self):
        calls = []
        def fake(args, *, data=None, timeout=240, output_json=False):
            calls.append(tuple(args))
            return ""
        with patch.object(m, "call", side_effect=fake), \
             patch.object(m, "bind_temporary_secret_accessor",
                          side_effect=m.GuardStop("LAB_SECRET_BINDING_FAILED")):
            with self.assertRaisesRegex(m.GuardStop, "LAB_SECRET_BINDING_FAILED"):
                m.apply("10.166.1.9", "BEGIN;COMMIT;")
        self.assertFalse(any(c[:3] == ("sql", "users", "set-password") for c in calls))
        self.assertFalse(any(c[:3] == ("run", "jobs", "create") for c in calls))
        self.assertTrue(any(c[:3] == ("iam", "service-accounts", "delete") for c in calls))
        self.assertEqual(sum(c[:2] == ("secrets", "delete") for c in calls), 2)

    def test_migration_job_pins_private_network_and_migrator(self):
        calls = []
        def fake(args, *, data=None, timeout=240, output_json=False):
            calls.append((tuple(args), data))
            if args[:3] == ["run", "jobs", "describe"]:
                return {"network": m.NET, "subnet": m.SUB,
                        "egress": "ALL_TRAFFIC",
                        "serviceAccount": m.SA + "@" + m.LAB + ".iam.gserviceaccount.com"}
            return ""
        rows = [{"textPayload": "\n".join(
            "LAB_PROBE_" + k + "=true"
            for k in ("035", "036", "037_TYPE", "037_PRIVATE"))}]
        with patch.object(m, "call", side_effect=fake), \
             patch.object(m, "bind_temporary_secret_accessor") as bind, \
             patch.object(m.catalog, "run_job", return_value=rows), \
             patch.object(m.catalog, "require_markers", return_value={}):
            self.assertEqual(m.apply("10.166.1.9", "BEGIN;COMMIT;"), 0)
        self.assertEqual([x.args[0] for x in bind.call_args_list],
                         [m.SQL_SECRET, m.PASSWORD_SECRET])
        line = " ".join(" ".join(str(x) for x in args) for args, _ in calls)
        self.assertIn("--project", "gcloud --project=" + m.LAB)
        self.assertIn("--vpc-egress=all-traffic", line)
        self.assertIn("--network=" + m.NET, line)
        self.assertIn("--subnet=" + m.SUB, line)
        self.assertIn("PGUSER=khedmah_migrator", line)
        self.assertIn("set-password khedmah_migrator", line)
        self.assertIn("/run/transition/036-037.sql=", line)
        # catalog.run_job is mocked in this unit test: verify invocation via
        # the distinct catalog helper tests, not by assuming a gcloud call here.
        self.assertIn("run jobs create", line)
        self.assertNotIn("khedmah-preview-v2-20261012", line)
        self.assertNotIn("khedma-dl", line)
        self.assertTrue(any(c[0][:3] == ("run", "jobs", "delete") for c in calls))
        self.assertTrue(any(c[0][:2] == ("secrets", "delete") for c in calls))

    def test_job_create_timeout_still_attempts_cleanup(self):
        calls = []
        def fake(args, *, data=None, timeout=240, output_json=False):
            calls.append(tuple(args))
            if args[:3] == ["run", "jobs", "create"]:
                raise m.GuardStop("GCLOUD_UNAVAILABLE_OR_TIMEOUT")
            return ""
        with patch.object(m, "call", side_effect=fake), \
             patch.object(m, "bind_temporary_secret_accessor"):
            with self.assertRaisesRegex(m.GuardStop, "GCLOUD_UNAVAILABLE_OR_TIMEOUT"):
                m.apply("10.166.1.9", "BEGIN;COMMIT;")
        self.assertTrue(any(c[:3] == ("run", "jobs", "delete") for c in calls))
        self.assertTrue(any(c[:3] == ("iam", "service-accounts", "delete") for c in calls))
        self.assertEqual(sum(c[:2] == ("secrets", "delete") for c in calls), 2)

    def test_failed_execution_attempts_cleanup(self):
        calls = []
        def fake(args, *, data=None, timeout=240, output_json=False):
            calls.append(tuple(args))
            if args[:3] == ["run", "jobs", "describe"]:
                return {"network": m.NET, "subnet": m.SUB,
                        "egress": "ALL_TRAFFIC",
                        "serviceAccount": m.SA + "@" + m.LAB + ".iam.gserviceaccount.com"}
            return ""
        with patch.object(m, "call", side_effect=fake), \
             patch.object(m, "bind_temporary_secret_accessor"), \
             patch.object(m.catalog, "run_job", side_effect=m.GuardStop("TEST_JOB_FAILED")):
            with self.assertRaisesRegex(m.GuardStop, "TEST_JOB_FAILED"):
                m.apply("10.166.1.9", "BEGIN;COMMIT;")
        self.assertTrue(any(c[:3] == ("run", "jobs", "delete") for c in calls))
        self.assertTrue(any(c[:3] == ("iam", "service-accounts", "delete") for c in calls))
        self.assertEqual(sum(c[:2] == ("secrets", "delete") for c in calls), 2)

if __name__ == "__main__":
    unittest.main()
