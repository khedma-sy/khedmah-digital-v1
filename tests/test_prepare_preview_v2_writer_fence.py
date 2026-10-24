"""Offline tests for the Preview V2 writer-fence design."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "writer_fence_plan", ROOT / "scripts/prepare-preview-v2-writer-fence.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class WriterFencePlanTests(unittest.TestCase):
    def test_plan_is_offline_and_non_mutating(self):
        p = m.plan()
        self.assertEqual(p["stage"], "PREVIEW_V2_WRITER_FENCE_DESIGN_PREPARED")
        self.assertFalse(p["execution_enabled"])
        self.assertFalse(p["cloud_access_performed"])
        self.assertFalse(p["cloud_resource_mutation"])
        self.assertFalse(p["database_access_performed"])
        self.assertFalse(p["database_mutation"])
        self.assertFalse(p["schema_mutation"])
        self.assertFalse(p["traffic_mutation"])
        self.assertFalse(p["scaling_mutation"])
        self.assertFalse(p["writer_quiescence_verified"])

    def test_plan_requires_unreachable_old_application_revisions_before_db_zero_counts(self):
        seq = m.plan()["future_reviewed_mutation_sequence"]
        retire = next(i for i, s in enumerate(seq) if "delete/retire every older application revision" in s)
        inventory = next(i for i, s in enumerate(seq) if "require only the maintenance revision reachable" in s)
        dbzero = next(i for i, s in enumerate(seq) if "require zero runtime sessions" in s)
        self.assertLess(retire, inventory)
        self.assertLess(inventory, dbzero)

    def test_maintenance_revision_has_no_database_secrets(self):
        maint = m.plan()["maintenance_revision"]
        self.assertTrue(maint["override_entrypoint_required"])
        self.assertTrue(maint["must_not_receive_database_secret"])
        self.assertTrue(maint["must_not_receive_migration_secret"])

    def test_images_are_immutable_digest_bound(self):
        self.assertEqual(
            m.SERVING_IMAGE_DIGEST,
            "sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17")
        self.assertIn("@sha256:", m.CANDIDATE_IMAGE)

    def test_fail_closed_contract_covers_tags_drift_sessions_and_unknown_commit(self):
        blockers = " ".join(m.plan()["fail_closed_on"])
        for required in ("generation drift", "tagged revision", "runtime", "unknown migration commit"):
            self.assertIn(required, blockers)

if __name__ == "__main__":
    unittest.main()
