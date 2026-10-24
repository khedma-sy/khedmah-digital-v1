import importlib.util
import pathlib
import unittest

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

if __name__ == "__main__":
    unittest.main()
