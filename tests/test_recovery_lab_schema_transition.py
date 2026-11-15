"""Offline tests for isolated 036+037 lab transition. No GCP access."""
import importlib.util
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
             patch.object(m, "call", side_effect=fake):
            self.assertEqual(m.guarded_preflight(), "10.166.1.9")
        def extra_job(args, *, data=None, timeout=240, output_json=False):
            if args[:3] == ["run", "services", "list"]: return [{"name": "writer"}]
            raise AssertionError(args)
        with patch.object(m.catalog, "preflight", return_value="10.166.1.9"), \
             patch.object(m, "call", side_effect=extra_job):
            with self.assertRaisesRegex(m.GuardStop, "WRITERS_NOT_QUIESCENT"):
                m.guarded_preflight()

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
             patch.object(m.catalog, "run_job", return_value=rows), \
             patch.object(m.catalog, "require_markers", return_value={}):
            self.assertEqual(m.apply("10.166.1.9", "BEGIN;COMMIT;"), 0)
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
             patch.object(m.catalog, "run_job", side_effect=m.GuardStop("TEST_JOB_FAILED")):
            with self.assertRaisesRegex(m.GuardStop, "TEST_JOB_FAILED"):
                m.apply("10.166.1.9", "BEGIN;COMMIT;")
        self.assertTrue(any(c[:3] == ("run", "jobs", "delete") for c in calls))
        self.assertTrue(any(c[:3] == ("iam", "service-accounts", "delete") for c in calls))
        self.assertEqual(sum(c[:2] == ("secrets", "delete") for c in calls), 2)

if __name__ == "__main__":
    unittest.main()
