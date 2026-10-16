import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

SPEC = importlib.util.spec_from_file_location("storage_step", Path(__file__).parents[1] / "scripts/provision-preview-v2-storage.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class FakeClient:
    def __init__(self, existing=False, different_rules=False, public=False):
        self.existing = existing
        self.different_rules = different_rules
        self.public = public
        self.ruleset = None
        self.allow_create = False
        self.rules_name = m.PARENT + "/rulesets/fixture-1"
        self.release_exists = existing
        self.calls = []
        self.inventory_calls = 0
        self.drift = False
        self.bad_region = False
        self.wrong_project = False

    def request(self, service, path, *, body=None, query=None, missing=False):
        self.calls.append((service, path, copy.deepcopy(body)))
        if service == "firebase":
            if path == m.PARENT:
                return {"projectId": "production" if self.wrong_project else m.PROJECT,
                        "projectNumber": m.NUMBER, "state": "ACTIVE"}
            return {"projectId": m.PROJECT, "appId": m.APP_ID, "storageBucket": m.BUCKET}
        if service == "storage":
            bucket = {"name": m.BUCKET, "projectNumber": m.NUMBER,
                      "location": "US" if self.bad_region else "EUROPE-WEST1"}
            if path == "b":
                self.inventory_calls += 1
                if self.drift and self.inventory_calls > 1:
                    self.existing = True
                return {"items": [bucket] if self.existing else []}
            if path.endswith("/iam"):
                return {"resourceId": "projects/_/buckets/" + m.BUCKET,
                        "bindings": [{"members": ["allUsers" if self.public else "user:fixture@example.test"]}]}
            return bucket
        if service == "default":
            if body:
                if not self.allow_create or not self.release_exists:
                    raise AssertionError("Bucket created without verified deny-all release")
                self.existing = True
            if not self.existing:
                return None
            return {"name": m.DEFAULT, "location": m.REGION,
                    "bucket": {"name": "projects/" + m.NUMBER + "/buckets/" + m.BUCKET}}
        if service == "rules":
            if path.endswith("/rulesets") and body:
                return {"name": self.rules_name}
            if path.endswith("/releases") and body:
                self.release_exists = True
                return body
            if path == m.RELEASE:
                return {"name": m.RELEASE, "rulesetName": self.rules_name} if self.release_exists else None
            return {"name": self.rules_name, "source": {"files": [{"name": "storage.rules",
                "content": m.RULES.replace("false", "true") if self.different_rules else m.RULES}]}}
        raise AssertionError((service, path))


class StorageTests(unittest.TestCase):
    def run_step(self, client, enabled=True):
        with contextlib.redirect_stdout(io.StringIO()) as out, patch.object(m, "cloud") as cloud:
            m.run(client, {"firebasestorage.googleapis.com"} if enabled else set())
        return out.getvalue(), cloud

    def test_create_releases_deny_all_before_bucket_and_never_touches_secrets(self):
        client = FakeClient()
        output, cloud = self.run_step(client, enabled=False)
        cloud.assert_called_once_with("services", "enable", "firebasestorage.googleapis.com", "--quiet")
        writes = [c for c in client.calls if c[2] is not None]
        self.assertEqual([c[0] for c in writes], ["rules", "rules", "default"])
        self.assertEqual(writes[-1][2], {"location": "europe-west1"})
        self.assertIn('"effective_iam_verified": false', output)
        self.assertIn('"secret_value_staged": false', output)
        self.assertIn("STORAGE_PROVISIONING_COMPLETED", output)
        self.assertNotIn("secrets", [c[0] for c in client.calls])

    def test_existing_correct_bucket_is_read_only(self):
        client = FakeClient(existing=True)
        output, cloud = self.run_step(client)
        self.assertFalse(any(c[2] is not None for c in client.calls))
        cloud.assert_not_called()
        self.assertIn("ALREADY_PRESENT_NO_MUTATION", output)

    def test_existing_rules_are_never_overwritten(self):
        client = FakeClient(existing=True, different_rules=True)
        with self.assertRaisesRegex(SystemExit, "NO_OVERWRITE"):
            self.run_step(client)
        self.assertFalse(any(c[2] is not None for c in client.calls))

    def test_wrong_project_stops_before_mutation(self):
        client = FakeClient()
        client.wrong_project = True
        with self.assertRaisesRegex(SystemExit, "FIREBASE_PROJECT_MISMATCH"):
            self.run_step(client)
        self.assertFalse(any(c[2] is not None for c in client.calls))

    def test_inventory_drift_never_relinks_bucket(self):
        client = FakeClient()
        client.drift = True
        with self.assertRaisesRegex(SystemExit, "NO_RELINK"):
            self.run_step(client)
        self.assertFalse(any(c[0] == "default" and c[2] is not None for c in client.calls))

    def test_public_direct_iam_is_rejected_not_modified(self):
        client = FakeClient(existing=True, public=True)
        with self.assertRaisesRegex(SystemExit, "PUBLIC_BUCKET_IAM"):
            self.run_step(client)
        self.assertFalse(any(c[2] is not None for c in client.calls))

    def test_foreign_region_rejected(self):
        client = FakeClient(existing=True)
        client.bad_region = True
        with self.assertRaisesRegex(SystemExit, "BUCKET_IDENTITY_OR_REGION"):
            self.run_step(client)

    def test_existing_unlinked_bucket_does_not_enable_or_adopt(self):
        client = FakeClient(existing=True)
        with self.assertRaisesRegex(SystemExit, "EXISTING_UNLINKED_BUCKET"):
            self.run_step(client, enabled=False)
        self.assertFalse(any(c[2] is not None for c in client.calls))

    def test_partial_or_foreign_inventory_blocks(self):
        for result in ({"unreachable": ["x"]}, {"items": [{"name": m.BUCKET, "projectNumber": "wrong"}]}):
            client = FakeClient()
            with patch.object(client, "request", return_value=result), self.assertRaises(SystemExit):
                m.buckets(client)

    def test_repeated_page_token_blocks(self):
        client = FakeClient()
        with patch.object(client, "request", return_value={"nextPageToken": "again"}), self.assertRaisesRegex(SystemExit, "PAGINATION"):
            m.buckets(client)

    def test_real_transport_rejects_out_of_scope_and_unguarded_create(self):
        client = m.Client("test-token-never-print")
        for service, path, body in [
            ("secrets", "anything", None), ("default", m.DEFAULT, {"location": m.REGION}),
            ("rules", m.PARENT + "/releases", {"name": m.RELEASE, "rulesetName": "foreign"}),
            ("default", "projects/production/defaultBucket", {"location": m.REGION})]:
            with self.assertRaisesRegex(SystemExit, "REQUEST_SCOPE_REJECTED"):
                client.request(service, path, body=body)

    def test_denials_and_disabled_api_do_not_become_absence(self):
        for code, detail in [(403, {"status": "PERMISSION_DENIED"}),
                             (404, {"status": "NOT_FOUND", "details": [{"reason": "SERVICE_DISABLED"}]}),
                             (404, {"message": "not structured"})]:
            client = m.Client("never-print-this-token")
            error = urllib.error.HTTPError("https://example.test", code, "error", {},
                io.BytesIO(json.dumps({"error": detail}).encode()))
            with patch.object(client.opener, "open", side_effect=error), contextlib.redirect_stdout(io.StringIO()) as out:
                with self.assertRaises(SystemExit):
                    client.request("default", m.DEFAULT, missing=True)
            self.assertNotIn(client.token, out.getvalue())

    def test_structured_resource_not_found_can_be_absent(self):
        client = m.Client("token")
        error = urllib.error.HTTPError("https://example.test", 404, "missing", {},
            io.BytesIO(json.dumps({"error": {"status": "NOT_FOUND", "details": [{"@type": "ResourceInfo"}]}}).encode()))
        with patch.object(client.opener, "open", side_effect=error):
            self.assertIsNone(client.request("default", m.DEFAULT, missing=True))

    def test_gcloud_project_mismatch_blocks_token_and_writes(self):
        responses = ["(unset)", "(unset)", "(unset)", {"projectId": "khedma-dl"}]
        with patch.object(m, "cloud", side_effect=responses) as cloud, patch.dict(m.os.environ, {}, clear=True):
            with self.assertRaisesRegex(SystemExit, "PROJECT_IDENTITY_MISMATCH"):
                m.preflight()
        self.assertEqual(cloud.call_count, 4)

    def test_rules_match_canonical_repository_file(self):
        source = Path(__file__).parents[1] / "infra/firebase/storage.rules"
        self.assertEqual(m.RULES, source.read_text())


if __name__ == "__main__":
    unittest.main()
