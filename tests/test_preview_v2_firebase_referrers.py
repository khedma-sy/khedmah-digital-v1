"""Offline scope, concurrency and redaction checks for Preview Firebase referrers."""
import contextlib
import copy
import importlib.util
import io
import json
import pathlib
import subprocess
import unittest
import urllib.error
import urllib.parse
from unittest.mock import Mock, patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/configure-preview-v2-firebase-referrers.py"
spec = importlib.util.spec_from_file_location("referrers", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
UID = "01234567-89ab-4cde-8fab-0123456789ab"
OP = "operations/test-operation"


def key(configured=False):
    return {"name": m.KEY, "uid": UID, "etag": "synthetic-etag",
            "restrictions": {"apiTargets": [{"service": v} for v in sorted(m.EXPECTED_SERVICES)],
                             "browserKeyRestrictions": {"allowedReferrers": list(m.REFERRERS)}
                             if configured else {}}}


def auth():
    return {"name": m.CONFIG_PATH, "subtype": "FIREBASE_AUTH", "authorizedDomains": list(m.DOMAINS)}


def google():
    return {"name": m.GOOGLE_PATH, "enabled": True}


class FakeClient:
    def __init__(self, results):
        self.results = copy.deepcopy(results)
        self.calls = []

    def request(self, kind, body=None, operation=None):
        self.calls.append((kind, copy.deepcopy(body), operation))
        result = self.results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result


class ReconcileTests(unittest.TestCase):
    def run_helper(self, results):
        client, output = FakeClient(results), io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(m.time, "sleep"):
            m.reconcile(client)
        return client, [json.loads(line) for line in output.getvalue().splitlines()]

    def rejected(self, results, code, writes=0):
        client, output = FakeClient(results), io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(m.time, "sleep"):
            with self.assertRaisesRegex(SystemExit, code):
                m.reconcile(client)
        self.assertEqual(sum(body is not None for _, body, _ in client.calls), writes)
        self.assertNotIn("PREVIEW_V2_FIREBASE_REFERRERS_CONFIGURED", output.getvalue())
        return client

    def test_restricts_exact_key_and_preserves_all_api_targets_with_etag(self):
        before, after = key(), key(True)
        after["etag"] = "synthetic-new-etag"
        client, out = self.run_helper([auth(), google(), before, {"name": OP, "done": True},
                                       after, auth(), google()])
        writes = [(kind, body) for kind, body, _ in client.calls if body is not None]
        self.assertEqual(len(writes), 1)
        kind, body = writes[0]
        self.assertEqual(kind, "key")
        self.assertEqual(set(body), {"etag", "restrictions"})
        self.assertEqual(body["etag"], before["etag"])
        self.assertEqual(body["restrictions"]["apiTargets"], before["restrictions"]["apiTargets"])
        self.assertEqual(body["restrictions"]["browserKeyRestrictions"],
                         {"allowedReferrers": m.REFERRERS})
        receipt = out[-1]
        self.assertTrue(receipt["changed"])
        self.assertTrue(receipt["api_allowlist_preserved"])
        self.assertEqual(receipt["api_target_count"], 27)
        for flag in ("key_payload_access", "secret_payload_access", "credential_values_printed",
                     "propagation_and_browser_acceptance_verified", "deployed_origin_verified",
                     "login_flow_verified", "application_deployed", "floot_connected"):
            self.assertFalse(receipt[flag])

    def test_preconfigured_key_has_no_patch_or_operation(self):
        client, out = self.run_helper([auth(), google(), key(True), key(True), auth(), google()])
        self.assertFalse(out[-1]["changed"])
        self.assertTrue(all(body is None and kind != "operation" for kind, body, _ in client.calls))

    def test_async_completion_only_after_operation_done(self):
        client, _ = self.run_helper([auth(), google(), key(), {"name": OP},
                                    {"name": OP, "done": True}, key(True), auth(), google()])
        self.assertIn(("operation", None, OP), client.calls)

    def test_operation_failure_timeout_and_changed_identity_never_succeed(self):
        for tail, code in (([{"name": OP, "done": True, "error": {"code": 7}}], "OPERATION_FAILED"),
                           ([{"name": OP}] * 16, "PATCH_PENDING"),
                           ([{"name": OP}, {"name": "operations/other", "done": True}], "METADATA_CONFLICT"),
                           ([{"name": OP, "done": 1}], "METADATA_CONFLICT")):
            with self.subTest(code=code):
                self.rejected([auth(), google(), key()] + tail, code, writes=1)

    def test_invalid_operation_name_not_followed(self):
        for name in ("https://unexpected.example", "operations/../keys", "operations/x?token=bad"):
            self.rejected([auth(), google(), key(), {"name": name}], "OPERATION_ID", writes=1)

    def test_patch_conflict_or_uncertain_response_not_retried(self):
        for error in ("STOP: HTTP_409_RECONCILE", "STOP: REQUEST_UNCONFIRMED_RECONCILE"):
            client = self.rejected([auth(), google(), key(), SystemExit(error)], "RECONCILE", writes=1)
            self.assertEqual(len(client.calls), 4)

    def test_auth_prerequisites_fail_before_key_mutation(self):
        for change in ({"name": "projects/other/config"}, {"subtype": "IDENTITY_PLATFORM"},
                       {"authorizedDomains": m.DOMAINS[:-1]}, {"authorizedDomains": m.DOMAINS + ["other.example"]}):
            self.rejected([{**auth(), **change}, google()], "AUTH_DOMAIN_PREREQUISITE")
        for change in ({"name": "projects/other/defaultSupportedIdpConfigs/google.com"}, {"enabled": False}):
            self.rejected([auth(), {**google(), **change}], "GOOGLE_PROVIDER_PREREQUISITE")

    def test_key_identity_deletion_binding_and_missing_etag_rejected(self):
        for change in ({"name": "projects/other/locations/global/keys/other"}, {"uid": "not-uuid"},
                       {"deleteTime": "deleted"}, {"serviceAccountEmail": "bound@example.invalid"},
                       {"etag": ""}):
            self.rejected([auth(), google(), {**key(), **change}], "KEY_IDENTITY")

    def test_api_target_addition_removal_duplicate_or_method_change_stops(self):
        base = key()["restrictions"]["apiTargets"]
        cases = [base[:-1], base + [{"service": "maps-backend.googleapis.com"}],
                 base[:-1] + [base[0]], [{"service": "other.googleapis.com"}] + base[1:],
                 [{**base[0], "methods": ["Read*"]}] + base[1:]]
        for targets in cases:
            value = key()
            value["restrictions"]["apiTargets"] = targets
            self.rejected([auth(), google(), value], "API_ALLOWLIST")

    def test_wrong_client_type_unknown_or_partial_referrers_rejected(self):
        cases = [
            {"apiTargets": key()["restrictions"]["apiTargets"], "serverKeyRestrictions": {"allowedIps": ["127.0.0.1"]}},
            {**key()["restrictions"], "unexpected": {}},
        ]
        for refs in (["*"], m.REFERRERS[:1], m.REFERRERS + [m.REFERRERS[0]], ["http://localhost/*"]):
            cases.append({**key()["restrictions"], "browserKeyRestrictions": {"allowedReferrers": refs}})
        for restrictions in cases:
            self.rejected([auth(), google(), {**key(), "restrictions": restrictions}], "CONFLICT")

    def test_readback_mismatch_and_late_auth_conflict_stop(self):
        self.rejected([auth(), google(), key(), {"name": OP, "done": True}, key()],
                      "KEY_READBACK_MISMATCH", writes=1)
        after = {**key(True), "uid": "fedcba98-7654-4321-8abc-0123456789ab"}
        self.rejected([auth(), google(), key(), {"name": OP, "done": True}, after],
                      "KEY_READBACK_MISMATCH", writes=1)
        self.rejected([auth(), google(), key(), {"name": OP, "done": True}, key(True),
                       auth(), {**google(), "enabled": False}], "GOOGLE_PROVIDER", writes=1)

    def test_service_order_and_empty_method_normalization_preserve_semantics(self):
        after = key(True)
        after["restrictions"]["apiTargets"].reverse()
        for item in after["restrictions"]["apiTargets"]:
            item["methods"] = []
        _, out = self.run_helper([auth(), google(), key(), {"name": OP, "done": True},
                                  after, auth(), google()])
        self.assertTrue(out[-1]["api_allowlist_preserved"])

    def test_only_two_exact_https_origins_with_bare_and_path_patterns(self):
        self.assertEqual(m.REFERRERS, ["https://" + m.HOST, "https://" + m.HOST + "/*",
                                     "https://" + m.AUTH_HOST, "https://" + m.AUTH_HOST + "/*"])
        self.assertNotIn("localhost", "".join(m.REFERRERS))
        self.assertNotIn("*.", "".join(m.REFERRERS))


class TransportTests(unittest.TestCase):
    def client(self, raw=b"{}"):
        client = m.Client("synthetic-test-token")
        client.opener = Mock()
        client.opener.open.return_value = io.BytesIO(raw)
        return client

    def test_patch_uses_only_pinned_resource_mask_and_metadata_response(self):
        client = self.client()
        body = {"restrictions": key(True)["restrictions"], "etag": "synthetic-etag"}
        client.request("key", body=body)
        request = client.opener.open.call_args.args[0]
        url = urllib.parse.urlsplit(request.full_url)
        self.assertEqual(url.scheme, "https")
        self.assertEqual(url.netloc, "apikeys.googleapis.com")
        self.assertEqual(url.path, "/v2/" + m.KEY)
        self.assertEqual(urllib.parse.parse_qs(url.query),
                         {"fields": [m.OP_FIELDS], "updateMask": ["restrictions"]})
        self.assertEqual(request.method, "PATCH")
        self.assertEqual(json.loads(request.data), body)
        self.assertEqual(request.get_header("Authorization"), "Bearer synthetic-test-token")
        self.assertEqual(request.get_header("X-goog-user-project"), m.PROJECT)

    def test_gets_never_request_key_payload_or_arbitrary_hosts(self):
        for kind, operation in (("key", None), ("config", None), ("google", None), ("operation", OP)):
            client = self.client()
            client.request(kind, operation=operation)
            request = client.opener.open.call_args.args[0]
            self.assertEqual(request.method, "GET")
            self.assertIsNone(request.data)
            self.assertNotIn("keyString", request.full_url)
            self.assertIn(urllib.parse.urlsplit(request.full_url).netloc,
                          ("apikeys.googleapis.com", "identitytoolkit.googleapis.com"))

    def test_scope_checks_reject_non_key_writes_and_arbitrary_mutations(self):
        good = {"restrictions": key(True)["restrictions"], "etag": "synthetic-etag"}
        for kind, body, operation in (("google", good, None), ("config", good, None),
                ("key", {**good, "displayName": "other"}, None),
                ("key", {**good, "etag": ""}, None),
                ("key", {"restrictions": key()["restrictions"], "etag": "synthetic"}, None),
                ("key", None, OP), ("operation", None, "https://unexpected.example"), ("other", None, None)):
            client = self.client()
            with self.assertRaises(SystemExit):
                client.request(kind, body=body, operation=operation)
            client.opener.open.assert_not_called()

    def test_http_network_and_malformed_errors_are_sanitized(self):
        for error in (urllib.error.HTTPError("https://invalid/synthetic-test-token", 403,
                      "synthetic-test-token", {}, io.BytesIO(b"synthetic-test-token")),
                      OSError("synthetic-test-token")):
            client = self.client()
            client.opener.open.side_effect = error
            out = io.StringIO()
            with contextlib.redirect_stdout(out), self.assertRaises(SystemExit) as caught:
                client.request("key")
            self.assertNotIn("synthetic-test-token", out.getvalue() + str(caught.exception))
        for raw in (b"synthetic-test-token", b"[]", b"x" * 65537):
            with self.assertRaises(SystemExit) as caught:
                self.client(raw).request("key")
            self.assertNotIn("synthetic-test-token", str(caught.exception))

    def test_redirects_do_not_forward_bearer(self):
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, 302, "", {},
                                                        "https://unexpected.example"))


