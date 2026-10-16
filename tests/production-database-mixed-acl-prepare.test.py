"""Closed fixtures: never invoke Google, PostgreSQL or a real proxy."""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("acl_prepare", ROOT / "scripts/production-database-mixed-acl-prepare.py")
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)


class OperatorTests(unittest.TestCase):
    def backup(self, **changes):
        value = dict(id="123", instance=op.INSTANCE, type="ON_DEMAND",
                     status="SUCCESSFUL", description=op.BACKUP_DESCRIPTION,
                     endTime=datetime.now(timezone.utc).isoformat())
        value.update(changes)
        return value

    def test_backup_is_operation_specific_and_fresh(self):
        cases = [
            dict(id="456"), dict(instance="another-instance"), dict(type="AUTOMATED"),
            dict(status="RUNNING"), dict(description="another-operation"),
            dict(endTime=(datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()),
            dict(endTime=(datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()),
        ]
        with patch.object(op, "cloud", return_value=json.dumps(self.backup())):
            op.check_backup("123")
        for changes in cases:
            with self.subTest(changes=changes), patch.object(op, "cloud", return_value=json.dumps(self.backup(**changes))):
                with self.assertRaises(op.Stop):
                    op.check_backup("123")

    def test_no_approval_means_no_reads_or_writes(self):
        with patch.object(op, "load_sources") as loader, patch.object(op, "cloud") as cloud:
            with self.assertRaisesRegex(op.Stop, "EXPLICIT_OPERATION_APPROVAL_REQUIRED"):
                op.execute("WRONG", "123")
            loader.assert_not_called()
            cloud.assert_not_called()

    def test_source_hashes_match_reviewed_files(self):
        reader, sql = op.load_sources()
        self.assertEqual(reader.EXPECTED_MANIFEST, "656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf")
        self.assertIn("REPAIR_SYSTEM_MANIFEST_MISMATCH", sql)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "changed"
            path.write_text("changed bytes")
            with self.assertRaisesRegex(op.Stop, "SOURCE_HASH_MISMATCH"):
                op.checked_file(path, op.SQL_SHA256)

    def test_runtime_host_and_query_never_become_connection_instructions(self):
        with patch.object(op, "cloud", side_effect=[
            "postgresql://khedmah_migrator:" + "a" * 64 + "@localhost/khedmah",
            "postgresql://khedmah_app:" + "b" * 64 + "@different-host/khedmah?host=another-host"]):
            self.assertEqual(op.credentials(), {"khedmah_migrator": "a" * 64, "khedmah_app": "b" * 64})

    def test_psql_discards_inherited_pg_overrides_and_hides_errors(self):
        with patch.dict(os.environ, {"PGPASSWORD": "never-print", "PGSERVICE": "rogue",
                                     "PGOPTIONS": "-c role=rogue"}):
            with patch.object(op.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="never-print")) as run:
                with self.assertRaisesRegex(op.Stop, "^SQL_FAILED_DETAILS_WITHHELD$"):
                    op.sql_call("khedmah_app", "SELECT 1", Path("/private/pgpass"), read_only=True)
        call = run.call_args
        self.assertNotIn("PGPASSWORD", call.kwargs["env"])
        self.assertNotIn("PGSERVICE", call.kwargs["env"])
        self.assertIn("default_transaction_read_only=on", call.kwargs["env"]["PGOPTIONS"])
        self.assertNotIn("never-print", str(call.args))
        self.assertEqual(call.args[0][call.args[0].index("-h") + 1], "127.0.0.1")

    @contextlib.contextmanager
    def fixture(self, *, fail_write=None, drift=False, preflight_failure=False):
        writes = []
        def read():
            if preflight_failure:
                raise SystemExit("STOP: rejected catalog")
            print("PRODUCTION_REPAIR_READ_COMPLETED_NO_MUTATION")
        def sql(user, statement, pgpass, *, read_only):
            if read_only:
                return "khedmah|" + user + "|" + user + "|on"
            writes.append(user)
            if len(writes) == fail_write:
                raise op.Stop("SQL_FAILED_DETAILS_WITHHELD")
            return ""
        proxy = SimpleNamespace(poll=lambda: None)
        refs = [None, None, op.Stop("REFERENCE_CHANGED")] if drift else None
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(op, "load_sources", return_value=(SimpleNamespace(run=read), "GUARDED SQL")))
            stack.enter_context(patch.object(op, "check_backup"))
            stack.enter_context(patch.object(op, "check_refs", side_effect=refs))
            stack.enter_context(patch.object(op, "connection", return_value=contextlib.nullcontext((Path("/private/pgpass"), proxy))))
            stack.enter_context(patch.object(op, "sql_call", side_effect=sql))
            output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            yield writes, output

    def test_success_has_two_explicit_commits_and_no_full_repair_claim(self):
        with self.fixture() as (writes, output):
            op.execute(op.CONFIRMATION, "123")
        self.assertEqual(writes, ["khedmah_migrator", "khedmah_app"])
        self.assertIn("STAGE_COMMITTED=MIGRATOR_DEFAULTS", output.getvalue())
        self.assertIn("STAGE_COMMITTED=OWNER_ACL", output.getvalue())
        self.assertIn("ACL_PREPARATION_COMPLETE_RUNTIME_STILL_PRIVILEGED", output.getvalue())

    def test_read_failure_prevents_all_mutations(self):
        with self.fixture(preflight_failure=True) as (writes, output):
            with self.assertRaises(SystemExit):
                op.execute(op.CONFIRMATION, "123")
        self.assertEqual(writes, [])

    def test_first_stage_failure_prevents_owner_stage(self):
        with self.fixture(fail_write=1) as (writes, output):
            with self.assertRaises(op.Stop):
                op.execute(op.CONFIRMATION, "123")
        self.assertEqual(writes, ["khedmah_migrator"])
        self.assertNotIn("STAGE_COMMITTED=", output.getvalue())
        self.assertIn("STAGE_OUTCOME_UNCONFIRMED=MIGRATOR_DEFAULTS", output.getvalue())

    def test_second_stage_failure_reports_partial_completion(self):
        with self.fixture(fail_write=2) as (writes, output):
            with self.assertRaises(op.Stop):
                op.execute(op.CONFIRMATION, "123")
        self.assertIn("STAGE_COMMITTED=MIGRATOR_DEFAULTS", output.getvalue())
        self.assertIn("STAGE_OUTCOME_UNCONFIRMED=OWNER_ACL", output.getvalue())
        self.assertNotIn("ACL_PREPARATION_COMPLETE", output.getvalue())

    def test_drift_between_stages_prevents_owner_write(self):
        with self.fixture(drift=True) as (writes, output):
            with self.assertRaisesRegex(op.Stop, "REFERENCE_CHANGED"):
                op.execute(op.CONFIRMATION, "123")
        self.assertEqual(writes, ["khedmah_migrator"])
        self.assertNotIn("STAGE_ATTEMPT=OWNER_ACL", output.getvalue())

    def test_failure_cleans_private_password_file_and_proxy(self):
        state = dict(running=True, terminated=False)
        def start(*args, **kwargs):
            kwargs["stdout"].write("ready for new connections\n")
            kwargs["stdout"].flush()
            def terminate():
                state.update(running=False, terminated=True)
            return SimpleNamespace(poll=lambda: None if state["running"] else 0,
                                   terminate=terminate, wait=lambda **kwargs: 0)
        with patch.object(op, "credentials", return_value={"khedmah_app": "b" * 64}), patch.object(op.subprocess, "Popen", side_effect=start):
            with self.assertRaisesRegex(RuntimeError, "probe failed"):
                with op.connection() as (pgpass, proxy):
                    saved_path = pgpass
                    self.assertEqual(pgpass.stat().st_mode & 0o777, 0o600)
                    raise RuntimeError("probe failed")
        self.assertFalse(saved_path.exists())
        self.assertTrue(state["terminated"])


if __name__ == "__main__":
    unittest.main()
