import contextlib
import importlib.util
import io
import json
from pathlib import Path
import types
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("readback", root / "scripts/production-database-mixed-acl-read.py")
readback = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readback)

def record(user):
    return dict(database="khedmah", current_user=user, session_user=user,
                read_only="on", evidence_utc="2026-10-11T12:55:00.123456",
                system_role_manifest_sha256=readback.EXPECTED_MANIFEST,
                **{key: True for key in readback.CHECKS})

class FakeOperator:
    def __init__(self, *, fail_runtime=False, drift=False):
        self.calls = []
        self.closed = False
        self.fail_runtime = fail_runtime
        self.drift = drift
        self.refs = 0
    def load_sources(self):
        return types.SimpleNamespace(MANIFEST_SQL="SELECT 'R|1' AS line"), "UNUSED"
    def check_refs(self, reader):
        self.refs += 1
        if self.drift and self.refs == 2:
            raise RuntimeError("PRIVATE_SENTINEL")
    @contextlib.contextmanager
    def connection(self):
        try:
            yield "private-pgpass", types.SimpleNamespace(poll=lambda: None)
        finally:
            self.closed = True
    def sql_call(self, user, sql, pgpass, *, read_only):
        if not read_only or not sql.startswith("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"):
            raise AssertionError("write-capable call")
        self.calls.append(user)
        if self.fail_runtime and user == "khedmah_app":
            raise RuntimeError("PRIVATE_SENTINEL")
        return json.dumps(record(user))
    def execute(self, *args):
        raise AssertionError("mutation called")

class Tests(unittest.TestCase):
    def test_two_fresh_read_only_identities_and_cleanup(self):
        operator = FakeOperator()
        with contextlib.redirect_stdout(io.StringIO()) as out:
            readback.run(operator)
        self.assertEqual(operator.calls, ["khedmah_migrator", "khedmah_app"])
        self.assertTrue(operator.closed)
        self.assertIn("PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION", out.getvalue())

    def test_runtime_failure_never_reports_completion_and_masks_error(self):
        operator = FakeOperator(fail_runtime=True)
        original = readback.load_operator
        readback.load_operator = lambda: operator
        try:
            with contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(readback.main(), 1)
            self.assertNotIn("PRIVATE_SENTINEL", out.getvalue())
            self.assertNotIn("PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION", out.getvalue())
            self.assertTrue(operator.closed)
        finally:
            readback.load_operator = original

    def test_post_read_reference_drift_blocks_completion(self):
        operator = FakeOperator(drift=True)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            with self.assertRaises(RuntimeError):
                readback.run(operator)
        self.assertNotIn("PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION", out.getvalue())
        self.assertTrue(operator.closed)

    def test_drift_nulls_numeric_truth_and_wrong_identity_are_rejected(self):
        cases = [(key, value) for key in readback.CHECKS for value in (False, None, 1)]
        cases += [("database", "postgres"), ("current_user", "postgres"),
                  ("session_user", "postgres"), ("read_only", "off"),
                  ("system_role_manifest_sha256", "0" * 64), ("evidence_utc", "PRIVATE_SENTINEL")]
        for key, value in cases:
            with self.subTest(key=key, value=value):
                candidate = record("khedmah_migrator")
                candidate[key] = value
                with self.assertRaises(ValueError):
                    readback.validate(candidate, "khedmah_migrator")
        candidate = record("khedmah_migrator")
        candidate["unexpected_sensitive_value"] = "PRIVATE_SENTINEL"
        self.assertNotIn("PRIVATE_SENTINEL", json.dumps(readback.validate(candidate, "khedmah_migrator")))

if __name__ == "__main__":
    unittest.main()
