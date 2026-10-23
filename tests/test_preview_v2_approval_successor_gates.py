"""Offline tests for the read-only Preview successor gate inspector."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "successor_gates_test", ROOT / "scripts/read-preview-v2-approval-successor-gates.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def service_fixture():
    full = m.SERVICE_NAME
    rev = full + "/revisions/" + m.KNOWN_REVISION
    return {
        "name": full,
        "uid": "11111111-2222-4333-8444-555555555555",
        "generation": "8",
        "observedGeneration": "8",
        "reconciling": False,
        "terminalCondition": {"state": "CONDITION_SUCCEEDED"},
        "latestReadyRevision": rev,
        "latestCreatedRevision": rev,
        "template": {
            "serviceAccount": m.RUNTIME_SA,
            "containers": [{"image": "europe-west1-docker.pkg.dev/old/backend@sha256:" + "a" * 64}],
        },
        "scaling": {"scalingMode": "AUTOMATIC", "minInstanceCount": 0},
        "trafficStatuses": [{
            "revision": rev, "percent": 100,
            "type": "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
        }],
    }

def revisions_fixture():
    return {
        "revisions": [{
            "name": m.SERVICE_NAME + "/revisions/" + m.KNOWN_REVISION,
            "service": m.SERVICE_NAME,
            "conditions": [{"type": "Ready", "state": "CONDITION_SUCCEEDED"}],
            "scaling": {"minInstanceCount": 0, "maxInstanceCount": 100},
        }]
    }

class SummaryTests(unittest.TestCase):
    def test_service_summary_binds_stable_old_revision_without_candidate_deployment(self):
        result = m.service_summary(service_fixture())
        self.assertEqual(result["latest_ready_revision"], m.KNOWN_REVISION)
        self.assertTrue(result["known_revision_still_latest_ready"])
        self.assertFalse(result["template_uses_candidate_image"])
        self.assertTrue(result["runtime_service_account_matches"])
        self.assertEqual(result["tagged_revision_count"], 0)
        self.assertEqual(result["serving_revision_count"], 1)

    def test_service_summary_preserves_tags_and_requires_full_percent(self):
        value = service_fixture()
        rev = value["trafficStatuses"][0]["revision"]
        value["trafficStatuses"] = [
            {"revision": rev, "percent": 100},
            {"revision": rev, "percent": 0, "tag": "old"},
        ]
        result = m.service_summary(value)
        self.assertEqual(result["tagged_revision_count"], 1)
        bad = service_fixture()
        bad["trafficStatuses"][0]["percent"] = 99
        with self.assertRaisesRegex(SystemExit, "TRAFFIC_PERCENT_INVALID"):
            m.service_summary(bad)

    def test_revision_list_is_complete_and_scaling_bounded(self):
        result = m.revisions_summary(revisions_fixture())
        self.assertEqual(result[0]["revision"], m.KNOWN_REVISION)
        self.assertTrue(result[0]["ready"])
        bad = revisions_fixture()
        bad["nextPageToken"] = "more"
        with self.assertRaisesRegex(SystemExit, "REVISION_LIST_INCOMPLETE_OR_INVALID"):
            m.revisions_summary(bad)

    def test_scaling_rejects_unknown_fields(self):
        with self.assertRaisesRegex(SystemExit, "SCALING_METADATA_INVALID"):
            m.safe_scaling({"future": 1}, service=True)

class AuthorityTests(unittest.TestCase):
    def test_authority_requires_every_policy_decision_granted(self):
        def good(token, method, url, body=None, optional=False):
            self.assertEqual(url, m.TROUBLESHOOT_URL)
            self.assertEqual(method, "POST")
            return {"overallAccessState": "CAN_ACCESS"}
        with patch.object(m, "http_json", side_effect=good):
            result = m.authority_summary("token")
        self.assertTrue(result["all_granted"])
        self.assertTrue(result["policy_troubleshooter_complete"])
        self.assertEqual(set(result["checks"]), {row[0] for row in m.AUTHORITY_CHECKS})

    def test_authority_fails_closed_on_denial_unknown_or_unavailable(self):
        states = iter([
            {"overallAccessState": "CAN_ACCESS"},
            {"overallAccessState": "CANNOT_ACCESS"},
            {"overallAccessState": "UNKNOWN_INFO"},
            {"_read_status": "http_403"},
            {"overallAccessState": "CAN_ACCESS"},
            {"overallAccessState": "CAN_ACCESS"},
        ])
        with patch.object(m, "http_json", side_effect=lambda *a, **k: next(states)):
            result = m.authority_summary("token")
        self.assertFalse(result["all_granted"])
        self.assertFalse(result["policy_troubleshooter_complete"])

    def test_http_scope_rejects_other_urls_before_network(self):
        with self.assertRaisesRegex(SystemExit, "HTTP_READ_SCOPE_REJECTED"):
            m.http_json("token", "GET", "https://example.invalid/")
        bad = {"accessTuple": {"principal": m.DEPLOYER,
               "fullResourceName": "//run.googleapis.com/projects/foreign",
               "permission": "run.services.update"}}
        with self.assertRaisesRegex(SystemExit, "AUTHORITY_REQUEST_SCOPE_REJECTED"):
            m.http_json("token", "POST", m.TROUBLESHOOT_URL, bad)

class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)

    def test_session_read_is_read_only_count_only_and_never_claims_quiescence(self):
        payload = {
            "database": m.DATABASE, "user": m.MIGRATOR_DB_USER, "read_only": "on",
            "server_version_num": 160009, "pg_read_all_stats_member": False,
            "runtime_sessions_total": 0, "runtime_sessions_active": 0,
            "runtime_sessions_idle_in_transaction": 0, "migrator_sessions_other": 0,
            "other_client_sessions": 0,
        }
        completed = subprocess.CompletedProcess([], 0, json.dumps(payload) + "\n", "")
        with patch.object(m.subprocess, "run", return_value=completed) as run:
            result = m.read_sessions(Mock(), self.work, "a" * 64)
        self.assertTrue(result["runtime_sessions_zero_snapshot"])
        self.assertFalse(result["writer_quiescence_verified"])
        self.assertIn("BEGIN READ ONLY", run.call_args.kwargs["input"])
        self.assertNotIn("pg_terminate_backend", run.call_args.kwargs["input"])

    def test_session_read_preserves_runtime_activity_as_blocking_evidence(self):
        payload = {
            "database": m.DATABASE, "user": m.MIGRATOR_DB_USER, "read_only": "on",
            "server_version_num": 160009, "pg_read_all_stats_member": True,
            "runtime_sessions_total": 3, "runtime_sessions_active": 1,
            "runtime_sessions_idle_in_transaction": 1, "migrator_sessions_other": 0,
            "other_client_sessions": 0,
        }
        completed = subprocess.CompletedProcess([], 0, json.dumps(payload) + "\n", "")
        with patch.object(m.subprocess, "run", return_value=completed):
            result = m.read_sessions(Mock(), self.work, "b" * 64)
        self.assertFalse(result["runtime_sessions_zero_snapshot"])
        self.assertFalse(result["writer_quiescence_verified"])
        self.assertEqual(result["runtime_sessions_total"], 3)

class ContractTests(unittest.TestCase):
    def test_candidate_and_target_are_pinned(self):
        self.assertEqual(m.CANDIDATE_BUILD_ID, "8b1b7aee-67f3-4721-ae76-f4bb60b4dc5e")
        self.assertEqual(m.SOURCE_GENERATION, "1792786650146421")
        self.assertTrue(m.CANDIDATE_IMAGE.endswith(
            "@sha256:2146d382d426568a510b6e76ff06129934e84beb86bc81c348454fe3e29e260e"))

    def test_inspector_source_has_no_cloud_or_database_mutation_calls(self):
        source = (ROOT / "scripts/read-preview-v2-approval-successor-gates.py").read_text()
        for forbidden in (
            "run services update", "run deploy", "ALTER ROLE", "GRANT ", "REVOKE ",
            "pg_terminate_backend", "UPDATE public.", "INSERT INTO public.", "DELETE FROM public.",
        ):
            self.assertNotIn(forbidden, source)
        self.assertIn('"writer_quiescence_verified": False', source)
        self.assertIn('"cloud_resource_mutation": False', source)

if __name__ == "__main__":
    unittest.main()
