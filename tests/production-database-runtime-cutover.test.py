import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cutover", root / "scripts/production-database-runtime-cutover.py")
cutover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cutover)

def record(user="khedmah_migrator", database="khedmah"):
    return dict(database=database, current_user=user, session_user=user,
                read_only="on", evidence_utc="2026-10-11T14:00:00.123456",
                system_role_manifest_sha256=cutover.EXPECTED_MANIFEST,
                **{key: True for key in cutover.CHECKS})

class FakeOperator:
    PROJECT = "khedma-dl"
    INSTANCE = "khedmah-v1-db"
    PORT = "19475"

    def __init__(self):
        now = datetime.now(timezone.utc)
        self.backup = dict(id="1234", instance=self.INSTANCE, type="ON_DEMAND",
                           status="SUCCESSFUL", description=cutover.BACKUP_DESCRIPTION,
                           startTime=(now - timedelta(minutes=3)).isoformat(),
                           endTime=(now - timedelta(minutes=1)).isoformat())
        self.calls = []
        self.mutations = []
        self.fail_stage = None
        self.flags_path = None
        self.password = None
        self.bad_runtime = False
        self.pending = False
        self.closed = False

    def check_refs(self, reader):
        pass

    def cloud(self, *args):
        self.calls.append(args)
        if args[:3] == ("sql", "backups", "describe"):
            return json.dumps(self.backup)
        if args[:3] == ("sql", "users", "list"):
            return json.dumps([dict(name=name, type="BUILT_IN") for name in
                               ("postgres", "khedmah_app", "khedmah_migrator")])
        if args[:3] == ("sql", "operations", "list"):
            return "[]"
        if args[:3] == ("sql", "users", "describe"):
            return json.dumps(dict(name="khedmah_app", type="BUILT_IN",
                                   databaseRoles=[] if self.bad_runtime else ["khedmah_runtime_role"]))
        if args[:3] == ("sql", "operations", "describe"):
            return json.dumps(self.operation)
        if args[:3] not in (("sql", "users", "set-password"), ("sql", "users", "assign-roles"),
                            ("sql", "instances", "restart")):
            raise AssertionError("Unexpected cloud call: " + str(args))
        self.mutations.append(args)
        if args[2] == "set-password":
            self.flags_path = Path(next(arg.split("=", 1)[1] for arg in args if arg.startswith("--flags-file=")))
            assert self.flags_path.stat().st_mode & 0o777 == 0o600
            assert self.flags_path.parent.stat().st_mode & 0o777 == 0o700
            self.password = json.loads(self.flags_path.read_text())["--password"]
            assert len(self.password) == 64 and all(c in "0123456789abcdef" for c in self.password)
            assert all(self.password not in arg for arg in args)
        if self.fail_stage == args[2]:
            raise RuntimeError("PRIVATE_ERROR_SENTINEL")
        self.operation = dict(name="12345678-abcd-1234-abcd-123456789abc", targetId=self.INSTANCE,
                              targetProject=self.PROJECT, operationType="RESTART" if args[2] == "restart" else "UPDATE_USER",
                              status="RUNNING" if self.pending else "DONE")
        return json.dumps(self.operation)

    @contextlib.contextmanager
    def connection(self):
        with tempfile.TemporaryDirectory() as folder:
            pgpass = Path(folder) / "pgpass"
            pgpass.write_text("127.0.0.1:19475:khedmah:khedmah_migrator:" + "a" * 64 + "\n"
                              "127.0.0.1:19475:khedmah:khedmah_app:" + "b" * 64 + "\n")
            pgpass.chmod(0o600)
            try:
                yield pgpass, types.SimpleNamespace(poll=lambda: None)
            finally:
                self.closed = True

def preflight_ok(operator):
    print("PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION")

