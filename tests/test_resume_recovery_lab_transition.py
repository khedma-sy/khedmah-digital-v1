"""Offline guards for resuming only the isolated recovery lab."""
import copy
import hashlib
import importlib.util
import io
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
                       lambda x: x["settings"]["ipConfiguration"].update(sslMode="ALLOW_UNENCRYPTED_AND_ENCRYPTED"),
                       lambda x: x["ipAddresses"].append({"type": "PRIMARY", "ipAddress": "1.1.1.1"}),
                       lambda x: x["ipAddresses"][0].update(ipAddress="10.200.0.1")):
            row = copy.deepcopy(instance()); update(row)
            with self.assertRaises(m.Stop): m.validate_instance(row)

    def test_no_confirmation_does_nothing(self):
        with patch.object(m, "stage") as stage, patch.object(m, "gcloud") as call:
            self.assertEqual(m.main([]), 2)
        stage.assert_not_called(); call.assert_not_called()

    def test_only_lab_project_is_passed_to_gcloud(self):
        with patch.object(m.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "[]", "")) as call:
            self.assertEqual(m.gcloud(["run", "jobs", "list", "--region=" + m.REGION], json_output=True), [])
        self.assertEqual(call.call_args.args[0][:3], ["gcloud", "--quiet", "--project=" + m.PROJECT])

    def test_restart_then_execute_once_and_verify_policy(self):
        events = []
        def call(args, **kwargs):
            events.append(args)
            if args[:3] == ["sql", "instances", "describe"]:
                return instance("NEVER" if sum(x[:3] == args[:3] for x in events) == 1 else "ALWAYS")
            if args[:2] == ["run", "services"] or args[:2] == ["run", "jobs"]: return []
            if args[:3] == ["sql", "instances", "patch"]: return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 0)
        self.assertEqual(len([x for x in events if x[:3] == ["sql", "instances", "patch"]]), 1)
        self.assertEqual(events[1][:3], ["run", "services", "list"])
        self.assertEqual(events[2][:3], ["run", "jobs", "list"])
        run.assert_called_once()

    def test_existing_writers_stop_before_restart(self):
        calls = []
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            if args[:3] == ["run", "services", "list"]: return [{"name": "writer"}]
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 2)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        run.assert_not_called()

    def test_already_running_instance_is_not_patched_again(self):
        calls = []
        def call(args, **kwargs):
            calls.append(args)
            if args[:3] == ["sql", "instances", "describe"]: return instance("ALWAYS")
            if args[:2] in (["run", "services"], ["run", "jobs"]): return []
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 0)
        self.assertFalse(any(x[:3] == ["sql", "instances", "patch"] for x in calls))
        run.assert_called_once()

    def test_unverified_restart_stops_before_transition(self):
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance("NEVER")
            if args[:2] in (["run", "services"], ["run", "jobs"]): return []
            if args[:3] == ["sql", "instances", "patch"]: return None
            raise AssertionError(args)
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 2)
        run.assert_not_called()

    def test_restart_failure_never_runs_transition(self):
        def call(args, **kwargs):
            if args[:3] == ["sql", "instances", "describe"]: return instance()
            if args[:2] in (["run", "services"], ["run", "jobs"]): return []
            raise m.Stop("LAB_GCLOUD_OUTCOME_UNCERTAIN")
        with patch.object(m, "stage"), patch.object(m, "gcloud", side_effect=call), patch.object(m, "run_transition") as run:
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 2)
        run.assert_not_called()

    def test_download_failure_causes_no_cloud_calls(self):
        with patch.object(m, "stage", side_effect=m.Stop("PINNED_SOURCE_DOWNLOAD_FAILED")), patch.object(m, "gcloud") as call:
            self.assertEqual(m.main(["--confirm", m.CONFIRM]), 2)
        call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
