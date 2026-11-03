import importlib.util
import pathlib
import unittest
import contextlib
import io
import json
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = ROOT / "scripts" / "read-preview-v2-instance-metric-evidence.py"
SPEC = importlib.util.spec_from_file_location("metric_reader", PATH)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)

class InstanceMetricEvidenceTests(unittest.TestCase):
    def test_fixed_target_and_read_only_boundary(self):
        self.assertEqual(MOD.PROJECT, "khedmah-preview-v2-20261012")
        self.assertEqual(MOD.REGION, "europe-west1")
        self.assertEqual(MOD.SERVICE, "khedmah-pr-274-backend")
        self.assertEqual(MOD.REVISION, "khedmah-pr-274-backend-00008-tg8")
        self.assertEqual(MOD.METRIC, "run.googleapis.com/container/instance_count")

    def test_metric_descriptor_url_preserves_metric_path_slashes(self):
        self.assertEqual(
            MOD.descriptor_url(),
            "https://monitoring.googleapis.com/v3/projects/"
            "khedmah-preview-v2-20261012/metricDescriptors/"
            "run.googleapis.com/container/instance_count",
        )
        self.assertNotIn("%2F", MOD.descriptor_url())

    def test_missing_series_is_not_zero_proof(self):
        boundary = MOD.datetime.datetime.fromisoformat(MOD.BOUNDARY.replace("Z", "+00:00"))
        got = MOD.parse_points({"timeSeries": []}, boundary)
        self.assertEqual(got["series_count"], 0)
        self.assertEqual(got["point_count"], 0)
        self.assertFalse(got["explicit_zero_after_boundary"])
        self.assertIsNone(got["latest_zero_end"])

    def test_explicit_zero_after_boundary_is_detected(self):
        boundary = MOD.datetime.datetime.fromisoformat(MOD.BOUNDARY.replace("Z", "+00:00"))
        payload = {"timeSeries": [{"points": [
            {"interval": {"endTime": "2026-10-24T20:41:32Z"}, "value": {"int64Value": "0"}},
            {"interval": {"endTime": "2026-10-24T20:40:00Z"}, "value": {"int64Value": "1"}},
        ]}]}
        got = MOD.parse_points(payload, boundary)
        self.assertTrue(got["explicit_zero_after_boundary"])
        self.assertEqual(got["latest_point_value"], 0)

    def test_pre_boundary_zero_does_not_count(self):
        boundary = MOD.datetime.datetime.fromisoformat(MOD.BOUNDARY.replace("Z", "+00:00"))
        payload = {"timeSeries": [{"points": [
            {"interval": {"endTime": "2026-10-24T20:39:32Z"}, "value": {"int64Value": "0"}}
        ]}]}
        got = MOD.parse_points(payload, boundary)
        self.assertFalse(got["explicit_zero_after_boundary"])

    def test_pagination_is_fail_closed(self):
        boundary = MOD.datetime.datetime.fromisoformat(MOD.BOUNDARY.replace("Z", "+00:00"))
        with self.assertRaisesRegex(SystemExit, "INSTANCE_METRIC_PAGINATION_UNEXPECTED"):
            MOD.parse_points({"nextPageToken": "x", "timeSeries": []}, boundary)

    def test_monitoring_zero_does_not_grant_writer_quiescence(self):
        """An explicit metric zero is evidence only, not release authorization."""
        zero = {"timeSeries": [{"points": [
            {"interval": {"endTime": "2026-10-24T20:41:32Z"}, "value": {"int64Value": "0"}}
        ]}]}
        def fake_get(url, _token):
            if "/metricDescriptors/" in url:
                return {"type": MOD.METRIC, "metricKind": "GAUGE", "valueType": "INT64",
                        "monitoredResourceTypes": ["cloud_run_revision"]}
            if "/monitoredResourceDescriptors/" in url:
                return {"type": MOD.RESOURCE, "labels": [
                    {"key": "service_name"}, {"key": "revision_name"}, {"key": "location"}
                ]}
            if "/timeSeries?" in url:
                return zero
            raise AssertionError("Unexpected network target")

        out = io.StringIO()
        with patch.object(MOD, "access_token", return_value="test-token"), \
             patch.object(MOD, "get_json", side_effect=fake_get), \
             contextlib.redirect_stdout(out):
            MOD.inspect()
        result = json.loads(out.getvalue())
        self.assertTrue(result["instance_zero_point_observed_after_boundary"])
        self.assertTrue(result["service_zero_point_observed_after_boundary"])
        self.assertFalse(result["writer_quiescence_verified"])
        self.assertFalse(result["database_checked"])
        self.assertFalse(result["release_authorized"])
        self.assertFalse(result["cloud_mutation_performed"])

    def test_missing_monitoring_data_stays_unverified(self):
        def fake_get(url, _token):
            if "/metricDescriptors/" in url:
                return {"type": MOD.METRIC, "monitoredResourceTypes": ["cloud_run_revision"]}
            if "/monitoredResourceDescriptors/" in url:
                return {"type": MOD.RESOURCE, "labels": []}
            if "/timeSeries?" in url:
                return {"timeSeries": []}
            raise AssertionError("Unexpected network target")

        out = io.StringIO()
        with patch.object(MOD, "access_token", return_value="test-token"), \
             patch.object(MOD, "get_json", side_effect=fake_get), \
             contextlib.redirect_stdout(out):
            MOD.inspect()
        result = json.loads(out.getvalue())
        self.assertFalse(result["instance_zero_point_observed_after_boundary"])
        self.assertFalse(result["service_zero_point_observed_after_boundary"])
        self.assertFalse(result["writer_quiescence_verified"])

    def test_instance_resource_diagnostic_finds_zero_without_authorizing_release(self):
        # A zero may be present under the alternate declared monitored resource.
        # Keep the old revision summary separate and leave all release gates off.
        zero = {"timeSeries": [{"points": [
            {"interval": {"endTime": "2026-10-24T20:41:32Z"},
             "value": {"int64Value": "0"}}
        ]}]}
        requested = []
        def fake_get(url, _token):
            requested.append(url)
            if "/metricDescriptors/" in url:
                return {"type": MOD.METRIC,
                        "monitoredResourceTypes": [MOD.RESOURCE, MOD.INSTANCE_RESOURCE]}
            if "/monitoredResourceDescriptors/" in url:
                resource = url.rsplit("/", 1)[-1]
                return {"type": resource, "labels": [
                    {"key": "service_name"}, {"key": "revision_name"}, {"key": "location"}]}
            if "/timeSeries?" in url:
                return zero if 'resource.type="cloud_run_instance"' in url else {"timeSeries": []}
            raise AssertionError("Unexpected request")

        out = io.StringIO()
        with patch.object(MOD, "access_token", return_value="test-token"), \
             patch.object(MOD, "get_json", side_effect=fake_get), \
             contextlib.redirect_stdout(out):
            MOD.inspect()
        result = json.loads(out.getvalue())
        self.assertFalse(result["instance_zero_point_observed_after_boundary"])
        self.assertTrue(result["instance_resource_zero_point_observed_after_boundary"])
        diagnostic = result["instance_resource_diagnostic"]
        self.assertTrue(diagnostic["filter_supported"])
        self.assertTrue(diagnostic["exact_revision_query"]["explicit_zero_after_boundary"])
        self.assertEqual(len([x for x in requested if "/timeSeries?" in x]), 4)
        self.assertFalse(result["writer_quiescence_verified"])
        self.assertFalse(result["database_checked"])
        self.assertFalse(result["release_authorized"])
        self.assertFalse(result["cloud_mutation_performed"])

    def test_instance_resource_with_missing_required_labels_never_uses_broad_query(self):
        requested = []
        def fake_get(url, _token):
            requested.append(url)
            if "/metricDescriptors/" in url:
                return {"type": MOD.METRIC,
                        "monitoredResourceTypes": [MOD.RESOURCE, MOD.INSTANCE_RESOURCE]}
            if "/monitoredResourceDescriptors/cloud_run_instance" in url:
                return {"type": MOD.INSTANCE_RESOURCE, "labels": [
                    {"key": "service_name"}, {"key": "location"}]}
            if "/monitoredResourceDescriptors/" in url:
                return {"type": MOD.RESOURCE, "labels": []}
            if "/timeSeries?" in url:
                return {"timeSeries": []}
            raise AssertionError("Unexpected request")

        out = io.StringIO()
        with patch.object(MOD, "access_token", return_value="test-token"), \
             patch.object(MOD, "get_json", side_effect=fake_get), \
             contextlib.redirect_stdout(out):
            MOD.inspect()
        result = json.loads(out.getvalue())
        self.assertFalse(result["instance_resource_diagnostic"]["filter_supported"])
        self.assertIsNone(result["instance_resource_diagnostic"]["exact_revision_query"])
        self.assertEqual(len([x for x in requested if "/timeSeries?" in x]), 2)
        self.assertFalse(result["writer_quiescence_verified"])

    def test_instance_resource_descriptor_scope_is_fixed(self):
        with self.assertRaisesRegex(SystemExit, "RESOURCE_SCOPE_REJECTED"):
            MOD.resource_descriptor_url("unknown_cloud_resource")

    def test_monitoring_permission_denied_is_reported_without_leaking_response(self):
        secret_response = io.BytesIO(b"secret=should-not-be-logged")
        error = MOD.urllib.error.HTTPError(
            "https://monitoring.googleapis.com/private?token=secret",
            403, "Forbidden: secret", {}, secret_response,
        )
        with patch.object(MOD.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(SystemExit, r"^STOP: MONITORING_PERMISSION_DENIED$") as raised:
                MOD.get_json(MOD.descriptor_url(), "secret-token")
        self.assertEqual(str(raised.exception), "STOP: MONITORING_PERMISSION_DENIED")
        self.assertTrue(secret_response.closed)

    def test_other_monitoring_http_failures_are_bounded_and_closed(self):
        for status, expected in ((400, "MONITORING_HTTP_400"),
                                 (401, "MONITORING_HTTP_401"),
                                 (404, "MONITORING_HTTP_404"),
                                 (429, "MONITORING_HTTP_429"),
                                 (500, "MONITORING_READ_FAILED")):
            with self.subTest(status=status):
                body = io.BytesIO(b"private-authorization-body")
                error = MOD.urllib.error.HTTPError("https://secret.invalid",
                                                   status, "Private", {}, body)
                with patch.object(MOD.urllib.request, "urlopen", side_effect=error):
                    with self.assertRaisesRegex(SystemExit, r"^STOP: " + expected + r"$"):
                        MOD.get_json(MOD.descriptor_url(), "secret-token")
                self.assertTrue(body.closed)

if __name__ == "__main__":
    unittest.main()