class PreflightTests(unittest.TestCase):
    def metadata(self):
        return [b"(unset)", b"", b"", {}, [{"account": m.ACCOUNT}],
                {"projectId": m.PROJECT, "projectNumber": m.NUMBER, "lifecycleState": "ACTIVE",
                 "parent": {"type": "organization", "id": m.ORGANIZATION}}]

    def test_project_account_organization_and_overrides(self):
        with patch.dict(m.os.environ, {}, clear=True), patch.object(m, "cloud", side_effect=self.metadata()):
            m.preflight()
        for field, value in (("projectId", "other"), ("projectNumber", "0"),
                             ("lifecycleState", "DELETE_REQUESTED"),
                             ("parent", {"type": "organization", "id": "other"})):
            responses = self.metadata()
            responses[-1][field] = value
            with patch.dict(m.os.environ, {}, clear=True), patch.object(m, "cloud", side_effect=responses):
                with self.assertRaisesRegex(SystemExit, "PROJECT_IDENTITY"):
                    m.preflight()
        for responses in ([b"impersonated"], [b"", b"", b"", {"api_endpoint_overrides": {"x": "other"}}],
                          [b"", b"", b"", {}, []]):
            with patch.dict(m.os.environ, {}, clear=True), patch.object(m, "cloud", side_effect=responses):
                with self.assertRaises(SystemExit):
                    m.preflight()

    def test_environment_overrides_block_before_cloud(self):
        for name in ("CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
                     "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
                     "CLOUDSDK_API_ENDPOINT_OVERRIDES_APIKEYS"):
            with patch.dict(m.os.environ, {name: "synthetic"}, clear=True), patch.object(m, "cloud") as cloud:
                with self.assertRaises(SystemExit):
                    m.preflight()
                cloud.assert_not_called()

    def test_gcloud_pins_target_captures_streams_and_sanitizes_failures(self):
        output = subprocess.CompletedProcess([], 0, b"{}", b"synthetic-test-token")
        with patch.object(m.subprocess, "run", return_value=output) as run:
            self.assertEqual(m.cloud("projects", "describe", m.PROJECT, fields="projectId"), {})
        args, kwargs = run.call_args
        self.assertIn("--project=" + m.PROJECT, args[0])
        self.assertIn("--account=" + m.ACCOUNT, args[0])
        self.assertTrue(kwargs["capture_output"])
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true")
        output.returncode = 1
        with patch.object(m.subprocess, "run", return_value=output), self.assertRaises(SystemExit) as caught:
            m.cloud("projects", "describe", m.PROJECT)
        self.assertNotIn("synthetic-test-token", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
