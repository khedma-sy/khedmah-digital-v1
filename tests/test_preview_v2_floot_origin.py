"""Offline tests for the read-only Floot-origin metadata inspection."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/inspect-preview-v2-floot-origin.py"
SPEC = importlib.util.spec_from_file_location("preview_floot_origin", SCRIPT)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def key(refs):
    return {
        "name": M.BASE.FIREBASE_KEY,
        "uid": M.BASE.FIREBASE_UID,
        "etag": "etag-1",
        "restrictions": {
            "apiTargets": [{"service": service}
                           for service in sorted(M.BASE.FIREBASE_SERVICES)],
            "browserKeyRestrictions": {"allowedReferrers": list(refs)},
        },
    }


def config(domains):
    return {
        "name": M.BASE.CONFIG_PATH,
        "subtype": "FIREBASE_AUTH",
        "authorizedDomains": list(domains),
        "signIn": copy.deepcopy(M.EXPECTED_SIGN_IN),
    }


class FakeClient:
    def __init__(self, present=False):
        self.config = config(M.FLOOT_DOMAINS if present else M.CURRENT_DOMAINS)
        self.key = key(M.FLOOT_REFS if present else M.CURRENT_REFS)
        self.calls = []

    def request(self, kind, body=None, operation=None):
        self.calls.append((kind, body, operation))
        if body is not None or operation is not None:
            raise AssertionError("inspection must remain read-only")
        if kind == "google":
            return {"name": M.BASE.GOOGLE_PATH, "enabled": True}
        if kind == "config":
            return copy.deepcopy(self.config)
        if kind == "firebase":
            return copy.deepcopy(self.key)
        raise AssertionError(kind)


class InspectionTests(unittest.TestCase):
    def test_empty_signin_receipt_is_accepted_without_writes(self):
        client = FakeClient(False)
        client.config["signIn"] = {}
        self.assertFalse(self.receipt(client)["floot_origin_present"])
        self.assertFalse(any(body is not None for _, body, _ in client.calls))

    def test_enabled_or_malformed_signin_is_rejected(self):
        for value in (None, {"email": {"enabled": True}},
                      {"email": {"enabled": 0, "passwordRequired": False},
                       "anonymous": {"enabled": False}, "phoneNumber": {"enabled": False}}):
            client = FakeClient(False)
            client.config["signIn"] = value
            with self.subTest(value=value), self.assertRaisesRegex(SystemExit, "AUTH_CONFIG"):
                self.receipt(client)

    def receipt(self, client):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            M.inspect(client)
        return json.loads(output.getvalue())

    def test_reports_exact_absent_state_without_writes(self):
        client = FakeClient(False)
        receipt = self.receipt(client)
        self.assertFalse(receipt["floot_origin_present"])
        self.assertFalse(receipt["cloud_mutation"])
        self.assertEqual(receipt["firebase_api_target_count"], 27)
        self.assertTrue(all(body is None and operation is None
                            for _, body, operation in client.calls))

    def test_reports_exact_present_state_without_writes(self):
        receipt = self.receipt(FakeClient(True))
        self.assertTrue(receipt["floot_origin_present"])
        self.assertEqual(receipt["stage"],
                         "PREVIEW_V2_FLOOT_ORIGIN_METADATA_READ_COMPLETED")

    def test_partial_state_is_rejected(self):
        client = FakeClient(False)
        client.config = config(M.FLOOT_DOMAINS)
        with self.assertRaisesRegex(SystemExit,
                                    "FLOOT_ORIGIN_PARTIAL_STATE_RECONCILE"):
            self.receipt(client)

    def test_unknown_domain_referrer_or_api_target_is_rejected(self):
        clients = []
        domain = FakeClient(False)
        domain.config["authorizedDomains"].append("unknown.example")
        clients.append(domain)
        referrer = FakeClient(False)
        referrer.key["restrictions"]["browserKeyRestrictions"][
            "allowedReferrers"].append("https://evil.example/*")
        clients.append(referrer)
        target = FakeClient(False)
        target.key["restrictions"]["apiTargets"].append(
            {"service": "other.googleapis.com"})
        clients.append(target)
        for client in clients:
            with self.subTest(client=client), self.assertRaises(SystemExit):
                self.receipt(client)

    def test_pins_exact_project_key_and_floot_origin(self):
        self.assertEqual(M.BASE.PROJECT, "khedmah-preview-v2-20261012")
        self.assertEqual(M.BASE.NUMBER, "1044962071847")
        self.assertEqual(M.FLOOT_ORIGIN, "https://khedma-meeting.floot.app")
        self.assertEqual(M.BASE.FIREBASE_UID,
                         "fdae1cd2-64ce-49ec-a426-ed46120083e9")


if __name__ == "__main__":
    unittest.main()
