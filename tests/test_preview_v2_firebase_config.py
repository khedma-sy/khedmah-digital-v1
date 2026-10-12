"""Exercise the real five-value configuration flow through recorded HTTP calls."""
import base64
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

spec = importlib.util.spec_from_file_location("config", Path(__file__).resolve().parents[1]
                                           / "scripts/configure-preview-v2-firebase.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
TOKEN = "DO_NOT_PRINT_ACCESS_TOKEN"
KEY = "DO_NOT_PRINT_FIREBASE_API_KEY"
UID = "key-uid"
KEY_NAME = m.KEY_PARENT + "/canonical-browser-key"


class Cloud:
    def __init__(self):
        self.calls, self.commands = [], []
        self.gcp_id, self.override = m.PROJECT, False
        self.firebase_project = dict(name=m.PARENT, projectId=m.PROJECT, projectNumber=m.NUMBER, state="ACTIVE")
        self.apps = [dict(name=m.APP, projectId=m.PROJECT, appId=m.APP_ID,
                          displayName=m.WEB_NAME, state="ACTIVE", apiKeyId=UID)]
        self.config = dict(projectId=m.PROJECT, projectNumber=m.NUMBER, appId=m.APP_ID,
                           authDomain=m.PROJECT + ".firebaseapp.com", messagingSenderId=m.NUMBER, apiKey=KEY)
        self.keys = [dict(name=KEY_NAME, uid=UID, restrictions=dict(apiTargets=[
            dict(service="identitytoolkit.googleapis.com"), dict(service="securetoken.googleapis.com")]))]
        self.actual_key = KEY
        self.secrets = {name: [] for name in m.FIELDS}
        self.denied, self.denied_secret, self.lost_reply, self.failed_post = None, None, None, None
        self.corrupt_readback, self.foreign_readback = False, False
        self.repeat_pages = False
        self.key_pages = False

    def gcloud(self, args, **kwargs):
        self.commands.append(args)
        assert "--project=" + m.PROJECT in args and "--account=" + m.ACCOUNT in args
        assert kwargs["stdin"] == subprocess.DEVNULL
        assert kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"] == "false"
        if args[1:3] == ["config", "get-value"]:
            return subprocess.CompletedProcess(args, 0, "override" if self.override else "(unset)", "")
        if args[1:3] == ["auth", "print-access-token"]:
            return subprocess.CompletedProcess(args, 0, TOKEN, "")
        if args[1:3] == ["projects", "describe"]:
            data = dict(projectId=self.gcp_id, projectNumber=m.NUMBER, lifecycleState="ACTIVE",
                        parent=dict(type="organization", id=m.ORGANIZATION))
        elif args[1:3] == ["services", "list"]:
            data = [dict(config=dict(name=s)) for s in ("firebase.googleapis.com", "apikeys.googleapis.com", "secretmanager.googleapis.com")]
        else:
            raise AssertionError("Unexpected gcloud call")
        return subprocess.CompletedProcess(args, 0, json.dumps(data), "")

    def put(self, name, value=None, state="ENABLED"):
        value = self.config[m.FIELDS[name]] if value is None else value
        version = len(self.secrets[name]) + 1
        self.secrets[name].append(dict(name=m.SM_PARENT + name + "/versions/" + str(version), state=state, value=value))

    def open(self, request, timeout):
        url = urllib.parse.urlsplit(request.full_url)
        path = urllib.parse.unquote(url.path)
        query = urllib.parse.parse_qs(url.query)
        method = request.get_method()
        body = json.loads(request.data) if request.data else None
        self.calls.append((method, request.full_url, body))
        assert request.headers["Authorization"] == "Bearer " + TOKEN
        assert request.headers["X-goog-user-project"] == m.PROJECT and timeout == 45
        if self.denied and self.denied in path:
            raise urllib.error.HTTPError(request.full_url, 403, "DO_NOT_PRINT_ERROR", {}, io.BytesIO(b"DO_NOT_PRINT_BODY"))
        if url.netloc == "firebase.googleapis.com":
            assert method == "GET"
            path = path.removeprefix("/v1beta1/")
            if path == m.PARENT:
                data = self.firebase_project
            elif path == m.PARENT + "/webApps":
                assert query["showDeleted"] == ["true"]
                data = dict(apps=self.apps)
            elif path == m.APP + "/config":
                data = self.config
            else:
                raise AssertionError("Unexpected Firebase path")
        elif url.netloc == "apikeys.googleapis.com":
            assert method == "GET"
            path = path.removeprefix("/v2/")
            if path == m.KEY_PARENT:
                data = dict(keys=self.keys)
                if self.key_pages and "pageToken" not in query:
                    data = dict(keys=[dict(name=m.KEY_PARENT + "/other-key", uid="other")], nextPageToken="keys/+2")
                if self.repeat_pages:
                    data = dict(keys=[], nextPageToken="repeat")
            elif path == KEY_NAME + "/keyString":
                data = dict(keyString=self.actual_key)
            else:
                raise AssertionError("Unexpected key path")
        elif url.netloc == "secretmanager.googleapis.com":
            path = path.removeprefix("/v1/" + m.SM_PARENT)
            name = path.split("/")[0].split(":")[0]
            assert name in m.FIELDS
            suffix = path[len(name):]
            if suffix == "":
                assert method == "GET"
                data = dict(name=m.SM_PARENT + name)
            elif suffix == ":testIamPermissions":
                assert method == "POST" and body == {"permissions": m.PERMISSIONS}
                data = dict(permissions=[] if self.denied_secret == name else list(reversed(m.PERMISSIONS)))
            elif suffix == "/versions":
                data = dict(versions=[{k: v[k] for k in ("name", "state")} for v in self.secrets[name]])
            elif suffix == ":addVersion":
                assert method == "POST"
                if self.failed_post == name:
                    raise OSError("DO_NOT_PRINT_ERROR")
                value = base64.b64decode(body["payload"]["data"]).decode()
                assert value == self.config[m.FIELDS[name]]
                self.put(name, value)
                if self.lost_reply == name:
                    raise OSError("DO_NOT_PRINT_ERROR")
                data = {k: self.secrets[name][-1][k] for k in ("name", "state")}
            elif suffix == "/versions/1":
                data = {k: self.secrets[name][0][k] for k in ("name", "state")}
            elif suffix == "/versions/1:access":
                value = "wrong-value" if self.corrupt_readback else self.secrets[name][0]["value"]
                target = "projects/foreign/secrets/OTHER/versions/1" if self.foreign_readback else m.SM_PARENT + name + "/versions/1"
                data = dict(name=target, payload=dict(data=base64.b64encode(value.encode()).decode()))
            else:
                raise AssertionError("Unexpected secret path")
        else:
            raise AssertionError("Unexpected host")
        return io.BytesIO(json.dumps(data).encode())

    def mutations(self):
        return [c for c in self.calls if c[0] == "POST" and "testIamPermissions" not in c[1]]


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / "journal"
        self.cloud, self.output = Cloud(), io.StringIO()

    def run_helper(self, apply=True):
        with patch.dict(m.os.environ, {}, clear=True), patch.object(m.subprocess, "run", self.cloud.gcloud), \
                patch.object(m.urllib.request, "build_opener", return_value=self.cloud), contextlib.redirect_stdout(self.output):
            m.run(apply, self.directory)
        self.assertNotIn("DO_NOT_PRINT", self.output.getvalue())
        return [json.loads(line) for line in self.output.getvalue().splitlines()]

    def test_plan_is_read_only_and_optional_fields_are_not_fabricated(self):
        rows = self.run_helper(False)
        self.assertEqual(len(self.cloud.mutations()), 0)
        self.assertFalse(self.directory.exists())
        self.assertFalse(rows[0]["sdk_storage_bucket_present"])
        self.assertFalse(rows[0]["sdk_measurement_id_present"])
        self.assertEqual(len(rows[-2]["create_versions"]), 5)
        self.assertEqual(rows[-1]["stage"], "PREVIEW_FIREBASE_CONFIG_PLAN_COMPLETE_NO_MUTATION")

    def test_apply_stages_exact_five_values_verifies_payloads_and_rerun_does_not_duplicate(self):
        rows = self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 5)
        self.assertEqual(rows[-1]["stage"], "PREVIEW_V2_FIREBASE_CORE_CONFIG_STAGED")
        self.assertEqual(rows[-1]["verified_secret_count"], 5)
        for field in ("browser_configuration_ready", "auth_providers_configured", "runtime_access_verified",
                      "api_key_restrictions_verified", "application_deployed", "floot_connected"):
            self.assertFalse(rows[-1][field])
        self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 5)
        state = self.directory / "state.json"
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(KEY, state.read_text())
        self.assertNotIn(TOKEN, state.read_text())
        self.assertNotIn("payload", state.read_text())
        self.assertTrue(all(r["verified"] for r in json.loads(state.read_text())["secrets"].values()))

    def test_existing_identical_values_are_reused_but_mismatch_anywhere_prevents_all_writes(self):
        last = list(m.FIELDS)[-1]
        self.cloud.put(last, "DO_NOT_PRINT_WRONG_VALUE")
        with self.assertRaisesRegex(SystemExit, "EXISTING_SECRET_VALUE_MISMATCH"):
            self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])
        self.cloud.secrets[last] = []
        self.cloud.put(last)
        self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 4)
        self.assertNotIn("DO_NOT_PRINT", self.output.getvalue())

    def test_disabled_destroyed_or_multiple_versions_stop_before_writes(self):
        name = list(m.FIELDS)[-1]
        for state in ("DISABLED", "DESTROYED", "ENABLED"):
            self.cloud = Cloud()
            self.cloud.put(name, state=state)
            if state == "ENABLED":
                self.cloud.put(name)
            with self.assertRaisesRegex(SystemExit, "SECRET_VERSION"):
                self.run_helper()
            self.assertEqual(self.cloud.mutations(), [])

    def test_permission_preflight_covers_all_five_secrets_before_first_write(self):
        self.cloud.denied_secret = list(m.FIELDS)[-1]
        with self.assertRaisesRegex(SystemExit, "SECRET_PERMISSIONS_INCOMPLETE"):
            self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])

    def test_matching_version_disappearing_after_preflight_is_not_recreated(self):
        name = list(m.FIELDS)[0]
        self.cloud.put(name)
        original = self.cloud.open
        reads = 0
        def disappear(request, timeout):
            nonlocal reads
            if "/secrets/" + name + "/versions?" in request.full_url:
                reads += 1
                if reads == 2:
                    self.cloud.secrets[name] = []
            return original(request, timeout)
        self.cloud.open = disappear
        with self.assertRaisesRegex(SystemExit, "UNCONFIRMED_OR_MISSING_SECRET"):
            self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])

    def test_cloud_and_sdk_identity_mismatches_stop_without_writes(self):
        self.cloud.gcp_id = "foreign"
        with self.assertRaisesRegex(SystemExit, "PROJECT_IDENTITY_MISMATCH"):
            self.run_helper()
        self.assertEqual(self.cloud.calls, [])
        for field in ("projectId", "projectNumber", "appId", "authDomain", "messagingSenderId"):
            self.cloud = Cloud()
            self.cloud.config[field] = "foreign"
            with self.assertRaisesRegex(SystemExit, "SDK_CONFIG_IDENTITY_MISMATCH"):
                self.run_helper()
            self.assertEqual(self.cloud.mutations(), [])

    def test_auth_override_stops_before_http(self):
        self.cloud.override = True
        with self.assertRaisesRegex(SystemExit, "AUTH_OVERRIDE_PRESENT"):
            self.run_helper()
        self.assertEqual(self.cloud.calls, [])

    def test_webapp_conflicts_prevent_sdk_config_read(self):
        exact = copy.deepcopy(self.cloud.apps[0])
        for apps in ([], [exact, exact], [dict(exact, appId="other")], [dict(exact, state="DELETED")]):
            self.cloud = Cloud()
            self.cloud.apps = apps
            with self.assertRaisesRegex(SystemExit, "WEB_APP"):
                self.run_helper()
            self.assertFalse(any("/config?" in c[1] for c in self.cloud.calls))
            self.assertEqual(self.cloud.mutations(), [])

    def test_key_uid_canonical_namespace_and_value_must_match(self):
        variants = [[], [dict(name=KEY_NAME, uid="other")],
                    [dict(name="projects/foreign/locations/global/keys/key", uid=UID)],
                    [dict(name=KEY_NAME, uid=UID, deleteTime="today")]]
        for keys in variants:
            self.cloud = Cloud()
            self.cloud.keys = keys
            with self.assertRaisesRegex(SystemExit, "API_KEY"):
                self.run_helper()
            self.assertEqual(self.cloud.mutations(), [])
        self.cloud = Cloud()
        self.cloud.actual_key = "DO_NOT_PRINT_WRONG_KEY"
        with self.assertRaisesRegex(SystemExit, "SDK_API_KEY_MISMATCH"):
            self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])

    def test_complete_key_pagination_finds_exact_uid_and_repeated_token_stops(self):
        self.cloud.key_pages = True
        self.run_helper(False)
        self.assertEqual(len([c for c in self.cloud.calls if "/keys?" in c[1]]), 2)
        self.cloud = Cloud()
        self.cloud.repeat_pages = True
        with self.assertRaisesRegex(SystemExit, "INVALID_PAGINATION"):
            self.run_helper()
        self.assertEqual(self.cloud.mutations(), [])

    def test_optional_sdk_values_are_observed_but_never_published(self):
        self.cloud.config.update(storageBucket="unverified-bucket", measurementId="G-UNVERIFIED")
        rows = self.run_helper()
        self.assertTrue(rows[0]["sdk_storage_bucket_present"])
        self.assertTrue(rows[0]["sdk_measurement_id_present"])
        self.assertNotIn("unverified-bucket", self.output.getvalue())
        self.assertNotIn("G-UNVERIFIED", self.output.getvalue())
        self.assertEqual(len(self.cloud.mutations()), 5)

    def test_lost_reply_recovers_matching_written_version_without_duplicate(self):
        self.cloud.lost_reply = list(m.FIELDS)[2]
        with self.assertRaisesRegex(SystemExit, "SECRETS_REQUEST_UNCONFIRMED"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 3)
        self.cloud.lost_reply = None
        self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 5)
        self.assertTrue(all(len(v) == 1 for v in self.cloud.secrets.values()))

    def test_unconfirmed_post_without_version_never_replays(self):
        self.cloud.failed_post = list(m.FIELDS)[0]
        with self.assertRaisesRegex(SystemExit, "SECRETS_REQUEST_UNCONFIRMED"):
            self.run_helper()
        self.cloud.failed_post = None
        with self.assertRaisesRegex(SystemExit, "UNCONFIRMED_OR_MISSING_SECRET"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 1)

    def test_created_secret_readback_mismatch_stops_before_next_write(self):
        for foreign in (False, True):
            self.cloud = Cloud()
            self.cloud.corrupt_readback = not foreign
            self.cloud.foreign_readback = foreign
            # New local state for each independent failed-run case.
            self.directory = Path(self.temp.name) / str(foreign)
            with self.assertRaisesRegex(SystemExit, "SECRET_(VALUE_MISMATCH|PAYLOAD_NAMESPACE_MISMATCH)"):
                self.run_helper()
            self.assertEqual(len(self.cloud.mutations()), 1)

    def test_read_denials_are_not_treated_as_empty_inventory_and_errors_are_redacted(self):
        self.cloud.denied = "/secrets/"
        with self.assertRaisesRegex(SystemExit, "SECRETS_HTTP_403") as caught:
            self.run_helper()
        self.assertNotIn("DO_NOT_PRINT", str(caught.exception) + self.output.getvalue())
        self.assertEqual(self.cloud.mutations(), [])

    def test_foreign_journal_parallel_writer_and_verified_disappearance_are_rejected(self):
        self.directory.mkdir()
        state = self.directory / "state.json"
        state.write_text(json.dumps(dict(project="foreign", number=m.NUMBER, app_id=m.APP_ID, secrets={})))
        with self.assertRaisesRegex(SystemExit, "JOURNAL_RECONCILE"):
            self.run_helper()
        state.unlink()
        with m.Journal(self.directory):
            with self.assertRaisesRegex(SystemExit, "CONFIGURATION_ALREADY_RUNNING"):
                self.run_helper()
        self.assertEqual(self.cloud.calls, [])
        self.run_helper()
        self.cloud.secrets[list(m.FIELDS)[0]] = []
        with self.assertRaisesRegex(SystemExit, "UNCONFIRMED_OR_MISSING_SECRET"):
            self.run_helper()
        self.assertEqual(len(self.cloud.mutations()), 5)

    def test_route_body_and_apply_guards_prevent_unrelated_mutations_or_payload_access(self):
        client = m.Client(TOKEN, True)
        client.opener = self.cloud
        client.desired = {name: self.cloud.config[field] for name, field in m.FIELDS.items()}
        for service, path, body in (("firebase", m.PARENT + ":addFirebase", {}),
            ("firebase", m.PARENT + "/webApps", {}), ("keys", m.KEY_PARENT, {}),
            ("secrets", m.SM_PARENT + "DATABASE_URL/versions/1:access", None),
            ("secrets", m.SM_PARENT + "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:addVersion", m.payload("fake")),
            ("secrets", "projects/foreign/secrets/NEXT_PUBLIC_FIREBASE_APP_ID/versions/1:access", None),
            ("secrets", m.SM_PARENT + "NEXT_PUBLIC_FIREBASE_APP_ID:addVersion", m.payload("wrong")),
            ("keys", "https://elsewhere.invalid", None)):
            with self.subTest(path=path), self.assertRaisesRegex(SystemExit, "REQUEST_SCOPE_REJECTED"):
                client.request(service, path, body=body)
        client.apply = False
        with self.assertRaisesRegex(SystemExit, "REQUEST_SCOPE_REJECTED"):
            client.request("secrets", m.SM_PARENT + "NEXT_PUBLIC_FIREBASE_APP_ID:addVersion", body=m.payload(m.APP_ID))
        self.assertEqual(self.cloud.calls, [])
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, None, None, None, None))


if __name__ == "__main__":
    unittest.main()
