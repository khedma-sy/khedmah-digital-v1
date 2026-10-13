import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("storage_config", Path(__file__).parents[1] / "scripts/stage-preview-v2-storage-config.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class Cloud:
    def __init__(self):
        self.project = {"projectId": m.PROJECT, "projectNumber": m.NUMBER,
            "lifecycleState": "ACTIVE", "parent": {"type": "organization", "id": m.ORGANIZATION}}
        self.bucket = {"name": m.BUCKET, "projectNumber": m.NUMBER, "location": "EUROPE-WEST1",
            "iamConfiguration": {"publicAccessPrevention": "enforced", "uniformBucketLevelAccess": {"enabled": True}}}
        self.version = {"name": m.PARENT + "/versions/1", "state": "ENABLED"}
        self.versions = []
        self.value = m.BUCKET.encode()
        self.calls = []
        self.ambiguous = False
        self.access_denied = False

    def __call__(self, *args, fields=None, data=None):
        self.calls.append((args, fields, data))
        if args[0] == "config":
            return b"(unset)\n"
        if args[0] == "projects":
            return copy.deepcopy(self.project)
        if args[0] == "storage":
            return copy.deepcopy(self.bucket)
        if args[:2] == ("secrets", "describe"):
            return {"name": m.PARENT}
        if args[:2] != ("secrets", "versions"):
            raise AssertionError(args)
        if args[2] == "list":
            return copy.deepcopy(self.versions)
        if args[2] == "describe":
            return copy.deepcopy(self.version)
        if args[2] == "access":
            if self.access_denied:
                raise SystemExit("STOP: ACCESS_DENIED")
            return self.value
        if args[2] == "add":
            if self.ambiguous:
                raise SystemExit("STOP: WRITE_UNCONFIRMED")
            self.versions = [copy.deepcopy(self.version)]
            return copy.deepcopy(self.version)
        raise AssertionError(args)


class StorageConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / "attempt"
        self.fake = Cloud()

    def run_step(self):
        with patch.object(m, "cloud", self.fake), patch.dict(m.os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()) as out:
            m.run(self.directory)
        return out.getvalue()

    def writes(self):
        return [call for call in self.fake.calls if call[2] is not None]

    def test_create_exact_one_value_and_matching_rerun_never_adds_version(self):
        output = self.run_step()
        self.assertEqual(self.writes(), [(("secrets", "versions", "add", m.SECRET, "--data-file=-"), "name,state", m.BUCKET.encode())])
        self.assertTrue(json.loads(output)["created"])
        self.assertNotIn(m.BUCKET, output)
        self.assertFalse(json.loads(self.run_step())["created"])
        self.assertEqual(len(self.writes()), 1)
        self.assertFalse(json.loads(output)["full_effective_iam_verified"])

    def test_foreign_project_or_bucket_blocks_all_writes(self):
        for target in ("project", "bucket"):
            with self.subTest(target=target):
                self.fake = Cloud()
                getattr(self.fake, target)["projectNumber"] = "311026134906"
                with self.assertRaisesRegex(SystemExit, "IDENTITY_MISMATCH"):
                    self.run_step()
                self.assertFalse(self.writes())

    def test_pap_or_ubla_failure_does_not_stage(self):
        for field in ("publicAccessPrevention", "uniformBucketLevelAccess"):
            with self.subTest(field=field):
                self.fake = Cloud()
                self.fake.bucket["iamConfiguration"][field] = "inherited" if field == "publicAccessPrevention" else {"enabled": False}
                with self.assertRaisesRegex(SystemExit, "PROTECTION_NOT_VERIFIED"):
                    self.run_step()
                self.assertFalse(self.writes())

    def test_conflicting_or_disabled_versions_are_not_rotated(self):
        for versions in ([{"name": m.PARENT + "/versions/1", "state": "DISABLED"}],
                         [self.fake.version, {"name": m.PARENT + "/versions/2", "state": "ENABLED"}]):
            with self.subTest(versions=versions):
                self.fake.versions = versions
                with self.assertRaisesRegex(SystemExit, "CONFLICT"):
                    self.run_step()
                self.assertFalse(self.writes())

    def test_existing_different_value_is_not_overwritten_or_printed(self):
        self.fake.versions = [self.fake.version]
        self.fake.value = b"unrelated-private-value"
        with self.assertRaisesRegex(SystemExit, "MISMATCH_NO_OVERWRITE"):
            self.run_step()
        self.assertFalse(self.writes())

    def test_ambiguous_write_marker_prevents_second_write(self):
        self.fake.ambiguous = True
        with self.assertRaisesRegex(SystemExit, "WRITE_UNCONFIRMED"):
            self.run_step()
        with self.assertRaisesRegex(SystemExit, "PREVIOUS_WRITE_ATTEMPT"):
            self.run_step()
        self.assertEqual(len(self.writes()), 1)
        self.assertNotIn(m.BUCKET, (self.directory / "version-attempt.json").read_text())

    def test_failed_readback_can_resume_matching_version_without_write(self):
        self.fake.access_denied = True
        with self.assertRaisesRegex(SystemExit, "ACCESS_DENIED"):
            self.run_step()
        self.assertEqual(len(self.writes()), 1)
        self.fake.access_denied = False
        self.assertFalse(json.loads(self.run_step())["created"])
        self.assertEqual(len(self.writes()), 1)

    def test_pending_marker_is_not_treated_as_completed(self):
        self.directory.mkdir()
        (self.directory / "version-attempt.json").write_text("{}")
        with self.assertRaisesRegex(SystemExit, "PREVIOUS_WRITE_ATTEMPT"):
            self.run_step()
        self.assertFalse(self.writes())

    def test_cli_pins_account_project_and_keeps_payload_on_stdin(self):
        response = type("Result", (), {"returncode": 0, "stdout": b'{"name":"metadata"}'})()
        with patch.object(m.subprocess, "run", return_value=response) as run:
            m.cloud("secrets", "versions", "add", m.SECRET, "--data-file=-", fields="name,state", data=m.BUCKET.encode())
        args, kwargs = run.call_args
        self.assertIn("--project=" + m.PROJECT, args[0])
        self.assertIn("--account=" + m.ACCOUNT, args[0])
        self.assertNotIn(m.BUCKET, args[0])
        self.assertEqual(kwargs["input"], m.BUCKET.encode())
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")

    def test_failed_inventory_is_not_absence(self):
        original = self.fake
        def fail_list(*args, **kwargs):
            if args[:3] == ("secrets", "versions", "list"):
                raise SystemExit("STOP: PERMISSION_DENIED")
            return original(*args, **kwargs)
        with patch.object(m, "cloud", fail_list), patch.dict(m.os.environ, {}, clear=True):
            with self.assertRaisesRegex(SystemExit, "PERMISSION_DENIED"):
                m.run(self.directory)
        self.assertFalse(self.writes())


if __name__ == "__main__":
    unittest.main()
