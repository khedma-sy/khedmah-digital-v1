"""Offline guards for resuming only the isolated recovery lab."""
import copy
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1] / "scripts/resume-recovery-lab-transition.py"
spec = importlib.util.spec_from_file_location("resume_lab", HERE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
REAL_NETWORK_GUARD = m.require_additional_network_isolation


def instance(policy="NEVER"):
    return {"project": m.PROJECT, "name": m.INSTANCE, "region": m.REGION,
            "state": "STOPPED" if policy == "NEVER" else "RUNNABLE", "databaseVersion": "POSTGRES_16",
            "settings": {"activationPolicy": policy, "ipConfiguration": {
                "ipv4Enabled": False, "privateNetwork": m.NETWORK,
                "sslMode": "ENCRYPTED_ONLY", "authorizedNetworks": []}},
            "ipAddresses": [{"type": "PRIVATE", "ipAddress": "10.166.1.9"}]}


class ResumeLab(unittest.TestCase):
    def setUp(self):
        # Most lifecycle tests simulate the live network check; separate tests
        # below verify it blocks both before and after a restart.
        self.network_patch = patch.object(m, "require_additional_network_isolation")
        self.network = self.network_patch.start()
        self.addCleanup(self.network_patch.stop)

    def test_pinned_inputs_stage_and_tampering_stops(self):
        contents = {path: ("synthetic:" + path).encode() for path in m.SOURCES}
        pins = {path: hashlib.sha256(data).hexdigest() for path, data in contents.items()}
        def fetch(url, timeout):
            path = url.split(m.SOURCE_COMMIT + "/", 1)[1]
            return io.BytesIO(contents[path])
        with tempfile.TemporaryDirectory() as td, patch.object(m, "SOURCES", pins), patch.object(m.urllib.request, "urlopen", side_effect=fetch):
            m.stage(Path(td))
            self.assertTrue((Path(td) / "scripts/run-recovery-lab-schema-transition.py").is_file())
        with tempfile.TemporaryDirectory() as td, patch.object(m.urllib.request, "urlopen", return_value=io.BytesIO(b"tampered")):
            with self.assertRaisesRegex(m.Stop, "HASH_MISMATCH"):
                m.stage(Path(td))

    def test_rejects_wrong_target_or_public_network(self):
        self.assertEqual(m.validate_instance(instance()), "NEVER")
        for update in (lambda x: x.update(project="production"),
                       lambda x: x.update(name="production-db"),
                       lambda x: x["settings"]["ipConfiguration"].update(ipv4Enabled=True),
                       lambda x: x["settings"]["ipConfiguration"].update(pscConfig={"pscEnabled": True}),
                       lambda x: x["settings"]["ipConfiguration"].update(enablePrivatePathForGoogleCloudServices=True),
                       lambda x: x["settings"].update(dataApiAccess="ALLOW_DATA_API"),
                       lambda x: x["settings"]["ipConfiguration"].update(sslMode="ALLOW_UNENCRYPTED_AND_ENCRYPTED"),
                       lambda x: x["ipAddresses"].append({"type": "PRIMARY", "ipAddress": "1.1.1.1"}),
                       lambda x: x["ipAddresses"][0].update(ipAddress="10.200.0.1")):
            row = copy.deepcopy(instance()); update(row)
            with self.assertRaises(m.Stop): m.validate_instance(row)

    def test_stopped_lab_is_valid_only_with_never_activation(self):
        stopped = instance("NEVER"); stopped["state"] = "STOPPED"
        self.assertEqual(m.validate_instance(stopped), "NEVER")
        stopped["settings"]["activationPolicy"] = "ALWAYS"
        with self.assertRaisesRegex(m.Stop, "STATE"): m.validate_instance(stopped)
        running = instance("NEVER"); running["state"] = "RUNNABLE"
        with self.assertRaisesRegex(m.Stop, "NOT_STOPPED"):
            m.require_stopped_instance(running)

    def test_exact_official_network_reference_forms_and_no_other_project(self):
        for reference in (m.NETWORK, "/" + m.NETWORK,
                          "https://www.googleapis.com/compute/v1/" + m.NETWORK,
                          "https://compute.googleapis.com/compute/v1/" + m.NETWORK):
            row = instance()
            row["settings"]["ipConfiguration"]["privateNetwork"] = reference
            self.assertEqual(m.validate_instance(row), "NEVER")
        for reference in (m.NETWORK.replace(m.PROJECT, "another-project"),
                          "https://attacker.example/" + m.NETWORK,
                          m.NETWORK + "?extra=true"):
            row = instance()
            row["settings"]["ipConfiguration"]["privateNetwork"] = reference
            with self.assertRaisesRegex(m.Stop, "PRIVATE_NETWORK"):
                m.validate_instance(row)

    def test_mismatch_reports_only_failed_field_names(self):
        row = instance()
        row["settings"]["ipConfiguration"]["privateNetwork"] = "private-reference-must-not-be-printed"
        row["settings"]["ipConfiguration"]["ipv4Enabled"] = True
        with self.assertRaises(m.Stop) as failure: m.validate_instance(row)
        self.assertIn("PRIVATE_NETWORK", str(failure.exception))
        self.assertIn("PUBLIC_IPV4_DISABLED", str(failure.exception))
        self.assertNotIn("private-reference-must-not-be-printed", str(failure.exception))

    def test_no_confirmation_does_nothing(self):
        with patch.object(m, "stage") as stage, patch.object(m, "gcloud") as call:
            self.assertEqual(m.main([]), 2)
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 2)
        stage.assert_not_called(); call.assert_not_called()

    def test_inspect_is_read_only_and_rejects_execution_flags(self):
        with patch.object(m, "gcloud", return_value=instance()) as cloud, \
             patch.object(m, "reject_known_lab_writers", return_value=[]) as inventory, \
             patch.object(m, "stage") as stage, patch.object(m, "run_transition") as transition:
            self.assertEqual(m.main(["--inspect"]), 0)
            self.assertEqual(m.main(["--inspect", "--confirm", m.CONFIRM]), 2)
        self.assertEqual(cloud.call_count, 1)
        self.assertEqual(cloud.call_args.args[0][:3], ["sql", "instances", "describe"])
        inventory.assert_called_once(); stage.assert_not_called(); transition.assert_not_called()

    def test_inspect_reports_safe_field_and_inventory_errors_together(self):
        row = instance()
        row["settings"]["ipConfiguration"]["privateNetwork"] = "private-reference-must-not-be-printed"
        output = io.StringIO()
        with patch.object(m, "gcloud", return_value=row), \
             patch.object(m, "reject_known_lab_writers", side_effect=m.Stop("LAB_GLOBAL_SERVICES_UNAVAILABLE")), \
             patch.object(m, "stage") as stage, patch.object(m, "run_transition") as transition, \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(["--inspect"]), 2)
        self.assertIn("PRIVATE_NETWORK", output.getvalue())
        self.assertIn("LAB_GLOBAL_SERVICES_UNAVAILABLE", output.getvalue())
        self.assertNotIn("private-reference-must-not-be-printed", output.getvalue())
        self.assertIn("READ_ONLY_NO_CLOUD_MUTATIONS=True", output.getvalue())
        stage.assert_not_called(); transition.assert_not_called()

    def test_diagnose_reports_state_and_all_resource_failures_without_writes(self):
        row = instance()
        row["state"] = "SUSPENDED"
        row["suspensionReason"] = ["OPERATIONAL_ISSUE"]
        def global_items(_token, resource, _kind):
            if resource == "jobs": raise m.Stop("LAB_GLOBAL_JOBS_RESPONSE_INVALID:KIND=JobList:API_VERSION=MISSING")
            return []
        output = io.StringIO()
        with patch.object(m, "gcloud", return_value=row) as cloud, \
             patch.object(m, "read_access_token", return_value="synthetic-secret"), \
             patch.object(m, "global_run_items", side_effect=global_items) as inventory, \
             patch.object(m, "stage") as stage, patch.object(m, "run_transition") as transition, \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(["--diagnose"]), 2)
            self.assertEqual(m.main(["--diagnose", "--confirm", m.CONFIRM]), 2)
        self.assertEqual(cloud.call_count, 1)
        self.assertEqual(inventory.call_count, 5)
        self.assertIn("LAB_SQL_STATE=SUSPENDED", output.getvalue())
        self.assertIn("LAB_ACTIVATION_POLICY=NEVER", output.getvalue())
        self.assertIn("LAB_SUSPENSION_REASONS=OPERATIONAL_ISSUE", output.getvalue())
        self.assertIn("KIND=JobList:API_VERSION=MISSING", output.getvalue())
        self.assertIn("READ_ONLY_NO_CLOUD_MUTATIONS=True", output.getvalue())
        self.assertNotIn("synthetic-secret", output.getvalue())
        stage.assert_not_called(); transition.assert_not_called()

    def test_invalid_cloud_run_schema_exposes_only_safe_schema_labels(self):
        class Opener:
            def open(self, request, timeout):
                return io.BytesIO(json.dumps({"kind": "UnrelatedList", "apiVersion": "run.googleapis.com/v1",
                    "privatePayload": "should-never-be-printed"}).encode())
        with patch.object(m.urllib.request, "build_opener", return_value=Opener()):
            with self.assertRaises(m.Stop) as failure:
                m.global_run_items("synthetic-secret", "jobs", "JobsList")
        self.assertIn("KIND=UnrelatedList:API_VERSION=run.googleapis.com/v1", str(failure.exception))
        self.assertNotIn("synthetic-secret", str(failure.exception))
        self.assertNotIn("should-never-be-printed", str(failure.exception))

    def test_inspect_integration_uses_only_allowlisted_reads(self):
        commands, requests = [], []
        class Opener:
            def open(self, request, timeout):
                requests.append(request)
                self_url = request.full_url
                self.assert_google_get(request)
                path = self_url.split("?", 1)[0]
                kinds = {"services": ("serving.knative.dev/v1", "ServiceList"),
                         "jobs": ("run.googleapis.com/v1", "JobList"),
                         "executions": ("run.googleapis.com/v1", "ExecutionList"),
                         "workerpools": ("run.googleapis.com/v1", "WorkerPoolList"),
                         "instances": ("run.googleapis.com/v1", "InstanceList")}
                api, kind = kinds[path.rsplit("/", 1)[-1]]
                return io.BytesIO(json.dumps({"apiVersion": api, "kind": kind}).encode())
            def assert_google_get(self, request):
                assert request.get_method() == "GET"
                assert request.full_url.startswith("https://run.googleapis.com/")
        def command(cmd, **kwargs):
            commands.append(cmd)
            assert cmd[:3] == ["gcloud", "--quiet", "--project=" + m.PROJECT]
            args = cmd[3:]
            if args == ["auth", "print-access-token"]:
                return subprocess.CompletedProcess(cmd, 0, "synthetic-token\n", "")
            assert args[-1] == "--format=json"
            args = args[:-1]
            if args == ["sql", "instances", "describe", m.INSTANCE]:
                data = instance(); data["state"] = "STOPPED"
            elif args in (["compute", "instances", "list"], ["compute", "vpn-tunnels", "list"],
                          ["compute", "interconnects", "attachments", "list"]): data = []
            elif args == ["compute", "project-info", "describe"]: data = {"name": m.PROJECT}
            elif args == ["services", "list", "--enabled"]:
                data = [{"config": {"name": name}} for name in ("run.googleapis.com", "compute.googleapis.com")]
            elif args == ["compute", "networks", "describe", m.NETWORK_NAME]:
                data = {"name": m.NETWORK_NAME, "peerings": [
                    {"name": "servicenetworking-googleapis-com", "state": "ACTIVE"}]}
            else: raise AssertionError(args)
            return subprocess.CompletedProcess(cmd, 0, json.dumps(data), "")
        output = io.StringIO()
        with patch.object(m.subprocess, "run", side_effect=command), \
             patch.object(m.urllib.request, "build_opener", return_value=Opener()), \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(["--inspect"]), 0)
        self.assertEqual(len(requests), 5)
        self.assertIn("READ_ONLY_NO_CLOUD_MUTATIONS=True", output.getvalue())
        self.assertIn("EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False", output.getvalue())
        self.assertNotIn("synthetic-token", output.getvalue())

    def test_only_lab_project_is_passed_to_gcloud(self):
        with patch.object(m.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "[]", "")) as call:
            self.assertEqual(m.gcloud(["run", "jobs", "list", "--region=" + m.REGION], json_output=True), [])
        self.assertEqual(call.call_args.args[0][:3], ["gcloud", "--quiet", "--project=" + m.PROJECT])

    def test_partial_cloud_list_warning_is_not_treated_as_empty(self):
        result = subprocess.CompletedProcess([], 0, "[]", "WARNING: one region could not be reached")
        with patch.object(m.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(m.Stop, "READ_WITH_WARNINGS"):
                m.gcloud(["compute", "instances", "list"], json_output=True)

    def test_cloud_error_category_never_exposes_stderr(self):
        result = subprocess.CompletedProcess([], 1, "", "PERMISSION_DENIED private-detail-must-not-appear")
        with patch.object(m.subprocess, "run", return_value=result):
            with self.assertRaises(m.Stop) as failure:
                m.gcloud(["compute", "instances", "list"], json_output=True)
        self.assertIn("PERMISSION_DENIED", str(failure.exception))
        self.assertNotIn("private-detail-must-not-appear", str(failure.exception))

    def test_global_http_error_reports_status_only(self):
        class Opener:
            def open(self, request, timeout):
                raise urllib.error.HTTPError(request.full_url, 403, "private-detail", {}, None)
        with patch.object(m.urllib.request, "build_opener", return_value=Opener()):
            with self.assertRaises(m.Stop) as failure:
                m.global_run_items("synthetic-secret", "jobs", "JobsList")
        self.assertIn("LAB_GLOBAL_JOBS_HTTP_403", str(failure.exception))
        self.assertNotIn("synthetic-secret", str(failure.exception))
        self.assertNotIn("private-detail", str(failure.exception))

    def test_restart_then_execute_once_and_verify_policy(self):
        events = []
        policy = ["NEVER"]
        def call(args, **kwargs):
            events.append(args)
            if args[:3] == ["sql", "instances", "describe"]:
                return instance(policy[0])
            if args[:3] == ["sql", "instances", "patch"]:
                policy[0] = args[-1].split("=", 1)[1]
                return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers") as writers, patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 0)
        self.assertEqual([x[-1] for x in events if x[:3] == ["sql", "instances", "patch"]],
                         ["--activation-policy=ALWAYS", "--activation-policy=NEVER"])
        self.assertEqual(policy[0], "NEVER")
        self.assertEqual(writers.call_count, 2)
        self.assertEqual(self.network.call_count, 2)
        run.assert_called_once()

    def test_unverified_external_path_stops_before_restart(self):
        calls = []
        self.network.side_effect = m.Stop("LAB_ADDITIONAL_NETWORK_PATHS_UNVERIFIED")
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertFalse(any(args[:3] == ["sql", "instances", "patch"] for args in calls))
        run.assert_not_called()

    def test_network_api_activation_is_scoped_after_conservative_prechecks(self):
        class Helper:
            class Unavailable(Exception): pass
            APP = "synthetic-lab-app"
            def token(self): return "synthetic-token"
            def snapshot(self, token): return {"NCC": 0, "CONNECTORS": 0, "APP_ENGINE": 0}
            def read_json(self, url, token): raise self.Unavailable("HTTP_404")
        calls = []
        def cloud(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance("NEVER")
            if args == ["services", "list", "--enabled"]:
                return [{"config": {"name": "networkconnectivity.googleapis.com"}}]
            if args == ["services", "enable", "vpcaccess.googleapis.com"]: return None
            raise AssertionError(args)
        with patch.object(m, "load_network_helper", return_value=Helper()), \
             patch.object(m, "gcloud", side_effect=cloud):
            m.enable_lab_network_apis(Path("synthetic"))
        self.assertEqual(calls[-1], ["services", "enable", "vpcaccess.googleapis.com"])
        self.assertFalse(any(args[:3] == ["sql", "instances", "patch"] for args in calls))

    def test_network_api_activation_stops_on_uncertain_or_nonempty_snapshot(self):
        class Helper:
            class Unavailable(Exception): pass
            APP = "synthetic-lab-app"
            def token(self): return "synthetic-token"
            def snapshot(self, token): return {"NCC": 1, "CONNECTORS": 0, "APP_ENGINE": 0}
        with patch.object(m, "load_network_helper", return_value=Helper()), patch.object(m, "gcloud") as cloud:
            with self.assertRaisesRegex(m.Stop, "SNAPSHOT_NOT_EMPTY"):
                m.enable_lab_network_apis(Path("synthetic"))
        cloud.assert_not_called()

    def test_network_api_flag_requires_confirmation_and_precedes_restart(self):
        with patch.object(m, "enable_lab_network_apis") as enable:
            self.assertEqual(m.main(["--enable-lab-network-apis"]), 2)
            self.assertEqual(m.main(["--inspect", "--enable-lab-network-apis"]), 2)
        enable.assert_not_called()
        events = []
        def cloud(args, **kwargs):
            events.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance("NEVER")
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=cloud), \
             patch.object(m, "reject_known_lab_writers"), \
             patch.object(m, "enable_lab_network_apis", side_effect=m.Stop("API_ENABLE_FAILED")) as enable, \
             patch.object(m, "run_transition") as transition:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM,
                                     "--enable-lab-network-apis"]), 2)
        enable.assert_called_once()
        transition.assert_not_called()
        self.assertFalse(any(args[:3] == ["sql", "instances", "patch"] for args in events))

    def test_changed_external_path_after_restart_stops_and_requests_shutdown(self):
        calls, policy = [], ["NEVER"]
        self.network.side_effect = [None, m.Stop("LAB_ADDITIONAL_NETWORK_PATHS_UNVERIFIED")]
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance(policy[0])
            if args[:3] == ["sql", "instances", "patch"]:
                policy[0] = args[-1].split("=", 1)[1]; return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertEqual(policy[0], "NEVER")
        self.assertEqual([x[-1] for x in calls if x[:3] == ["sql", "instances", "patch"]],
                         ["--activation-policy=ALWAYS", "--activation-policy=NEVER"])
        run.assert_not_called()

    def test_network_helper_checks_scope_and_propagates_only_safe_failure(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            helper = root / "scripts/inspect-recovery-lab-external-paths.py"
            helper.parent.mkdir()
            base = ("PROJECT = " + repr(m.PROJECT) + "\n"
                    "SHELL_QUOTA_PROJECT = 'khedma-dl-e409d'\n"
                    "class Unavailable(Exception): pass\n"
                    "def token(): return 'synthetic-token'\n")
            helper.write_text(base + "def require_no_additional_network_paths(t): return True\n")
            REAL_NETWORK_GUARD(root)
            helper.write_text(base + "def require_no_additional_network_paths(t): raise Unavailable('LAB_NCC_UNVERIFIED_HTTP_403')\n")
            with self.assertRaisesRegex(m.Stop, "LAB_NCC_UNVERIFIED_HTTP_403"):
                REAL_NETWORK_GUARD(root)
            helper.write_text(base.replace(repr(m.PROJECT), "'other-project'") +
                              "def require_no_additional_network_paths(t): return True\n")
            with self.assertRaisesRegex(m.Stop, "TARGET_MISMATCH"):
                REAL_NETWORK_GUARD(root)

    def test_network_guard_waits_only_for_service_enablement_propagation(self):
        class Helper:
            class Unavailable(Exception): pass
            def __init__(self, reason): self.reason, self.calls = reason, 0
            def token(self): return "synthetic-token"
            def require_no_additional_network_paths(self, token):
                self.calls += 1
                if self.calls == 1: raise self.Unavailable(self.reason)
        helper = Helper("LAB_NCC_UNVERIFIED_HTTP_403_SERVICE_DISABLED")
        with patch.object(m, "load_network_helper", return_value=helper), patch.object(m.time, "sleep") as sleep:
            REAL_NETWORK_GUARD(Path("synthetic"), wait_for_enable=True)
        self.assertEqual(helper.calls, 2)
        sleep.assert_called_once_with(5)
        denied = Helper("LAB_NCC_UNVERIFIED_HTTP_403_IAM_PERMISSION_DENIED")
        with patch.object(m, "load_network_helper", return_value=denied), patch.object(m.time, "sleep") as sleep:
            with self.assertRaisesRegex(m.Stop, "IAM_PERMISSION_DENIED"):
                REAL_NETWORK_GUARD(Path("synthetic"), wait_for_enable=True)
        sleep.assert_not_called()

    def test_transition_failure_still_requests_lab_stop(self):
        policy, patches = ["NEVER"], []
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance(policy[0])
            if args[:3] == ["sql", "instances", "patch"]:
                patches.append(args[-1]); policy[0] = args[-1].split("=", 1)[1]; return None
            raise AssertionError(args)
        output = io.StringIO()
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), \
             patch.object(m, "run_transition", side_effect=m.Stop("LAB_TRANSITION_STOPPED_DO_NOT_RETRY")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertEqual(patches, ["--activation-policy=ALWAYS", "--activation-policy=NEVER"])
        self.assertIn("LAB_AUTOSTOP_POLICY_READBACK=NEVER", output.getvalue())
        self.assertIn("LAB_TRANSITION_STOPPED_DO_NOT_RETRY", output.getvalue())

    def test_uncertain_start_still_requests_stop(self):
        patches = []
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance("NEVER")
            if args[:3] == ["sql", "instances", "patch"]:
                patches.append(args[-1])
                if args[-1] == "--activation-policy=ALWAYS": raise m.Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN")
                return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertEqual(patches, ["--activation-policy=ALWAYS", "--activation-policy=NEVER"])
        run.assert_not_called()

    def test_failed_stop_is_reported_without_repeating_transition(self):
        policy = ["NEVER"]
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance(policy[0])
            if args[-1] == "--activation-policy=ALWAYS": policy[0] = "ALWAYS"; return None
            if args[-1] == "--activation-policy=NEVER": raise m.Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN")
            raise AssertionError(args)
        output = io.StringIO()
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertIn("LAB_AUTOSTOP_UNVERIFIED_DO_NOT_RETRY_TRANSITION", output.getvalue())
        self.assertNotIn("LAB_AUTOSTOP_POLICY_READBACK=NEVER", output.getvalue())
        run.assert_called_once()

    def test_autostop_never_patches_an_unverified_identity(self):
        row = instance("ALWAYS"); row["project"] = "other-project"
        with patch.object(m, "gcloud", return_value=row) as cloud:
            with self.assertRaisesRegex(m.Stop, "LAB_AUTOSTOP_IDENTITY_UNVERIFIED"):
                m.stop_restarted_lab()
        self.assertEqual(cloud.call_count, 1)

    def test_existing_writers_stop_before_restart(self):
        calls = []
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers", side_effect=m.Stop("WRITER_FOUND")), \
             patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        run.assert_not_called()

    def test_already_running_instance_is_not_patched_again(self):
        calls = []
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance("ALWAYS")
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers") as writers, patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        writers.assert_not_called(); run.assert_not_called()

    def test_unverified_restart_stops_before_transition(self):
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance("NEVER")
            if args[:3] == ["sql", "instances", "patch"]: return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        run.assert_not_called()

    def test_restart_failure_never_runs_transition(self):
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            raise m.Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN")
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        run.assert_not_called()

    def test_changed_stopped_baseline_prevents_restart(self):
        calls = []
        def cloud(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]:
                return instance("NEVER" if len(calls) == 1 else "ALWAYS")
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=cloud), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        run.assert_not_called()

    def test_download_failure_causes_no_cloud_calls(self):
        with patch.object(m, "stage", side_effect=m.Stop("PINNED_SOURCE_DOWNLOAD_FAILED")), patch.object(m, "gcloud") as call:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-fence-plan", m.FENCE_CONFIRM]), 2)
        call.assert_not_called()

    def test_global_inventory_paginates_and_rejects_unreachable_regions(self):
        class Opener:
            def __init__(self, pages): self.pages = list(pages); self.urls = []
            def open(self, request, timeout):
                self.urls.append(request.full_url)
                self.assert_google_only(request)
                return io.BytesIO(json.dumps(self.pages.pop(0)).encode())
            def assert_google_only(self, request):
                assert request.full_url.startswith("https://run.googleapis.com/")
                assert request.get_header("Authorization") == "Bearer synthetic-token"
        opener = Opener([
            {"apiVersion": "serving.knative.dev/v1", "kind": "ServiceList", "items": [], "metadata": {"continue": "next/page"}},
            {"apiVersion": "serving.knative.dev/v1", "kind": "ServiceList", "items": [{"metadata": {"name": "elsewhere"}}], "metadata": {}}
        ])
        with patch.object(m.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(len(m.global_run_items("synthetic-token", "services", "ServiceList")), 1)
        self.assertIn("continue=next%2Fpage", opener.urls[1])
        bad = Opener([{"apiVersion": "serving.knative.dev/v1", "kind": "ServiceList", "unreachable": ["other-region"], "metadata": {}}])
        with patch.object(m.urllib.request, "build_opener", return_value=bad):
            with self.assertRaisesRegex(m.Stop, "INCOMPLETE"):
                m.global_run_items("synthetic-token", "services", "ServiceList")

    def test_cloud_run_observed_singular_and_documented_plural_kinds(self):
        class Opener:
            def __init__(self, kind): self.kind = kind
            def open(self, request, timeout):
                return io.BytesIO(json.dumps({"apiVersion": "run.googleapis.com/v1", "kind": self.kind}).encode())
        for resource, expected, forms in (("jobs", "JobsList", ("JobsList", "JobList")),
                                           ("executions", "ExecutionsList", ("ExecutionsList", "ExecutionList")),
                                           ("instances", "InstancesList", ("InstancesList", "InstanceList"))):
            for kind in forms:
                with patch.object(m.urllib.request, "build_opener", return_value=Opener(kind)):
                    self.assertEqual(m.global_run_items("synthetic", resource, expected), [])

        class WrongVersion:
            def open(self, request, timeout):
                return io.BytesIO(json.dumps({"apiVersion": "other/v1", "kind": "JobList"}).encode())
        with patch.object(m.urllib.request, "build_opener", return_value=WrongVersion()):
            with self.assertRaisesRegex(m.Stop, "RESPONSE_INVALID"):
                m.global_run_items("synthetic", "jobs", "JobsList")

    def test_global_writers_and_unknown_executions_block_restart(self):
        def list_global(_token, resource, _kind):
            if resource == "services": return [{"metadata": {"name": "off-region-writer"}}]
            return []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=list_global), \
             patch.object(m, "gcloud") as cloud:
            with self.assertRaisesRegex(m.Stop, "SERVICES_REVIEW_REQUIRED"): m.reject_known_lab_writers()
        cloud.assert_not_called()
        def standalone(_token, resource, _kind):
            return [{"metadata": {"name": "off-region-instance"}}] if resource == "instances" else []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=standalone), \
             patch.object(m, "gcloud") as cloud:
            with self.assertRaisesRegex(m.Stop, "INSTANCES_REVIEW_REQUIRED"): m.reject_known_lab_writers()
        cloud.assert_not_called()
        def active(_token, resource, _kind):
            return [{"status": {"runningCount": 1}}] if resource == "executions" else []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=active):
            with self.assertRaisesRegex(m.Stop, "EXECUTION_ACTIVE_OR_UNKNOWN"): m.reject_known_lab_writers()

    def test_read_only_inventory_reports_multiple_independent_blockers(self):
        def global_items(_token, resource, _kind):
            if resource == "jobs": return [{"metadata": {"name": "hidden-job"}}]
            if resource == "executions": return [{"status": {"runningCount": 1}}]
            return []
        def cloud(args, **kwargs):
            if args == ["compute", "instances", "list"]: return [{"name": "hidden-vm"}]
            if args == ["compute", "project-info", "describe"]: return {"name": m.PROJECT}
            if args == ["services", "list", "--enabled"]:
                return [{"config": {"name": "run.googleapis.com"}},
                        {"config": {"name": "compute.googleapis.com"}}]
            if args == ["compute", "networks", "describe", m.NETWORK_NAME]:
                return {"name": m.NETWORK_NAME, "peerings": []}
            return []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=global_items), patch.object(m, "gcloud", side_effect=cloud):
            problems = m.reject_known_lab_writers(collect_all=True)
        self.assertIn("LAB_EXISTING_RUN_JOBS_REVIEW_REQUIRED", problems)
        self.assertIn("LAB_RUN_EXECUTION_ACTIVE_OR_UNKNOWN", problems)
        self.assertIn("LAB_EXISTING_VMS_REVIEW_REQUIRED", problems)
        self.assertIn("LAB_NETWORK_PEERING_REVIEW_REQUIRED", problems)
        self.assertNotIn("hidden-job", str(problems)); self.assertNotIn("hidden-vm", str(problems))

    def test_extra_vpc_peering_and_vm_block(self):
        def cloud(args, **kwargs):
            if args == ["compute", "project-info", "describe"]: return {"name": m.PROJECT}
            if args == ["compute", "networks", "describe", m.NETWORK_NAME]:
                return {"name": m.NETWORK_NAME, "peerings": [
                    {"name": "servicenetworking-googleapis-com", "state": "ACTIVE"},
                    {"name": "another-network", "state": "ACTIVE"}]}
            if args == ["services", "list", "--enabled"]:
                return [{"config": {"name": "run.googleapis.com"}},
                        {"config": {"name": "compute.googleapis.com"}}]
            return []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", return_value=[]), patch.object(m, "gcloud", side_effect=cloud):
            with self.assertRaisesRegex(m.Stop, "PEERING_REVIEW_REQUIRED"): m.reject_known_lab_writers()
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", return_value=[]), patch.object(m, "gcloud", return_value=[{"name": "vm"}]):
            with self.assertRaisesRegex(m.Stop, "VMS_REVIEW_REQUIRED"): m.reject_known_lab_writers()

    def test_scheduler_jobs_in_any_listed_region_block(self):
        def cloud(args, **kwargs):
            if args == ["compute", "project-info", "describe"]: return {"name": m.PROJECT}
            if args == ["services", "list", "--enabled"]:
                return [{"config": {"name": x}} for x in (
                    "run.googleapis.com", "compute.googleapis.com", "cloudscheduler.googleapis.com")]
            if args == ["scheduler", "locations", "list"]:
                return [{"locationId": m.REGION}, {"locationId": "us-central1"}]
            if args[:3] == ["scheduler", "jobs", "list"]:
                return [{"name": "elsewhere"}] if args[-1] == "--location=us-central1" else []
            return []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", return_value=[]), patch.object(m, "gcloud", side_effect=cloud):
            with self.assertRaisesRegex(m.Stop, "SCHEDULER_JOBS_REVIEW_REQUIRED"): m.reject_known_lab_writers()

    def test_completed_executions_do_not_count_as_active_writers(self):
        def global_items(_token, resource, _kind):
            return [{"status": {"completionTime": "2026-11-16T07:00:00Z"}}] if resource == "executions" else []
        def cloud(args, **kwargs):
            if args == ["compute", "project-info", "describe"]: return {"name": m.PROJECT}
            if args == ["services", "list", "--enabled"]:
                return [{"config": {"name": "run.googleapis.com"}},
                        {"config": {"name": "compute.googleapis.com"}}]
            if args == ["compute", "networks", "describe", m.NETWORK_NAME]:
                return {"name": m.NETWORK_NAME, "peerings": [
                    {"name": "servicenetworking-googleapis-com", "state": "ACTIVE"}]}
            return []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=global_items), patch.object(m, "gcloud", side_effect=cloud):
            self.assertEqual(m.reject_known_lab_writers(), [])

    def test_shared_vpc_host_blocks(self):
        def cloud(args, **kwargs):
            return {"name": m.PROJECT, "xpnProjectStatus": "HOST"} if args == ["compute", "project-info", "describe"] else []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", return_value=[]), patch.object(m, "gcloud", side_effect=cloud):
            with self.assertRaisesRegex(m.Stop, "SHARED_VPC_HOST_REVIEW_REQUIRED"):
                m.reject_known_lab_writers()


if __name__ == "__main__":
    unittest.main()
