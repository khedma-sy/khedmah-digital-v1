"""Offline scope and reconciliation tests for the exact deployed Preview origin."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/configure-preview-v2-deployed-origin.py"
SPEC = importlib.util.spec_from_file_location("deployed_origin", SCRIPT)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def key(name, uid, services, refs, etag="etag-1"):
    return {"name": name, "uid": uid, "etag": etag,
            "restrictions": {"apiTargets": [{"service": service} for service in sorted(services)],
                             "browserKeyRestrictions": {"allowedReferrers": list(refs)}}}


def config(domains=None):
    return {"name": M.CONFIG_PATH, "subtype": "FIREBASE_AUTH",
            "authorizedDomains": list(domains or M.BASE_DOMAINS),
            "signIn": {"email": {"enabled": False, "passwordRequired": False},
                       "anonymous": {"enabled": False}, "phoneNumber": {"enabled": False}}}


def google():
    return {"name": M.GOOGLE_PATH, "enabled": True}


class FakeClient:
    def __init__(self):
        self.firebase = key(M.FIREBASE_KEY, M.FIREBASE_UID, M.FIREBASE_SERVICES,
                            M.BASE_FIREBASE_REFS)
        self.maps = key(M.MAPS_KEY, M.MAPS_UID, {"maps-backend.googleapis.com"}, M.BASE_MAPS_REFS)
        self.config = config()
        self.calls = []
        self.operation = 0

    def request(self, kind, body=None, operation=None):
        self.calls.append((kind, copy.deepcopy(body), operation))
        if kind == "google":
            return google()
        if kind == "operation":
            return {"name": operation, "done": True}
        if kind in ("firebase", "maps"):
            value = getattr(self, kind)
            if body is None:
                return copy.deepcopy(value)
            self.operation += 1
            value["restrictions"] = copy.deepcopy(body["restrictions"])
            value["etag"] = "etag-" + str(self.operation + 1)
            return {"name": "operations/op-" + str(self.operation), "done": True}
        if kind == "config":
            if body is None:
                return copy.deepcopy(self.config)
            self.config["authorizedDomains"] = list(body["authorizedDomains"])
            return copy.deepcopy(self.config)
        raise AssertionError(kind)


class ReconcileTests(unittest.TestCase):
    def run_helper(self, client):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(M.time, "sleep"):
            M.reconcile(client)
        return [json.loads(line) for line in output.getvalue().splitlines()]

    def test_adds_only_exact_deployed_origin_and_preserves_api_targets(self):
        client = FakeClient()
        original_firebase_targets = copy.deepcopy(client.firebase["restrictions"]["apiTargets"])
        original_maps_targets = copy.deepcopy(client.maps["restrictions"]["apiTargets"])
        receipts = self.run_helper(client)
        final = receipts[-1]
        self.assertEqual(final["stage"], "PREVIEW_V2_DEPLOYED_ORIGIN_CONFIGURED")
        self.assertEqual(final["changed"], {"firebase_key": True, "maps_key": True,
                                             "auth_domains": True})
        self.assertEqual(client.firebase["restrictions"]["apiTargets"], original_firebase_targets)
        self.assertEqual(client.maps["restrictions"]["apiTargets"], original_maps_targets)
        self.assertEqual(set(client.firebase["restrictions"]["browserKeyRestrictions"]["allowedReferrers"]),
                         set(M.DESIRED_FIREBASE_REFS))
        self.assertEqual(client.maps["restrictions"]["browserKeyRestrictions"]["allowedReferrers"],
                         M.DESIRED_MAPS_REFS)
        self.assertEqual(client.config["authorizedDomains"], M.DESIRED_DOMAINS)
        for flag in ("credential_values_printed", "key_payload_access", "secret_payload_access",
                     "application_deployed", "production_mutation", "login_flow_verified",
                     "map_render_verified", "floot_connected"):
            self.assertFalse(final[flag])

    def test_matching_final_state_is_idempotent_and_read_only(self):
        client = FakeClient()
        client.firebase["restrictions"]["browserKeyRestrictions"]["allowedReferrers"] = list(M.DESIRED_FIREBASE_REFS)
        client.maps["restrictions"]["browserKeyRestrictions"]["allowedReferrers"] = list(M.DESIRED_MAPS_REFS)
        client.config = config(M.DESIRED_DOMAINS)
        final = self.run_helper(client)[-1]
        self.assertEqual(final["changed"], {"firebase_key": False, "maps_key": False,
                                             "auth_domains": False})
        self.assertFalse(any(body is not None for _, body, _ in client.calls))

    def test_unknown_domain_referrer_or_api_expansion_fails_before_writes(self):
        clients = []
        a = FakeClient(); a.config["authorizedDomains"].append("unknown.example"); clients.append(a)
        b = FakeClient(); b.firebase["restrictions"]["browserKeyRestrictions"]["allowedReferrers"].append("https://evil.example/*"); clients.append(b)
        c = FakeClient(); c.maps["restrictions"]["apiTargets"].append({"service": "other.googleapis.com"}); clients.append(c)
        for client in clients:
            with self.subTest(client=client), self.assertRaises(SystemExit):
                self.run_helper(client)
            self.assertFalse(any(body is not None for _, body, _ in client.calls))

    def test_no_wildcard_host_or_non_https_referrer(self):
        refs = M.DESIRED_FIREBASE_REFS + M.DESIRED_MAPS_REFS
        self.assertTrue(all(ref.startswith("https://") for ref in refs))
        self.assertFalse(any("*.run.app" in ref for ref in refs))
        self.assertIn("https://" + M.DEPLOYED_HOST, M.DESIRED_FIREBASE_REFS)
        self.assertIn("https://" + M.DEPLOYED_HOST + "/*", M.DESIRED_FIREBASE_REFS)
        self.assertEqual(M.DESIRED_MAPS_REFS[-1], "https://" + M.DEPLOYED_HOST + "/*")

    def test_auth_signin_change_after_patch_blocks_success(self):
        client = FakeClient()
        original = client.request
        reads = 0
        def changed(kind, body=None, operation=None):
            nonlocal reads
            value = original(kind, body, operation)
            if kind == "config" and body is None:
                reads += 1
                if reads >= 3:
                    value["signIn"]["email"]["enabled"] = True
            return value
        client.request = changed
        with self.assertRaisesRegex(SystemExit, "LOCAL_SIGN_IN_CHANGED"):
            self.run_helper(client)


class ValidationTests(unittest.TestCase):
    def test_exact_pinned_identities(self):
        self.assertEqual(M.DEPLOYED_HOST, "khedmah-pr-274-frontend-xlslq22k6a-ew.a.run.app")
        self.assertEqual(M.MAPS_UID, "6fad46fb-229e-403e-8f60-530b4ab9c1ae")
        self.assertEqual(M.FIREBASE_UID, "fdae1cd2-64ce-49ec-a426-ed46120083e9")


if __name__ == "__main__":
    unittest.main()
