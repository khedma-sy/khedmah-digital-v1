#!/usr/bin/env python3
"""Regression tests: incomplete lab external-network evidence must fail closed.

No network access, gcloud credentials, or cloud mutation required.
Run: python3 -m unittest discover -s scripts/tests -p 'test_lab_external_paths_fail_closed.py'
"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts" / "inspect-recovery-lab-external-paths.py"
spec = importlib.util.spec_from_file_location("khedma_external_paths", SOURCE)
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class FailClosedExternalPaths(unittest.TestCase):
    def test_disabled_ncc_cannot_be_treated_as_empty(self):
        with patch.object(inspector, "pages", side_effect=inspector.Unavailable("HTTP_403_SERVICE_DISABLED")):
            with self.assertRaisesRegex(inspector.Unavailable, "LAB_NCC_UNVERIFIED_HTTP_403_SERVICE_DISABLED"):
                inspector.require_no_additional_network_paths("stub-token")

    def test_present_spoke_is_rejected_before_connector_read(self):
        with patch.object(inspector, "pages", return_value=[{"name": "some-spoke"}]):
            with self.assertRaisesRegex(inspector.Unavailable, "LAB_NCC_SPOKES_PRESENT"):
                inspector.require_no_additional_network_paths("stub-token")

    def test_disabled_vpc_connector_api_cannot_be_treated_as_empty(self):
        with patch.object(inspector, "pages", return_value=[]), patch.object(
            inspector, "connectors", side_effect=inspector.Unavailable("HTTP_403_SERVICE_DISABLED")
        ):
            with self.assertRaisesRegex(inspector.Unavailable, "LAB_VPC_CONNECTORS_UNVERIFIED_HTTP_403_SERVICE_DISABLED"):
                inspector.require_no_additional_network_paths("stub-token")

    def test_present_connector_is_rejected(self):
        with patch.object(inspector, "pages", return_value=[]), patch.object(inspector, "connectors", return_value=1):
            with self.assertRaisesRegex(inspector.Unavailable, "LAB_VPC_CONNECTORS_PRESENT"):
                inspector.require_no_additional_network_paths("stub-token")

    def test_app_engine_unknown_is_rejected(self):
        with patch.object(inspector, "pages", return_value=[]), patch.object(
            inspector, "connectors", return_value=0
        ), patch.object(inspector, "read_json", side_effect=inspector.Unavailable("HTTP_403_SERVICE_DISABLED")):
            with self.assertRaisesRegex(inspector.Unavailable, "LAB_APP_ENGINE_UNVERIFIED_HTTP_403_SERVICE_DISABLED"):
                inspector.require_no_additional_network_paths("stub-token")

    def test_app_engine_present_is_rejected(self):
        with patch.object(inspector, "pages", return_value=[]), patch.object(
            inspector, "connectors", return_value=0
        ), patch.object(inspector, "read_json", return_value={"id": inspector.PROJECT}):
            with self.assertRaisesRegex(inspector.Unavailable, "LAB_APP_ENGINE_PRESENT"):
                inspector.require_no_additional_network_paths("stub-token")

    def test_empty_fresh_network_reads_pass_only_narrow_inventory_gate(self):
        with patch.object(inspector, "pages", return_value=[]), patch.object(
            inspector, "connectors", return_value=0
        ), patch.object(inspector, "read_json", side_effect=inspector.Unavailable("HTTP_404")):
            self.assertTrue(inspector.require_no_additional_network_paths("stub-token"))
        # This helper's True is not proof that PostgreSQL sessions are fenced,
        # that all external writers are absent, or that Cloud SQL is safe to start.


if __name__ == "__main__":
    unittest.main()
