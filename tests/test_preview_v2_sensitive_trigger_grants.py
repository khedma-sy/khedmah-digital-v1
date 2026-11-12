"""Offline tests for the Preview V2 fixed-scope sensitive table metadata reader."""
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

SCRIPT = (Path(__file__).resolve().parents[1] /
          "scripts/read-preview-v2-sensitive-trigger-grants.py")
spec = importlib.util.spec_from_file_location("sensitive_guard_reader", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

NAMES = ("audit_logs", "billing_credit_ledger", "billing_usage_receipts",
         "billing_promo_redemptions", "fulfillment_order_events",
         "identity_sessions")


class SensitiveTriggerReaderTests(unittest.TestCase):
    def response(self, enabled="O", mismatch=False):
        tables = []
        for name in NAMES:
            triggers = []
            if name in m.EXPECTED:
                triggers.append({
                    "name": m.EXPECTED[name], "enabled_mode": enabled,
                    "before": True, "on_update": True, "on_delete": True,
                    "per_row": True,
                    "function_name": ("unexpected_function" if mismatch
                                      else "reject_billing_ledger_mutation"),
                })
            tables.append({
                "name": name, "exists": True, "kind": "r",
                "owner": "khedmah_migrator", "rls_enabled": False,
                "rls_forced": False, "app_update": True,
                "app_delete": True, "triggers": triggers,
            })
        return {
            "database": "khedmah", "reader": "khedmah_migrator",
            "read_only": "on", "tables": tables,
        }

    def execute_offline(self, response):
        result = types.SimpleNamespace(returncode=0, stdout=json.dumps(response))
        stub = types.SimpleNamespace(CONNECTION="project:region:db",
                                     DATABASE="khedmah", USER="khedmah_migrator")
        with tempfile.TemporaryDirectory(prefix="offline-sensitive-") as tmp:
            with mock.patch.object(m.subprocess, "run", return_value=result) as proc:
                value = m.query(stub, Path(tmp), "a" * 64)
                call = proc.call_args
                self.assertEqual(call.kwargs["input"], m.SQL)
                self.assertTrue(call.kwargs["env"]["PGOPTIONS"].count("default_transaction_read_only=on"))
                self.assertFalse((Path(tmp) / "metadata.pgpass").exists())
                return value

    def test_static_read_only_sql_and_pinned_source(self):
        self.assertIn("BEGIN READ ONLY;", m.SQL)
        self.assertIn("ROLLBACK;", m.SQL)
        self.assertNotIn("INSERT INTO", m.SQL.upper())
        self.assertNotIn("ALTER TABLE", m.SQL.upper())
        self.assertNotIn("UPDATE public.", m.SQL)
        self.assertNotIn("DELETE FROM", m.SQL.upper())
        self.assertEqual(m.SOURCE_BLOB, "1f1565473cc1ab8d8e98791f0fc4af440f9d3d32")
        self.assertEqual(set(m.EXPECTED), {
            "billing_credit_ledger", "billing_usage_receipts",
            "billing_promo_redemptions",
        })

    def test_unix_socket_path_length_uses_short_temporary_prefix(self):
        import inspect
        source = inspect.getsource(m.inspect)
        self.assertIn('prefix="pv2-"', source)
        connection = "khedmah-preview-v2-20261012:europe-west1:khedmah-preview-v2-db"
        with tempfile.TemporaryDirectory(prefix="pv2-", dir="/tmp") as tmp:
            socket = Path(tmp) / connection / ".s.PGSQL.5432"
            self.assertLess(len(str(socket).encode()), 104)

    def test_active_source_triggers_and_unprotected_audit_are_distinct(self):
        rows = self.execute_offline(self.response())
        mapped = {r["table"]: r for r in rows}
        for name in m.EXPECTED:
            self.assertTrue(mapped[name]["expected_billing_guard_shape_observed"])
        self.assertIsNone(mapped["audit_logs"]["expected_billing_guard_shape_observed"])
        self.assertTrue(mapped["audit_logs"]["app_delete"])

    def test_disabled_or_wrong_body_binding_is_not_certified(self):
        for enabled, mismatch in (("D", False), ("R", False), ("O", True)):
            rows = self.execute_offline(self.response(enabled, mismatch))
            self.assertFalse(next(r for r in rows if
                                  r["table"] == "billing_credit_ledger")
                             ["expected_billing_guard_shape_observed"])

    def test_rejects_non_readonly_or_unexpected_catalog_scope(self):
        bad = self.response()
        bad["read_only"] = "off"
        with self.assertRaisesRegex(SystemExit, "METADATA_RESPONSE_INVALID"):
            self.execute_offline(bad)
        bad = self.response()
        bad["tables"][0]["name"] = "other_table"
        with self.assertRaisesRegex(SystemExit, "TABLE_SCOPE_UNEXPECTED"):
            self.execute_offline(bad)

    def test_rejects_invalid_trigger_metadata_and_missing_db_password(self):
        bad = self.response()
        bad["tables"][1]["triggers"][0]["enabled_mode"] = "X"
        with self.assertRaisesRegex(SystemExit, "TRIGGER_RESPONSE_INVALID"):
            self.execute_offline(bad)
        reader = types.SimpleNamespace(CONNECTION="x", DATABASE="khedmah",
                                       USER="khedmah_migrator")
        with tempfile.TemporaryDirectory(prefix="offline-sensitive-") as d:
            with self.assertRaisesRegex(SystemExit, "MIGRATOR_PASSWORD_FORMAT_REJECTED"):
                m.query(reader, Path(d), "")


if __name__ == "__main__":
    unittest.main()
