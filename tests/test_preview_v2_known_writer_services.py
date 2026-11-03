"""Fail-closed tests for the two known Preview V2 Cloud Run writer services."""
import contextlib
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "preview_writer_services", ROOT / "scripts/read-preview-v2-known-writer-services.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def service_fixture(name, revision=None):
    if revision is None:
        revision = (m.BACKEND_REVISION if name == m.BACKEND
                    else "khedmah-pr-274-frontend-00009-ab1")
    return {
        "name": m.RESOURCE_PREFIX + name,
        "uid": "fixture-" + name,
        "generation": "8",
        "observedGeneration": "8",
        "reconciling": False,
        "terminalCondition": {"state": "CONDITION_SUCCEEDED"},
        "scaling": {"scalingMode": "MANUAL", "manualInstanceCount": 0},
        "trafficStatuses": [{"revision": revision, "percent": 100}],
        "latestReadyRevision": m.RESOURCE_PREFIX + name + "/revisions/" + revision,
        "updateTime": "2026-10-24T20:40:32Z",
        "template": {"containers": [{"env": [
            {"name": "DATABASE_URL", "valueSource": {"secretKeyRef": {"secret": "PRIVATE"}}}
        ]}]},
    }


class PreviewKnownWriterServicesTests(unittest.TestCase):
    def test_two_known_services_read_twice_no_secrets_printed(self):
        back = service_fixture(m.BACKEND)
        front = service_fixture(m.FRONTEND)
        output = io.StringIO()
        with patch.object(m, "access_token", return_value="fake"), \
             patch.object(m, "read_service", side_effect=[
                 back, front, back, front
             ]) as read, contextlib.redirect_stdout(output):
            m.main(["--inspect"])
        self.assertEqual(
            [c.args[1] for c in read.call_args_list],
            [m.BACKEND, m.FRONTEND, m.BACKEND, m.FRONTEND]
        )
        receipt = json.loads(output.getvalue())
        self.assertEqual(receipt["stage"], "PREVIEW_V2_KNOWN_SERVICES_READ_ONLY")
        self.assertEqual(receipt["known_service_count"], 2)
        self.assertTrue(receipt["known_services_read_twice"])
        self.assertTrue(receipt["backend"]["manual_zero"])
        self.assertTrue(receipt["frontend"]["manual_zero"])
        self.assertFalse(receipt["database_checked"])
        self.assertFalse(receipt["writer_quiescence_verified"])
        self.assertFalse(receipt["release_authorized"])
        self.assertFalse(receipt["cloud_resource_mutation"])
        self.assertFalse(receipt["external_writer_sources_checked"])
        self.assertNotIn("DATABASE_URL", output.getvalue())
        self.assertNotIn("PRIVATE", output.getvalue())

    def test_backend_short_and_full_revision_are_exact(self):
        value = service_fixture(m.BACKEND)
        self.assertEqual(
            m.inspect_service(value, m.BACKEND)["revision"], m.BACKEND_REVISION
        )
        value["trafficStatuses"][0]["revision"] = (
            m.RESOURCE_PREFIX + m.BACKEND + "/revisions/" + m.BACKEND_REVISION
        )
        self.assertEqual(
            m.inspect_service(value, m.BACKEND)["revision"], m.BACKEND_REVISION
        )

    def test_frontend_active_revision_blocks_all_claims(self):
        bad = service_fixture(m.FRONTEND)
        bad["scaling"]["manualInstanceCount"] = 1
        with self.assertRaisesRegex(SystemExit, "SERVICE_NOT_MANUAL_ZERO"):
            m.inspect_service(bad, m.FRONTEND)

    def test_frontend_tagged_or_ambiguous_traffic_blocks(self):
        bad = service_fixture(m.FRONTEND)
        bad["trafficStatuses"][0]["tag"] = "alternate"
        with self.assertRaisesRegex(SystemExit, "TAGGED_REVISION_PRESENT"):
            m.inspect_service(bad, m.FRONTEND)
        bad["trafficStatuses"][0]["tag"] = ""
        with self.assertRaisesRegex(SystemExit, "TAGGED_REVISION_PRESENT"):
            m.inspect_service(bad, m.FRONTEND)
        bad["trafficStatuses"][0].pop("tag")
        bad["trafficStatuses"].append(bad["trafficStatuses"][0].copy())
        with self.assertRaisesRegex(SystemExit, "SERVICE_TRAFFIC_INVALID"):
            m.inspect_service(bad, m.FRONTEND)

    def test_wrong_project_service_revision_and_generation_are_rejected(self):
        for field, value, code in [
            ("name", "projects/foreign/locations/europe-west1/services/" + m.FRONTEND,
             "SERVICE_IDENTITY_MISMATCH"),
            ("observedGeneration", "9", "SERVICE_RECONCILIATION_PENDING"),
            ("latestReadyRevision", "khedmah-pr-274-frontend-00008-drift",
             "LATEST_SERVING_REVISION_MISMATCH"),
        ]:
            with self.subTest(field=field):
                bad = service_fixture(m.FRONTEND)
                bad[field] = value
                with self.assertRaisesRegex(SystemExit, code):
                    m.inspect_service(bad, m.FRONTEND)

    def test_wrong_resource_scope_and_name_rejected(self):
        for value in [
            "projects/other/locations/europe-west1/services/"
            "khedmah-pr-274-frontend/revisions/khedmah-pr-274-frontend-00009-ab1",
            "khedmah-pr-274-frontend-00009-ab1-fake",
            "khedmah-pr-274-frontend-00009-ab1/extra",
            "",
            None,
        ]:
            with self.subTest(value=value):
                bad = service_fixture(m.FRONTEND)
                bad["trafficStatuses"][0]["revision"] = value
                with self.assertRaisesRegex(SystemExit, "REVISION_INVENTORY_INVALID"):
                    m.inspect_service(bad, m.FRONTEND)
        with self.assertRaisesRegex(SystemExit, "SERVICE_READ_SCOPE_REJECTED"):
            m.read_service("fake", "other-frontend")

    def test_two_pass_drift_fails_without_db_access(self):
        back = service_fixture(m.BACKEND)
        front = service_fixture(m.FRONTEND)
        new_front = service_fixture(m.FRONTEND)
        new_front["generation"] = "9"
        new_front["observedGeneration"] = "9"
        with patch.object(m, "access_token", return_value="fake"), \
             patch.object(m, "read_service", side_effect=[
                 back, front, back, new_front
             ]):
            with self.assertRaisesRegex(SystemExit, "WRITER_SERVICE_STATE_DRIFT"):
                m.main(["--inspect"])

    def test_active_frontend_is_named_in_fail_closed_receipt(self):
        back = service_fixture(m.BACKEND)
        front = service_fixture(m.FRONTEND)
        front["scaling"] = {"scalingMode": "AUTOMATIC"}
        output = io.StringIO()
        with patch.object(m, "access_token", return_value="fake"), \
             patch.object(m, "read_service", side_effect=[
                 back, front, back, front
             ]) as reads, contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(SystemExit, "KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT"):
                m.main(["--inspect"])
        self.assertEqual(reads.call_count, 4)
        report = json.loads(output.getvalue())
        self.assertEqual(report["stage"], "PREVIEW_V2_KNOWN_SERVICES_BLOCKED_READ_ONLY")
        self.assertEqual([x["service"] for x in report["failed_checks"]],
                         [m.FRONTEND, m.FRONTEND])
        for failure in report["failed_checks"]:
            self.assertEqual(failure["reason"], "SERVICE_NOT_MANUAL_ZERO")
            self.assertEqual(failure["scaling"]["mode"], "AUTOMATIC")
            self.assertEqual(failure["scaling"]["manual_instances"], "MISSING_OR_UNKNOWN")
        for field in ("writer_quiescence_verified", "release_authorized",
                      "database_checked", "cloud_resource_mutation"):
            self.assertIs(report[field], False, field)
        self.assertNotIn("DATABASE_URL", output.getvalue())
        self.assertNotIn("PRIVATE", output.getvalue())

    def test_both_active_services_are_reported_without_early_exit(self):
        back = service_fixture(m.BACKEND)
        back["scaling"]["manualInstanceCount"] = 2
        front = service_fixture(m.FRONTEND)
        front["scaling"]["manualInstanceCount"] = 1
        output = io.StringIO()
        with patch.object(m, "access_token", return_value="fake"), \
             patch.object(m, "read_service", side_effect=[
                 back, front, back, front
             ]), contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(SystemExit, "KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT"):
                m.main(["--inspect"])
        report = json.loads(output.getvalue())
        self.assertEqual(len(report["failed_checks"]), 4)
        self.assertEqual(set(x["service"] for x in report["failed_checks"]), set(m.SERVICES))
        self.assertTrue(all(x["scaling"]["manual_instances"] == "NONZERO"
                            for x in report["failed_checks"]))

    def test_failed_validation_does_not_print_untrusted_response_details(self):
        front = service_fixture(m.FRONTEND)
        front["trafficStatuses"][0]["tag"] = "private-tag-or-url"
        output = io.StringIO()
        with patch.object(m, "access_token", return_value="fake"), \
             patch.object(m, "read_service", side_effect=[
                 service_fixture(m.BACKEND), front,
                 service_fixture(m.BACKEND), front
             ]), contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(SystemExit, "KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT"):
                m.main(["--inspect"])
        report = json.loads(output.getvalue())
        self.assertEqual(report["failed_checks"][0]["reason"], "TAGGED_REVISION_PRESENT")
        self.assertNotIn("private-tag-or-url", output.getvalue())

    def test_reject_unknown_cli_mode(self):
        with self.assertRaisesRegex(SystemExit, "READ_ONLY_INSPECT_ONLY"):
            m.main(["--deploy"])


if __name__ == "__main__":
    unittest.main()