class Tests(unittest.TestCase):
    def execute(self, operator, preflight=preflight_ok):
        with patch.object(cutover, "load_bundle", return_value=(
                operator, object(), types.SimpleNamespace(run=preflight), "READ ONLY __RESTART_MILLIS__")), \
             patch.object(cutover, "postflight") as postflight, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            cutover.execute(cutover.CONFIRMATION, "1234")
        return output.getvalue(), postflight

    def test_confirmation_required_before_any_source_or_cloud_access(self):
        with patch.object(cutover, "load_bundle") as bundle:
            with self.assertRaisesRegex(cutover.Stop, "APPROVAL_REQUIRED"):
                cutover.execute("", "1234")
            bundle.assert_not_called()

    def test_all_pinned_sources_load_without_executing_tools(self):
        with patch.object(cutover.subprocess, "run", side_effect=AssertionError("Unexpected subprocess")):
            operator, _, _, sql = cutover.load_bundle()
        self.assertEqual(operator.INSTANCE, "khedmah-v1-db")
        self.assertIn("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;", sql)

    def test_stale_wrong_future_or_pre_phase_a_backups_block_all_mutations(self):
        cases = [("instance", "other"), ("status", "RUNNING"), ("type", "AUTOMATED"),
                 ("description", "old-backup"),
                 ("startTime", cutover.AFTER_PHASE_A.isoformat()),
                 ("endTime", (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()),
                 ("endTime", (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat())]
        for key, value in cases:
            with self.subTest(key=key, value=value):
                operator = FakeOperator()
                operator.backup[key] = value
                with self.assertRaises(cutover.Stop):
                    self.execute(operator)
                self.assertEqual(operator.mutations, [])

    def test_failed_preflight_blocks_all_mutations(self):
        operator = FakeOperator()
        def fail(_):
            raise RuntimeError("PRIVATE_ERROR_SENTINEL")
        with self.assertRaises(RuntimeError):
            self.execute(operator, fail)
        self.assertEqual(operator.mutations, [])

    def test_success_orders_containment_demotion_restart_and_verification(self):
        operator = FakeOperator()
        output, postflight = self.execute(operator)
        self.assertEqual([args[2] for args in operator.mutations], ["set-password", "assign-roles", "restart"])
        self.assertIn("--revoke-existing-roles", operator.mutations[1])
        self.assertFalse(operator.flags_path.exists())
        self.assertNotIn(operator.password, output)
        self.assertIn("RUNTIME_CUTOVER_AND_ISOLATION_VERIFIED", output)
        self.assertRegex(postflight.call_args.args[3], r"^[0-9]{13}$")

    def test_partial_failure_never_retries_or_advances_and_cleans_password(self):
        for stage, expected in (("set-password", 1), ("assign-roles", 2), ("restart", 3)):
            operator = FakeOperator()
            operator.fail_stage = stage
            with self.subTest(stage=stage), patch.object(cutover, "load_bundle", return_value=(
                    operator, object(), types.SimpleNamespace(run=preflight_ok), "SQL")), \
                 patch.object(cutover, "postflight") as postflight, \
                 patch("sys.argv", ["cutover", "--confirm", cutover.CONFIRMATION, "--backup-id", "1234"]), \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cutover.main(), 1)
                self.assertEqual(len(operator.mutations), expected)
                postflight.assert_not_called()
                self.assertFalse(operator.flags_path.exists())
                self.assertNotIn("PRIVATE_ERROR_SENTINEL", output.getvalue())
                self.assertNotIn(operator.password, output.getvalue())
                self.assertIn("STOP_DO_NOT_RERUN", output.getvalue())
                self.assertNotIn("RUNTIME_CUTOVER_AND_ISOLATION_VERIFIED", output.getvalue())

    def test_wrong_control_membership_blocks_restart(self):
        operator = FakeOperator()
        operator.bad_runtime = True
        with self.assertRaisesRegex(cutover.Stop, "RUNTIME_CONTROL_STATE_NOT_READY"):
            self.execute(operator)
        self.assertEqual([args[2] for args in operator.mutations], ["set-password", "assign-roles"])

    def test_operation_drift_error_and_timeout_never_certify_success(self):
        operator = FakeOperator()
        operator.cloud("sql", "instances", "restart", operator.INSTANCE)
        for key, value in (("targetId", "other"), ("targetProject", "other"),
                           ("operationType", "DELETE"), ("name", "unexpected"),
                           ("status", "unknown"), ("error", {"errors": [{"message": "PRIVATE"}]})):
            operation = dict(operator.operation, **{key: value})
            with self.subTest(key=key), self.assertRaises(cutover.Stop):
                cutover.valid_operation(operation, operator, "RESTART")
        operator.pending = True
        with patch.object(cutover.time, "monotonic", side_effect=[0, 901]), \
             patch.object(cutover.time, "sleep"), contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(cutover.Stop, "WAIT_TIMEOUT"):
                cutover.mutate(operator, "RESTART", "RESTART", "sql", "instances", "restart", operator.INSTANCE)
        self.assertNotIn("STAGE_DONE=", output.getvalue())

    def test_postflight_rejects_drift_nulls_and_numeric_truth(self):
        cases = [(key, value) for key in cutover.CHECKS for value in (False, None, 1)]
        cases += [("database", "postgres"), ("current_user", "postgres"), ("session_user", "postgres"),
                  ("read_only", "off"), ("system_role_manifest_sha256", "0" * 64)]
        for key, value in cases:
            with self.subTest(key=key, value=value), self.assertRaises(cutover.Stop):
                cutover.validate_postflight(dict(record(), **{key: value}), "khedmah_migrator", "khedmah")

    def test_postflight_uses_four_fresh_reads_and_private_passfile_cleanup(self):
        operator = FakeOperator()
        def query(op, user, database, sql, pgpass):
            self.assertEqual(pgpass.stat().st_mode & 0o777, 0o600)
            self.assertIn(":postgres:khedmah_migrator:", pgpass.read_text())
            self.assertNotIn(":postgres:khedmah_app:", pgpass.read_text())
            return record(user, database)
        with patch.object(cutover, "postflight_query", side_effect=query) as query_mock, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            cutover.postflight(operator, object(), "READ ONLY __RESTART_MILLIS__", "1791729000000")
        self.assertEqual(query_mock.call_count, 4)
        self.assertTrue(operator.closed)
        self.assertEqual(len(output.getvalue().splitlines()), 4)

    def test_query_cleans_ambient_pg_overrides_and_hides_failure_details(self):
        with patch.dict(os.environ, PGHOSTADDR="external", PGSERVICE="rogue", PGPASSWORD="PRIVATE"), \
             patch.object(cutover.subprocess, "run", return_value=types.SimpleNamespace(
                 returncode=0, stdout=json.dumps(record()))) as run:
            cutover.postflight_query(FakeOperator(), "khedmah_migrator", "khedmah", "SQL", Path("/private/pass"))
        self.assertFalse({"PGHOSTADDR", "PGSERVICE", "PGPASSWORD"} & run.call_args.kwargs["env"].keys())
        self.assertIn("default_transaction_read_only=on", run.call_args.kwargs["env"]["PGOPTIONS"])
        self.assertIn("-w", run.call_args.args[0])
        with patch.object(cutover.subprocess, "run", return_value=types.SimpleNamespace(
                returncode=1, stdout="PRIVATE", stderr="PRIVATE")), \
             self.assertRaisesRegex(cutover.Stop, "^POSTFLIGHT_SQL_FAILED$"):
            cutover.postflight_query(FakeOperator(), "khedmah_migrator", "khedmah", "SQL", Path("/private/pass"))

if __name__ == "__main__":
    unittest.main()
