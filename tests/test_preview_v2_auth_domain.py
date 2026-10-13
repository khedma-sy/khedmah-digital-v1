"""Offline checks for the single-field Preview Auth domain helper."""
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

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/configure-preview-v2-auth-domain.py"
spec = importlib.util.spec_from_file_location("auth_domain", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def config(domains=None):
    return {"name": m.CONFIG_PATH, "subtype": "FIREBASE_AUTH",
            "authorizedDomains": list(m.BASE_DOMAINS if domains is None else domains),
            "signIn": {"email": {"enabled": False, "passwordRequired": False},
                       "anonymous": {"enabled": False}, "phoneNumber": {"enabled": False}}}


def google():
    return {"name": m.GOOGLE_PATH, "enabled": True}


class FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, kind, body=None):
        self.calls.append((kind, copy.deepcopy(body)))
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return copy.deepcopy(response)


class DomainTests(unittest.TestCase):
    def execute(self, responses):
        client = FakeClient(responses)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            m.reconcile(client)
        return client, [json.loads(line) for line in output.getvalue().splitlines()]

    def rejected(self, responses, code, writes=0):
        client = FakeClient(responses)
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaisesRegex(SystemExit, code):
            m.reconcile(client)
        self.assertEqual(sum(body is not None for _, body in client.calls), writes)
        self.assertNotIn("PREVIEW_V2_AUTH_DOMAIN_CONFIGURED", output.getvalue())

    def test_add_one_domain_only_and_preserve_signin(self):
        after = config(m.DESIRED_DOMAINS)
        client, output = self.execute([config(), google(), config(), after, after, google()])
        self.assertEqual([body for _, body in client.calls if body is not None],
                         [{"authorizedDomains": m.DESIRED_DOMAINS}])
        receipt = output[-1]
        self.assertTrue(receipt["changed"])
        self.assertTrue(receipt["local_sign_in_unchanged"])
        self.assertEqual(receipt["authorized_domains"], m.DESIRED_DOMAINS)
        for key in ("credential_values_printed", "secret_payload_access", "login_flow_verified",
                    "application_deployed", "floot_connected", "deployed_origin_verified",
                    "firebase_key_referrers_configured"):
            self.assertFalse(receipt[key])

    def test_existing_domain_verifies_without_write(self):
        after = config(list(reversed(m.DESIRED_DOMAINS)))
        client, output = self.execute([after, google(), after, google()])
        self.assertTrue(all(body is None for _, body in client.calls))
        self.assertFalse(output[-1]["changed"])

    def test_wrong_project_and_subtype_stop_before_patch(self):
        for change in ({"name": "projects/other/config"}, {"subtype": "IDENTITY_PLATFORM"}):
            with self.subTest(change=change):
                self.rejected([{**config(), **change}], "IDENTITY_OR_SUBTYPE")

    def test_unknown_missing_duplicate_or_invalid_domains_never_overwritten(self):
        for domains in (m.BASE_DOMAINS + ["unexpected.example"], m.BASE_DOMAINS[:-1],
                        m.BASE_DOMAINS + [m.BASE_DOMAINS[0]], None, [False]):
            with self.subTest(domains=domains):
                self.rejected([{**config(), "authorizedDomains": domains}], "INVENTORY_CONFLICT")

    def test_google_provider_identity_and_enabled_required(self):
        for provider in ({**google(), "enabled": False}, {**google(), "enabled": "true"},
                         {**google(), "name": "projects/other/defaultSupportedIdpConfigs/google.com"}):
            with self.subTest(provider=provider):
                self.rejected([config(), provider], "GOOGLE_PROVIDER")

    def test_observed_concurrent_change_stops(self):
        fresh = config()
        fresh["signIn"]["email"]["enabled"] = True
        self.rejected([config(), google(), fresh], "AUTH_CONFIG_CHANGED")

    def test_uncertain_patch_no_success_and_reconcile_does_not_duplicate(self):
        self.rejected([config(), google(), config(), SystemExit("STOP: AUTH_HTTP_503_RECONCILE")],
                      "AUTH_HTTP_503", writes=1)
        after = config(m.DESIRED_DOMAINS)
        client, _ = self.execute([after, google(), after, google()])
        self.assertTrue(all(body is None for _, body in client.calls))

    def test_patch_and_final_domain_mismatch_are_not_success(self):
        after = config(m.DESIRED_DOMAINS)
        self.rejected([config(), google(), config(), config()], "PATCH_UNCONFIRMED", writes=1)
        self.rejected([config(), google(), config(), after, config()], "READBACK_MISMATCH", writes=1)

    def test_local_signin_change_or_google_disabled_during_readback_stops(self):
        after = config(m.DESIRED_DOMAINS)
        changed = copy.deepcopy(after)
        changed["signIn"]["email"]["enabled"] = True
        self.rejected([config(), google(), config(), after, changed], "LOCAL_SIGN_IN_CHANGED", writes=1)
        self.rejected([config(), google(), config(), after, after, {**google(), "enabled": False}],
                      "GOOGLE_PROVIDER", writes=1)

    def test_numeric_resource_identity_is_accepted(self):
        value = config()
        value["name"] = "projects/" + m.NUMBER + "/config"
        self.assertEqual(m.config_domains(value), m.BASE_DOMAINS)
        m.verify_google({**google(), "name": "projects/" + m.NUMBER + "/defaultSupportedIdpConfigs/google.com"})


