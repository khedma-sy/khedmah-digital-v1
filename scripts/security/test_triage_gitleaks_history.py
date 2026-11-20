"""Fail-closed classifier regressions with synthetic, dynamically assembled fixtures."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).with_name("triage-gitleaks-history.py")
spec = importlib.util.spec_from_file_location("gitleaks_triage", MODULE_PATH)
assert spec and spec.loader
triage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(triage)


class HistoryClassifierTests(unittest.TestCase):
    def test_known_structural_categories_are_identified(self):
        self.assertEqual(
            triage.classify("apps/frontend/lib/brand-hero-image.ts", "  '" + ("a1B2/" * 22) + "',"),
            "candidate_static_webp_data",
        )
        sample_resource_id = "-".join(("123e4567", "e89b", "12d3", "a456", "426614174000"))
        self.assertEqual(
            triage.classify("scripts/stage-preview-v2-maps-config.py",
                            "KEY_UID = " + chr(34) + sample_resource_id + chr(34)),
            "candidate_google_resource_uuid",
        )
        synthetic_metric = "_".join(("fulfillment", "cancellations", "24h"))
        self.assertEqual(
            triage.classify("apps/backend/src/kora-admin/kora-admin.service.test.ts",
                            "metric_key = '" + synthetic_metric + "'"),
            "candidate_test_metric_name",
        )
        synthetic_sha = ("0123456789abcdef" * 2) + "01234567"
        self.assertEqual(
            triage.classify("docs/project-control/CURRENT-STATE.md",
                            "See commit " + synthetic_sha + "."),
            "candidate_git_commit_reference",
        )

    def test_only_specific_historical_synthetic_fixtures_are_recognized(self):
        path = "scripts/security/test_triage_gitleaks_history.py"
        sample = "-".join(("123e4567", "e89b", "12d3", "a456", "426614174000"))
        self.assertEqual(
            triage.classify(path, "KEY_UID = " + chr(34) + sample + chr(34)),
            "candidate_synthetic_test_fixture",
        )
        self.assertEqual(
            triage.classify(path, "API_" + "TOKEN = '" + "nonpublic-" + "replace-me'"),
            "candidate_synthetic_test_fixture",
        )
        self.assertTrue(triage.classify(path, "API_" + "TOKEN = 'unknown'").startswith("unresolved_"))

    def test_unknown_values_are_never_automatically_accepted(self):
        cases = [
            ("docs/project-control/CURRENT-STATE.md",
             "API_" + "TOKEN = '" + "nonpublic-" + "replace-me'"),
            ("apps/backend/src/payment.ts",
             "secret = '" + "an-unknown-" + "high-entropy-" + "token'"),
            ("scripts/stage-preview-v2-maps-config.py",
             "KEY_UID = '" + "this-is-not-" + "a-uuid'"),
            ("apps/frontend/lib/brand-hero-image.ts",
             "apiKey: '" + "not-an-" + "image'"),
            ("docs/project-control/CURRENT-STATE.md", None),
        ]
        for path, line in cases:
            with self.subTest(path=path):
                self.assertTrue(triage.classify(path, line).startswith("unresolved_"))


if __name__ == "__main__":
    unittest.main()
