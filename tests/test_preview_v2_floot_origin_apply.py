"""Offline tests: no cloud calls or real credentials."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/configure-preview-v2-floot-origin.py"
SPEC = importlib.util.spec_from_file_location("floot_apply", SCRIPT)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class Client:
    def __init__(self, present=False):
        self.config = {"name": M.CONFIG_PATH, "subtype": "FIREBASE_AUTH", "signIn": {},
                       "authorizedDomains": list(M.DESIRED_DOMAINS if present else M.BASE_DOMAINS)}
        self.key = {"name": M.FIREBASE_KEY, "uid": M.FIREBASE_UID, "etag": "one",
                    "restrictions": {
                        "apiTargets": [{"service": s} for s in sorted(M.FIREBASE_SERVICES)],
                        "browserKeyRestrictions": {"allowedReferrers": list(
                            M.DESIRED_FIREBASE_REFS if present else M.BASE_FIREBASE_REFS)}}}
        self.calls = []

    def request(self, kind, body=None, operation=None):
        self.calls.append((kind, copy.deepcopy(body), operation))
        if kind == "google":
            return {"name": M.GOOGLE_PATH, "enabled": True}
        if kind == "firebase":
            if body is not None:
                assert body["etag"] == self.key["etag"]
                self.key["restrictions"] = copy.deepcopy(body["restrictions"])
                self.key["etag"] = "two"
                return {"name": "operations/one", "done": True}
            return copy.deepcopy(self.key)
        if kind == "config":
            if body is not None:
                assert set(body) == {"authorizedDomains"}
                self.config["authorizedDomains"] = list(body["authorizedDomains"])
            return copy.deepcopy(self.config)
        raise AssertionError(kind)


class ApplyTests(unittest.TestCase):
    def run_helper(self, client):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            M.reconcile(client)
        return json.loads(output.getvalue().splitlines()[-1])

    def test_exact_two_writes_preserve_all_existing_controls(self):
        c = Client()
        before = copy.deepcopy(c.key["restrictions"]["apiTargets"])
        receipt = self.run_helper(c)
        writes = [(k, b) for k, b, _ in c.calls if b is not None]
        self.assertEqual([k for k, _ in writes], ["firebase", "config"])
        self.assertEqual(writes[0][1]["etag"], "one")
        self.assertEqual(c.key["restrictions"]["apiTargets"], before)
        self.assertEqual(c.config["signIn"], {})
        self.assertEqual(set(c.config["authorizedDomains"]) - set(M.BASE_DOMAINS), {M.FLOOT_HOST})
        refs = c.key["restrictions"]["browserKeyRestrictions"]["allowedReferrers"]
        self.assertEqual(set(refs) - set(M.BASE_FIREBASE_REFS),
                         {M.FLOOT_ORIGIN, M.FLOOT_ORIGIN + "/*"})
        self.assertEqual(receipt["stage"], "PREVIEW_V2_FLOOT_ORIGIN_CONFIGURED")
        self.assertEqual(receipt["firebase_api_target_count"], 27)
        for flag in ("maps_mutation", "production_mutation", "login_flow_verified",
                     "floot_connected", "credential_values_printed", "key_payload_access",
                     "secret_payload_access", "application_deployed"):
            self.assertFalse(receipt[flag])

    def test_present_state_no_writes(self):
        c = Client(True)
        self.assertFalse(self.run_helper(c)["changed"])
        self.assertFalse(any(b is not None for _, b, _ in c.calls))

    def test_partial_states_never_replayed(self):
        for auth_present in (True, False):
            c = Client()
            if auth_present:
                c.config["authorizedDomains"] = list(M.DESIRED_DOMAINS)
            else:
                c.key["restrictions"]["browserKeyRestrictions"]["allowedReferrers"] = list(M.DESIRED_FIREBASE_REFS)
            with self.subTest(auth_present=auth_present), self.assertRaisesRegex(SystemExit, "PARTIAL"):
                self.run_helper(c)
            self.assertFalse(any(b is not None for _, b, _ in c.calls))

    def test_unknown_inventory_identity_and_enabled_signin_rejected(self):
        mutations = [
            lambda c: c.config["authorizedDomains"].append("foreign.example"),
            lambda c: c.key["restrictions"]["apiTargets"].pop(),
            lambda c: c.key.update(uid="foreign"),
            lambda c: c.config.update(name="projects/production/config"),
            lambda c: c.config.update(signIn={"email": {"enabled": True}}),
            lambda c: c.config.update(signIn={"email": {"enabled": 0}}),
            lambda c: c.config.update(signIn=None),
            lambda c: c.key["restrictions"]["browserKeyRestrictions"]["allowedReferrers"].append("*"),
        ]
        for mutate in mutations:
            c = Client()
            mutate(c)
            with self.subTest(mutate=mutate), self.assertRaises(SystemExit):
                self.run_helper(c)
            self.assertFalse(any(b is not None for _, b, _ in c.calls))

    def test_explicit_disabled_signin_preserved(self):
        c = Client()
        c.config["signIn"] = {"email": {"enabled": False, "passwordRequired": False},
                              "anonymous": {"enabled": False}, "phoneNumber": {"enabled": False}}
        before = copy.deepcopy(c.config["signIn"])
        self.run_helper(c)
        self.assertEqual(c.config["signIn"], before)

    def test_drift_before_first_write_stops(self):
        c = Client()
        original = c.request
        count = 0
        def request(kind, body=None, operation=None):
            nonlocal count
            value = original(kind, body, operation)
            if kind == "firebase" and body is None:
                count += 1
                if count == 2:
                    value["etag"] = "concurrent"
            return value
        c.request = request
        with self.assertRaisesRegex(SystemExit, "METADATA_CHANGED"):
            self.run_helper(c)
        self.assertFalse(any(b is not None for _, b, _ in c.calls))

    def test_auth_drift_after_key_write_stops_before_auth_write(self):
        c = Client()
        original = c.request
        def request(kind, body=None, operation=None):
            value = original(kind, body, operation)
            if kind == "firebase" and body is not None:
                c.config["signIn"] = {"email": {"enabled": True}}
            return value
        c.request = request
        with self.assertRaises(SystemExit):
            self.run_helper(c)
        self.assertEqual([k for k,b,_ in c.calls if b is not None], ["firebase"])

    def test_failed_key_operation_stops_before_auth_write(self):
        c = Client()
        original = c.request
        def request(kind, body=None, operation=None):
            value = original(kind, body, operation)
            if kind == "firebase" and body is not None:
                return {"name": "operations/one", "done": True, "error": {"code": 1}}
            return value
        c.request = request
        with self.assertRaisesRegex(SystemExit, "OPERATION_FAILED"):
            self.run_helper(c)
        self.assertEqual([k for k,b,_ in c.calls if b is not None], ["firebase"])

    def test_transport_rejects_maps_and_foreign_patch_before_network(self):
        c = M.Client("inert")
        with self.assertRaisesRegex(SystemExit, "REQUEST_SCOPE"):
            c.request("maps")
        with self.assertRaisesRegex(SystemExit, "MUTATION_SCOPE"):
            c.request("config", {"authorizedDomains": ["foreign.example"]})

    def test_http_failure_is_sanitized(self):
        c = M.Client("inert")
        error = M.urllib.error.HTTPError("https://example", 403, "sensitive", {}, None)
        with patch.object(c.opener, "open", side_effect=error):
            with self.assertRaisesRegex(SystemExit, "HTTP_403_RECONCILE_NO_BLIND_RETRY"):
                c.request("config", {"authorizedDomains": M.DESIRED_DOMAINS})


if __name__ == "__main__":
    unittest.main()