class TransportTests(unittest.TestCase):
    def client(self, raw=b"{}"):
        client = m.Client("synthetic-test-token")
        client.opener = Mock()
        client.opener.open.return_value = io.BytesIO(raw)
        return client

    def test_fixed_endpoint_and_single_field_patch_contract(self):
        client = self.client()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            client.request("config", {"authorizedDomains": m.DESIRED_DOMAINS})
        request = client.opener.open.call_args.args[0]
        parsed = urllib.parse.urlsplit(request.full_url)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "identitytoolkit.googleapis.com")
        self.assertEqual(parsed.path, "/admin/v2/" + m.CONFIG_PATH)
        query = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(query, {"fields": [m.CONFIG_FIELDS], "updateMask": ["authorizedDomains"]})
        self.assertEqual(request.method, "PATCH")
        self.assertEqual(json.loads(request.data), {"authorizedDomains": m.DESIRED_DOMAINS})
        self.assertEqual(request.get_header("Authorization"), "Bearer synthetic-test-token")
        self.assertEqual(request.get_header("X-goog-user-project"), m.PROJECT)
        self.assertEqual(output.getvalue(), "")

    def test_google_get_selects_metadata_only(self):
        client = self.client()
        client.request("google")
        request = client.opener.open.call_args.args[0]
        self.assertEqual(request.method, "GET")
        self.assertIsNone(request.data)
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query),
                         {"fields": ["name,enabled"]})

    def test_out_of_scope_calls_rejected_before_network(self):
        for kind, body in (("other", None), ("google", {"authorizedDomains": m.DESIRED_DOMAINS}),
                           ("config", {"authorizedDomains": ["broad.example"]}),
                           ("config", {"authorizedDomains": m.DESIRED_DOMAINS, "signIn": {}})):
            with self.subTest(kind=kind, body=body):
                client = self.client()
                with self.assertRaises(SystemExit):
                    client.request(kind, body)
                client.opener.open.assert_not_called()

    def test_error_payloads_and_tokens_not_disclosed(self):
        for error in (urllib.error.HTTPError("https://invalid/synthetic-test-token", 403,
                                            "synthetic-test-token", {}, io.BytesIO(b"synthetic-test-token")),
                      OSError("synthetic-test-token")):
            client = self.client()
            client.opener.open.side_effect = error
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                with self.assertRaises(SystemExit) as caught:
                    client.request("config")
            self.assertNotIn("synthetic-test-token", str(caught.exception) + out.getvalue() + err.getvalue())

    def test_malformed_and_oversized_responses_fail_closed(self):
        for raw in (b"not json", b"[]", b"x" * 65537):
            with self.subTest(size=len(raw)):
                with self.assertRaises(SystemExit):
                    self.client(raw).request("config")

    def test_redirects_refused(self):
        self.assertIsNone(m.NoRedirect().redirect_request(
            None, None, 302, "redirect", {}, "https://unexpected.example"))


class PreflightTests(unittest.TestCase):
    def project(self):
        return {"projectId": m.PROJECT, "projectNumber": m.NUMBER, "lifecycleState": "ACTIVE",
                "parent": {"type": "organization", "id": m.ORGANIZATION}}

    def metadata(self, project=None):
        return [b"(unset)", b"", b"(unset)", {}, [{"account": m.ACCOUNT}],
                self.project() if project is None else project]

    def test_expected_identity_passes_and_mismatches_fail(self):
        with patch.dict(m.os.environ, {}, clear=True), patch.object(m, "cloud", side_effect=self.metadata()):
            m.preflight()
        for change in ({"projectId": "other"}, {"projectNumber": "0"}, {"lifecycleState": "DELETE_REQUESTED"},
                       {"parent": {"type": "organization", "id": "other"}}):
            with self.subTest(change=change), patch.dict(m.os.environ, {}, clear=True):
                with patch.object(m, "cloud", side_effect=self.metadata({**self.project(), **change})):
                    with self.assertRaisesRegex(SystemExit, "IDENTITY_MISMATCH"):
                        m.preflight()

    def test_environment_overrides_rejected_before_cloud(self):
        for key in ("CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
                    "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
                    "CLOUDSDK_API_ENDPOINT_OVERRIDES_IDENTITYTOOLKIT"):
            with self.subTest(key=key), patch.dict(m.os.environ, {key: "synthetic"}, clear=True):
                with patch.object(m, "cloud") as cloud:
                    with self.assertRaises(SystemExit):
                        m.preflight()
                    cloud.assert_not_called()

    def test_config_overrides_and_missing_account_rejected(self):
        for responses in ([b"synthetic"], [b"", b"", b"", {"api_endpoint_overrides": {"x": "synthetic"}}],
                          [b"", b"", b"", {}, []]):
            with self.subTest(responses=responses), patch.dict(m.os.environ, {}, clear=True):
                with patch.object(m, "cloud", side_effect=responses), self.assertRaises(SystemExit):
                    m.preflight()

    def test_gcloud_captures_both_streams_and_pins_target(self):
        response = subprocess.CompletedProcess([], 0, b"{}", b"synthetic-test-token")
        with patch.object(m.subprocess, "run", return_value=response) as runner:
            self.assertEqual(m.cloud("projects", "describe", m.PROJECT, fields="projectId"), {})
        args, kwargs = runner.call_args
        self.assertIn("--project=" + m.PROJECT, args[0])
        self.assertIn("--account=" + m.ACCOUNT, args[0])
        self.assertTrue(kwargs["capture_output"])
        self.assertEqual(kwargs["input"], b"")
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
        self.assertEqual(kwargs["env"]["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true")
        response.returncode = 1
        with patch.object(m.subprocess, "run", return_value=response):
            with self.assertRaises(SystemExit) as caught:
                m.cloud("projects", "describe", m.PROJECT)
        self.assertNotIn("synthetic-test-token", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
