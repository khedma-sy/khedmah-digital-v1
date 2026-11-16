"""Offline guards for resuming only the isolated recovery lab."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1] / "scripts/resume-recovery-lab-transition.py"
spec = importlib.util.spec_from_file_location("resume_lab", HERE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def instance(policy="NEVER"):
    return {"project": m.PROJECT, "name": m.INSTANCE, "region": m.REGION,
            "state": "RUNNABLE", "databaseVersion": "POSTGRES_16",
            "settings": {"activationPolicy": policy, "ipConfiguration": {
                "ipv4Enabled": False, "privateNetwork": m.NETWORK,
                "sslMode": "ENCRYPTED_ONLY", "authorizedNetworks": []}},
            "ipAddresses": [{"type": "PRIVATE", "ipAddress": "10.166.1.9"}]}


class ResumeLab(unittest.TestCase):
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
                       lambda x: x["settings"]["ipConfiguration"].update(sslMode="ALLOW_UNENCRYPTED_AND_ENCRYPTED"),
                       lambda x: x["ipAddresses"].append({"type": "PRIMARY", "ipAddress": "1.1.1.1"}),
                       lambda x: x["ipAddresses"][0].update(ipAddress="10.200.0.1")):
            row = copy.deepcopy(instance()); update(row)
            with self.assertRaises(m.Stop): m.validate_instance(row)

    def test_no_confirmation_does_nothing(self):
        with patch.object(m, "stage") as stage, patch.object(m, "gcloud") as call:
            self.assertEqual(m.main([]), 2)
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 2)
        stage.assert_not_called(); call.assert_not_called()

    def test_inspect_is_read_only_and_rejects_execution_flags(self):
        with patch.object(m, "gcloud", return_value=instance()) as cloud, \
             patch.object(m, "reject_known_lab_writers") as inventory, \
             patch.object(m, "stage") as stage, patch.object(m, "run_transition") as transition:
            self.assertEqual(m.main(["--inspect"]), 0)
            self.assertEqual(m.main(["--inspect", "--confirm", m.CONFIRM]), 2)
        self.assertEqual(cloud.call_count, 1)
        self.assertEqual(cloud.call_args.args[0][:3], ["sql", "instances", "describe"])
        inventory.assert_called_once(); stage.assert_not_called(); transition.assert_not_called()

    def test_only_lab_project_is_passed_to_gcloud(self):
        with patch.object(m.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "[]", "")) as call:
            self.assertEqual(m.gcloud(["run", "jobs", "list", "--region=" + m.REGION], json_output=True), [])
        self.assertEqual(call.call_args.args[0][:3], ["gcloud", "--quiet", "--project=" + m.PROJECT])

    def test_partial_cloud_list_warning_is_not_treated_as_empty(self):
        result = subprocess.CompletedProcess([], 0, "[]", "WARNING: one region could not be reached")
        with patch.object(m.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(m.Stop, "READ_WITH_WARNINGS"):
                m.gcloud(["compute", "instances", "list"], json_output=True)

    def test_restart_then_execute_once_and_verify_policy(self):
        events = []
        def call(args, **kwargs):
            events.append(args)
            if args[:3] == ["sql", "instances", "describe"]:
                return instance("NEVER" if sum(x[:3] == args[:3] for x in events) <= 2 else "ALWAYS")
            if args[:3] == ["sql", "instances", "patch"]: return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers") as writers, patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 0)
        self.assertEqual(len([x for x in events if x[:3] == ["sql", "instances", "patch"]]), 1)
        self.assertEqual(writers.call_count, 2)
        run.assert_called_once()

    def test_existing_writers_stop_before_restart(self):
        calls = []
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers", side_effect=m.Stop("WRITER_FOUND")), \
             patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 2)
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
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 2)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        writers.assert_not_called(); run.assert_not_called()

    def test_unverified_restart_stops_before_transition(self):
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance("NEVER")
            if args[:3] == ["sql", "instances", "patch"]: return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 2)
        run.assert_not_called()

    def test_restart_failure_never_runs_transition(self):
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            raise m.Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN")
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), \
             patch.object(m, "reject_known_lab_writers"), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 2)
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
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 2)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        run.assert_not_called()

    def test_download_failure_causes_no_cloud_calls(self):
        with patch.object(m, "stage", side_effect=m.Stop("PINNED_SOURCE_DOWNLOAD_FAILED")), patch.object(m, "gcloud") as call:
            self.assertEqual(m.main(["--confirm", m.CONFIRM, "--confirm-writer-review", m.WRITER_REVIEW]), 2)
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

    def test_global_writers_and_unknown_executions_block_restart(self):
        def list_global(_token, resource, _kind):
            if resource == "services": return [{"metadata": {"name": "off-region-writer"}}]
            return []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=list_global), \
             patch.object(m, "gcloud") as cloud:
            with self.assertRaisesRegex(m.Stop, "SERVICES_REVIEW_REQUIRED"): m.reject_known_lab_writers()
        cloud.assert_not_called()
        def active(_token, resource, _kind):
            return [{"status": {"runningCount": 1}}] if resource == "executions" else []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", side_effect=active):
            with self.assertRaisesRegex(m.Stop, "EXECUTION_ACTIVE_OR_UNKNOWN"): m.reject_known_lab_writers()

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
            self.assertIsNone(m.reject_known_lab_writers())

    def test_shared_vpc_host_blocks(self):
        def cloud(args, **kwargs):
            return {"name": m.PROJECT, "xpnProjectStatus": "HOST"} if args == ["compute", "project-info", "describe"] else []
        with patch.object(m, "read_access_token", return_value="synthetic"), \
             patch.object(m, "global_run_items", return_value=[]), patch.object(m, "gcloud", side_effect=cloud):
            with self.assertRaisesRegex(m.Stop, "SHARED_VPC_HOST_REVIEW_REQUIRED"):
                m.reject_known_lab_writers()


if __name__ == "__main__":
    unittest.main()
