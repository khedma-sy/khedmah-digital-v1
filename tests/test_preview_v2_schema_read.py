"""Offline tests for the read-only Preview catalog handoff."""
import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/read-preview-v2-schema.py"
spec = importlib.util.spec_from_file_location("schema_read", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
PASSWORD = "ab" * 32
TOKEN = "synthetic-test-token"


def payload(url=None, name=None):
    url = url or "postgresql://" + m.USER + ":" + PASSWORD + "@localhost/" + m.DATABASE
    return {"name": m.RESOURCE if name is None else name,
            "payload": {"data": base64.b64encode(url.encode()).decode()}}


def catalog():
    return {"database": m.DATABASE, "user": m.USER, "read_only": "on", "server_version_num": 160001,
            "roles": [{"name": name} for name in m.ROLES], "memberships": [], "database_privileges": [],
            "schemas": [{"name": "public", "owner": "pg_database_owner"}],
            "relation_count": 0, "relations": [], "routine_count": 0, "default_acls": []}


class CredentialTests(unittest.TestCase):
    def test_only_existing_version_one_and_exact_credential_target_accepted(self):
        self.assertEqual(m.password_from_payload(payload()), PASSWORD)
        for name in (m.RESOURCE.replace("/1", "/2"), m.RESOURCE.replace(m.NUMBER, "999")):
            with self.assertRaisesRegex(SystemExit, "IDENTITY"):
                m.password_from_payload(payload(name=name))
        for url in ("postgresql://postgres:" + PASSWORD + "@localhost/khedmah",
                    "postgresql://" + m.USER + ":" + PASSWORD + "@foreign/khedmah",
                    "postgresql://" + m.USER + ":" + PASSWORD + "@localhost/other",
                    "postgresql://" + m.USER + ":" + PASSWORD + "@localhost/khedmah?options=unsafe",
                    "postgresql://" + m.USER + ":synthetic@localhost/khedmah"):
            with self.assertRaisesRegex(SystemExit, "TARGET_REJECTED"):
                m.password_from_payload(payload(url))

    def test_malformed_payloads_do_not_leak(self):
        for value in ({"name": m.RESOURCE}, {"name": m.RESOURCE, "payload": {"data": "invalid!"}},
                      {"name": m.RESOURCE, "payload": {"data": 123}}):
            with self.assertRaises(SystemExit) as caught:
                m.password_from_payload(value)
            self.assertNotIn("invalid!", str(caught.exception))

    def test_secret_get_is_fixed_and_never_sent_in_query(self):
        opener = Mock()
        opener.open.return_value = io.BytesIO(json.dumps(payload()).encode())
        with patch.object(m.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(m.read_password(TOKEN), PASSWORD)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.method, "GET")
        self.assertEqual(request.full_url, m.ACCESS_URL)
        self.assertIsNone(request.data)
        self.assertEqual(request.get_header("Authorization"), "Bearer " + TOKEN)
        self.assertNotIn(TOKEN, request.full_url)

    def test_secret_access_errors_redacted_and_redirects_refused(self):
        for error in (urllib.error.HTTPError("https://example.invalid/" + TOKEN, 403, TOKEN, {}, io.BytesIO(TOKEN.encode())),
                      OSError(TOKEN)):
            opener = Mock()
            opener.open.side_effect = error
            with patch.object(m.urllib.request, "build_opener", return_value=opener):
                with self.assertRaises(SystemExit) as caught:
                    m.read_password(TOKEN)
            self.assertNotIn(TOKEN, str(caught.exception))
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid"))


class CatalogTests(unittest.TestCase):
    def invoke(self, value=None, status=0, exception=None):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            def fake_run(args, **kwargs):
                passfile = work / "pgpass"
                self.assertEqual(stat.S_IMODE(passfile.stat().st_mode), 0o600)
                escaped = str(work / m.CONNECTION).replace(":", "\\:")
                self.assertEqual(passfile.read_text(), escaped + ":5432:khedmah:khedmah_migrator:" + PASSWORD + "\n")
                self.assertEqual(args[args.index("-h") + 1], str(work / m.CONNECTION))
                self.assertEqual(args[args.index("-U") + 1], m.USER)
                self.assertEqual(args[args.index("-d") + 1], m.DATABASE)
                self.assertIn("-X", args)
                self.assertIn("-w", args)
                self.assertNotIn(PASSWORD, " ".join(args))
                self.assertNotIn("PGPASSWORD", kwargs["env"])
                self.assertNotIn("PGSERVICE", kwargs["env"])
                self.assertNotIn("CSQL_PROXY_TOKEN", kwargs["env"])
                self.assertIn("default_transaction_read_only=on", kwargs["env"]["PGOPTIONS"])
                self.assertIn("search_path=pg_catalog", kwargs["env"]["PGOPTIONS"])
                self.assertEqual(kwargs["input"], m.CATALOG_SQL)
                self.assertTrue(kwargs["capture_output"])
                if exception:
                    raise exception
                raw = value if isinstance(value, str) else json.dumps(catalog() if value is None else value)
                return subprocess.CompletedProcess(args, status, raw, PASSWORD)
            with patch.dict(m.os.environ, {"PGPASSWORD": "foreign", "PGSERVICE": "foreign", "CSQL_PROXY_TOKEN": TOKEN}):
                with patch.object(m.subprocess, "run", side_effect=fake_run):
                    try:
                        return m.read_catalog(work, PASSWORD)
                    finally:
                        self.assertFalse((work / "pgpass").exists())

    def test_catalog_uses_read_only_session_and_cleans_private_passfile(self):
        value = self.invoke()
        self.assertTrue(value["relation_inventory_complete"])

    def test_psql_failure_timeout_and_bad_json_cleanup_without_echo(self):
        for params in ({"status": 1}, {"exception": subprocess.TimeoutExpired("psql", 60)},
                       {"value": "not-json-" + PASSWORD}):
            with self.assertRaises((SystemExit, subprocess.TimeoutExpired)) as caught:
                self.invoke(**params)
            self.assertNotIn(PASSWORD, str(caught.exception))

    def test_wrong_database_user_read_mode_version_and_missing_roles_rejected(self):
        for fields in ({"database": "other"}, {"user": "postgres"}, {"read_only": "off"},
                       {"server_version_num": 150000}, {"server_version_num": 170000}, {"roles": []}):
            with self.assertRaises(SystemExit):
                self.invoke({**catalog(), **fields})

    def test_catalog_counts_shapes_and_unexpected_fields_fail_closed(self):
        for fields in ({"relation_count": -1}, {"relation_count": True}, {"relations": "bad"},
                       {"relation_count": 1}, {"unexpected": PASSWORD}, {"schemas": [None]}):
            with self.assertRaises(SystemExit):
                self.invoke({**catalog(), **fields})

    def test_bounded_relation_inventory_never_claims_completeness(self):
        value = self.invoke({**catalog(), "relation_count": 201, "relations": [{}] * 200})
        self.assertFalse(value["relation_inventory_complete"])

    def test_query_contains_no_application_rows_or_write_commands(self):
        upper = m.CATALOG_SQL.upper()
        self.assertTrue(upper.strip().startswith("BEGIN READ ONLY;"))
        self.assertTrue(upper.strip().endswith("ROLLBACK;"))
        # These would materially change the read-only catalog contract.
        for token in ("CREATE TABLE", "ALTER ", "GRANT ", "REVOKE ", "INSERT INTO",
                      "UPDATE PUBLIC.", "DELETE FROM", "COPY ", "\\!", "PG_AUTHID", "ROLPASSWORD"):
            self.assertNotIn(token, upper)
        self.assertNotIn("FROM public.", m.CATALOG_SQL)
        self.assertIn("pg_default_acl", m.CATALOG_SQL)
        self.assertIn("has_table_privilege", m.CATALOG_SQL)


class InspectionTests(unittest.TestCase):
    def instance(self):
        return {"name": m.INSTANCE, "project": m.PROJECT, "region": m.REGION,
                "connectionName": m.CONNECTION, "state": "RUNNABLE", "databaseVersion": "POSTGRES_16"}

    def test_instance_identity_and_state_guards(self):
        m.validate_instance(self.instance())
        for key, value in (("name", "other"), ("project", "khedma-dl"), ("region", "other"),
                           ("connectionName", "other"), ("state", "PENDING"), ("databaseVersion", "POSTGRES_15")):
            with self.assertRaises(SystemExit):
                m.validate_instance({**self.instance(), key: value})

    def test_proxy_environment_clears_implicit_credentials_and_config(self):
        with patch.dict(m.os.environ, {"CSQL_PROXY_PORT": "1", "CSQL_PROXY_INSTANCES": "foreign",
                        "GOOGLE_APPLICATION_CREDENTIALS": "foreign", "PGPASSWORD": PASSWORD}, clear=True):
            self.assertEqual(m.proxy_environment(TOKEN), {"CSQL_PROXY_TOKEN": TOKEN})

    def test_inspect_success_stops_private_proxy_and_removes_work_directory(self):
        proxy, created = Mock(), []
        proxy.poll.return_value = None
        def fake_popen(args, **kwargs):
            self.assertEqual(args[:2], ["cloud-sql-proxy", m.CONNECTION])
            self.assertEqual(kwargs["env"]["CSQL_PROXY_TOKEN"], TOKEN)
            self.assertNotIn(TOKEN, " ".join(args))
            work = Path(args[2].split("=", 1)[1])
            self.assertEqual(stat.S_IMODE(work.stat().st_mode), 0o700)
            created.append(work)
            (work / m.CONNECTION).mkdir()
            # Model readiness; this offline runner prohibits socket creation.
            (work / m.CONNECTION / ".s.PGSQL.5432").touch()
            return proxy
        out = io.StringIO()
        with patch.object(m, "preflight"), patch.object(m.shutil, "which", return_value="/fake"):
            with patch.object(m, "cloud", side_effect=[self.instance(), {"name": m.RESOURCE, "state": "ENABLED"}, TOKEN.encode()]):
                with patch.object(m, "read_password", return_value=PASSWORD), patch.object(m.subprocess, "Popen", side_effect=fake_popen):
                    with patch.object(m, "read_catalog", return_value=catalog()), contextlib.redirect_stdout(out):
                        with patch.object(m.stat, "S_ISSOCK", return_value=True):
                            m.inspect()
        proxy.terminate.assert_called_once()
        self.assertFalse(created[0].exists())
        value = json.loads(out.getvalue())
        self.assertTrue(value["secret_payload_access"])
        for flag in ("credential_values_printed", "application_data_rows_read", "schema_mutation",
                     "cloud_resource_mutation", "runtime_grants_mutation", "schema_readiness_verified"):
            self.assertFalse(value[flag])
        self.assertNotIn(PASSWORD, out.getvalue())
        self.assertNotIn(TOKEN, out.getvalue())

    def test_disabled_or_other_secret_version_stops_before_payload_and_proxy(self):
        for version in ({"name": m.RESOURCE, "state": "DISABLED"},
                        {"name": m.RESOURCE.replace("/1", "/2"), "state": "ENABLED"}):
            with patch.object(m, "preflight"), patch.object(m.shutil, "which", return_value="/fake"):
                with patch.object(m, "cloud", side_effect=[self.instance(), version]), patch.object(m, "read_password") as read:
                    with patch.object(m.subprocess, "Popen") as popen, self.assertRaises(SystemExit):
                        m.inspect()
                    read.assert_not_called()
                    popen.assert_not_called()

    def test_proxy_timeout_cleanup_escalates_only_own_process(self):
        proxy = Mock()
        proxy.poll.return_value = None
        proxy.wait.side_effect = [subprocess.TimeoutExpired("proxy", 10), 0]
        m.stop_proxy(proxy)
        proxy.terminate.assert_called_once()
        proxy.kill.assert_called_once()

    def test_preflight_target_account_and_overrides(self):
        good = [b"", b"(unset)", b"", {}, [{"account": m.ACCOUNT}],
                {"projectId": m.PROJECT, "projectNumber": m.NUMBER, "lifecycleState": "ACTIVE",
                 "parent": {"type": "organization", "id": m.ORGANIZATION}}]
        with patch.dict(m.os.environ, {}, clear=True), patch.object(m, "cloud", side_effect=good):
            m.preflight()
        for name in ("CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
                     "CLOUDSDK_API_ENDPOINT_OVERRIDES_SQL"):
            with patch.dict(m.os.environ, {name: "foreign"}, clear=True), patch.object(m, "cloud") as cloud:
                with self.assertRaises(SystemExit):
                    m.preflight()
                cloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
