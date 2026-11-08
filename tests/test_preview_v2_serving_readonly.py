"""Read-only Preview V2 serving configuration probe never grants a release."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "preview_serving_reader", ROOT / "scripts/read-preview-v2-serving-services.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture(service, instances=1, mode="MANUAL"):
    revision = (m.reader.BACKEND_REVISION if service == m.reader.BACKEND
                else "khedmah-pr-274-frontend-00009-ab1")
    scaling = {"scalingMode": mode}
    if mode == "MANUAL":
        scaling["manualInstanceCount"] = instances
    return {
        "name": m.reader.RESOURCE_PREFIX + service,
        "uid": "private-uid-should-not-print",
        "generation": "8",
        "observedGeneration": "8",
        "reconciling": False,
        "terminalCondition": {"state": "CONDITION_SUCCEEDED"},
        "scaling": scaling,
        "trafficStatuses": [{"revision": revision, "percent": 100}],
        "latestReadyRevision": (m.reader.RESOURCE_PREFIX + service
                                 + "/revisions/" + revision),
        "updateTime": "2026-11-07T21:00:00Z",
        "template": {"containers": [{"env": [{"name": "DATABASE_URL",
                     "valueSource": {"secretKeyRef": {"secret": "SECRET-REF"}}}]}]},
        "uri": "https://private-service-host.example",
    }


class ServingReadOnlyTests(unittest.TestCase):
    def test_manual_nonzero_is_observed_not_claimed_as_writer_quiescence(self):
        output = io.StringIO()
        back = fixture(m.reader.BACKEND, 1)
        front = fixture(m.reader.FRONTEND, 2)
        with patch.object(m.reader, "access_token", return_value="private-token"), \
             patch.object(m.reader, "read_service",
                          side_effect=[back, front, back, front]) as reads, \
             contextlib.redirect_stdout(output):
            m.main(["--inspect"])
        self.assertEqual(
            [call.args[1] for call in reads.call_args_list],
            [m.reader.BACKEND, m.reader.FRONTEND,
             m.reader.BACKEND, m.reader.FRONTEND],
        )
        receipt = json.loads(output.getvalue())
        self.assertEqual(receipt["stage"], "PREVIEW_V2_SERVING_CONFIGURATION_READ_ONLY")
        self.assertEqual([x["scaling_class"] for x in receipt["services"]],
                         ["manual_nonzero", "manual_nonzero"])
        self.assertTrue(receipt["serving_configuration_consistent"])
        for key in ("release_authorized", "writer_quiescence_verified",
                    "database_checked", "http_health_checked",
                    "monitoring_checked", "external_writer_sources_checked",
                    "cloud_resource_mutation", "database_mutation"):
            self.assertIs(receipt[key], False, key)
        for secret in ("DATABASE_URL", "SECRET-REF", "private-token",
                       "private-uid", "private-service-host"):
            self.assertNotIn(secret, output.getvalue())

    def test_zero_is_only_a_scaling_class_and_never_a_writer_proof(self):
        front = fixture(m.reader.FRONTEND, 0)
        self.assertEqual(m.serving_state(front, m.reader.FRONTEND)["scaling_class"],
                         "manual_zero")
        self.assertIsNone(m.serving_state(front, m.reader.FRONTEND)[
            "revision_matches_historical_backend_pin"])

    def test_automatic_is_accepted_for_diagnosis_not_as_release(self):
        back = fixture(m.reader.BACKEND, mode="AUTOMATIC")
        self.assertEqual(m.serving_state(back, m.reader.BACKEND)["scaling_class"],
                         "automatic")

    def test_revision_drifts_are_not_falsely_treated_as_release_proof(self):
        back = fixture(m.reader.BACKEND)
        revision = m.reader.BACKEND + "-00009-xyz"
        back["trafficStatuses"][0]["revision"] = revision
        back["latestReadyRevision"] = revision
        self.assertFalse(m.serving_state(back, m.reader.BACKEND)[
            "revision_matches_historical_backend_pin"])

    def test_inconsistent_serving_revision_is_rejected(self):
        bad = fixture(m.reader.FRONTEND)
        bad["latestReadyRevision"] = m.reader.FRONTEND + "-00010-next"
        with self.assertRaisesRegex(SystemExit, "SERVICE_LATEST_REVISION_DRIFT"):
            m.serving_state(bad, m.reader.FRONTEND)

    def test_scope_generation_tag_and_traffic_fail_closed(self):
        cases = [
            ("name", "projects/untrusted/locations/europe-west1/services/" +
             m.reader.FRONTEND, "SERVICE_IDENTITY_INVALID"),
            ("observedGeneration", "7", "SERVICE_GENERATION_DRIFT"),
            ("reconciling", True, "SERVICE_RECONCILING"),
            ("trafficStatuses", [{"revision": m.reader.FRONTEND +
              "-00009-ab1", "percent": 101}], "SERVICE_TRAFFIC_INVALID"),
            ("trafficStatuses", [{"revision": m.reader.FRONTEND +
              "-00009-ab1", "percent": 100, "tag": "untrusted"}],
              "SERVICE_TRAFFIC_TAG_PRESENT"),
            ("updateTime", "2035-11-08T12:00:00Z",
             "SERVICE_UPDATE_TIME_INVALID"),
        ]
        for key, value, reason in cases:
            with self.subTest(key=key, reason=reason):
                bad = fixture(m.reader.FRONTEND)
                bad[key] = value
                with self.assertRaisesRegex(SystemExit, reason):
                    m.serving_state(bad, m.reader.FRONTEND)

    def test_scaling_classes_reject_unknown_or_ambiguous_values(self):
        for scaling in [{"scalingMode": "MANUAL"},
                        {"scalingMode": "MANUAL", "manualInstanceCount": True},
                        {"scalingMode": "MANUAL", "manualInstanceCount": -1},
                        {"scalingMode": "INVALID"},
                        {"scalingMode": "AUTOMATIC", "manualInstanceCount": 3}]:
            with self.subTest(scaling=scaling):
                bad = fixture(m.reader.FRONTEND)
                bad["scaling"] = scaling
                with self.assertRaisesRegex(SystemExit, "SERVICE_SCALING_INVALID"):
                    m.serving_state(bad, m.reader.FRONTEND)

    def test_two_read_state_drift_blocks_receipt(self):
        back = fixture(m.reader.BACKEND)
        front = fixture(m.reader.FRONTEND)
        changed = fixture(m.reader.FRONTEND)
        changed["generation"] = changed["observedGeneration"] = "9"
        with patch.object(m.reader, "access_token", return_value="private"), \
             patch.object(m.reader, "read_service",
                          side_effect=[back, front, back, changed]):
            with self.assertRaisesRegex(SystemExit, "SERVICE_STATE_DRIFT_DURING_READ"):
                m.main(["--inspect"])

    def test_only_inspect_cli_and_no_mutating_commands(self):
        for args in (["--deploy"], [], ["--inspect", "--migrate"]):
            with self.assertRaisesRegex(SystemExit, "READ_ONLY_INSPECT_ONLY"):
                m.main(args)
        source = (ROOT / "scripts/read-preview-v2-serving-services.py").read_text()
        for forbidden in ("run services update", "gcloud run deploy",
                          "sql instances patch", "UPDATE ", "INSERT ",
                          "workflow_dispatch"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
