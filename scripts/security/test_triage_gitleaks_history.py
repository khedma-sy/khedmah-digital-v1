"""Regressions for conservative historical secret-finding classification."""
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
    def test_known_structural_false_positive_categories(self):
        self.assertEqual(
            triage.classify("apps/frontend/lib/brand-hero-image.ts", "  '" + ("a1B2/" * 22) + "',"),
            "candidate_static_webp_data",
        )
        self.assertEqual(
            triage.classify("scripts/stage-preview-v2-maps-config.py",
                            'KEY_UID = "123e4567-e89b-12d3-a456-426614174000"'),
            "candidate_google_resource_uuid",
        )
        self.assertEqual(
            triage.classify("apps/backend/src/kora-admin/kora-admin.service.test.ts",
                            "metric_key = 'fulfillment_cancellations_24h'"),
            "candidate_test_metric_name",
        )
        self.assertEqual(
            triage.classify("docs/project-control/CURRENT-STATE.md",
                            "See commit 0123456789abcdef0123456789abcdef01234567."),
            "candidate_git_commit_reference",
        )

    def test_unknown_or_credentials_never_automatically_whitelisted(self):
        cases = [
            ("docs/project-control/CURRENT-STATE.md", "API_TOKEN = 'nonpublic-replace-me'"),
            ("apps/backend/src/payment.ts", "secret = 'an-unknown-high-entropy-token'"),
            ("scripts/stage-preview-v2-maps-config.py", "KEY_UID = 'this-is-not-a-uuid'"),
            ("apps/frontend/lib/brand-hero-image.ts", "apiKey: 'not-an-image'"),
            ("docs/project-control/CURRENT-STATE.md", None),
        ]
        for path, line in cases:
            with self.subTest(path=path):
                self.assertTrue(triage.classify(path, line).startswith("unresolved_"))


if __name__ == "__main__":
    unittest.main()
