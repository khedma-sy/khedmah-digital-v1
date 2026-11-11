"""Offline, fail-closed tests for regional Preview V2 writer-surface inventory."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "preview_region_writers", ROOT / "scripts/read-preview-v2-regional-writer-surfaces.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def row(name, completed=False):
    return {"metadata": {"name": name}, "status": (
        {"completionTime": "2026-10-16T20:24:21Z"} if completed else {}
    ), "spec": {"template": {"containers": [{"env": [
        {"name": "DATABASE_URL", "value": "NEVER_PRINT_SECRET"}
    ]}]}}}


class PreviewRegionalWriterTests(unittest.TestCase):
    def test_inventory_no_release_claim_and_no_secrets(self):
        output = io.StringIO()
        with patch.object(m, "gcloud_list", side_effect=[
            [row(m.BACKEND), row(m.FRONTEND), row("other-worker")],
            [row("migration-job")],
            [row("job-run-done", completed=True), row("job-run-active")],
        ]) as listed, contextlib.redirect_stdout(output):
            m.main(["--inspect"])
        report = json.loads(output.getvalue())
        self.assertEqual([c.args for c in listed.call_args_list],
                         [("services",), ("jobs",), ("executions", "migration-job")])
        self.assertEqual(report["other_service_names"], ["other-worker"])
        self.assertEqual(report["job_execution_summaries"][0]["nonterminal_or_unknown_count"], 1)
        self.assertEqual(report["job_execution_summaries"][0]["completion_timestamp_count"], 1)
        for key in ("writer_quiescence_verified", "release_authorized",
                    "other_regions_inventoried", "external_writers_inventoried",
                    "database_mutation", "cloud_resource_mutation"):
            self.assertFalse(report[key])
        self.assertNotIn("DATABASE_URL", output.getvalue())
        self.assertNotIn("NEVER_PRINT_SECRET", output.getvalue())

    def test_cloud_invocation_read_only_fixed_project_and_no_prompt(self):
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
            returncode=0, stdout=b"[]"
        )) as run:
            self.assertEqual(m.gcloud_list("services"), [])
        args = run.call_args.args[0]
        self.assertEqual(args[:4], ["gcloud", "run", "services", "list"])
        self.assertIn("--project=" + m.PROJECT, args)
        self.assertIn("--region=" + m.REGION, args)
        self.assertIn("--format=json", args)
        self.assertNotIn("execute", args)
        self.assertNotIn("update", args)
        self.assertNotIn("deploy", args)
        self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_DISABLE_PROMPTS"], "1")
        self.assertEqual(run.call_args.kwargs["stdin"], m.subprocess.DEVNULL)

    def test_wrong_cli_rejected_without_cloud_calls(self):
        for value in ([], ["--execute"], ["--inspect", "--apply"]):
            with patch.object(m, "gcloud_list") as called:
                with self.assertRaisesRegex(SystemExit, "READ_ONLY_INSPECT_ONLY"):
                    m.main(value)
                called.assert_not_called()

    def test_bad_scope_rejected_without_cloud_calls(self):
        with patch.object(m.subprocess, "run") as called:
            for kind, job in (("services", "x"), ("unknown", None),
                              ("executions", None), ("executions", "../bad")):
                with self.assertRaises(SystemExit):
                    m.gcloud_list(kind, job)
            called.assert_not_called()

    def test_missing_known_service_stops(self):
        with patch.object(m, "gcloud_list", return_value=[row(m.BACKEND)]):
            with self.assertRaisesRegex(SystemExit, "KNOWN_SERVICE_NOT_ENUMERATED"):
                m.inspect()

    def test_duplicate_and_invalid_resource_names_stop(self):
        for data, stop_code in [
            ([row("job"), row("job")], "DUPLICATE_RESOURCE_NAME"),
            ([row("abc/def")], "RESOURCE_NAME_INVALID"),
            ([{"metadata": {"name": "UPPER"}}], "RESOURCE_NAME_INVALID"),
        ]:
            with self.subTest(data=data):
                with self.assertRaisesRegex(SystemExit, stop_code):
                    m.list_names(data)

    def test_bad_cloud_response_or_limit_fail_closed(self):
        for result, code in [
            (SimpleNamespace(returncode=1, stdout=b"[]"), "CLOUD_READ_FAILED"),
            (SimpleNamespace(returncode=0, stdout=b"{}"), "INVENTORY_INCOMPLETE_OR_INVALID"),
            (SimpleNamespace(returncode=0, stdout=b"not-json"), "CLOUD_RESPONSE_INVALID"),
            (SimpleNamespace(returncode=0, stdout=json.dumps(
                [{}] * m.MAX_LIST).encode()), "INVENTORY_INCOMPLETE_OR_INVALID"),
        ]:
            with self.subTest(code=code):
                with patch.object(m.subprocess, "run", return_value=result):
                    with self.assertRaisesRegex(SystemExit, code):
                        m.gcloud_list("jobs")

    def test_v2_fully_qualified_resource_names(self):
        prefix = "projects/" + m.PROJECT + "/locations/" + m.REGION + "/"
        for kind, names in (
            ("services", [prefix + "services/" + m.BACKEND]),
            ("jobs", [prefix + "jobs/migration-job"]),
            ("executions", [prefix + "jobs/migration-job/executions/run-abc"]),
        ):
            with self.subTest(kind=kind):
                self.assertEqual(m.list_names([{"name": n} for n in names], kind),
                                 [names[0].split("/")[-1]])

    def test_v2_scope_conflicts_and_duplicate_names_fail_closed(self):
        prefix = "projects/" + m.PROJECT + "/locations/" + m.REGION + "/"
        invalid = [
            ({"name": "services/unsafe"}, "services"),
            ({"name": prefix.replace(m.REGION, "us-central1") + "services/x"}, "services"),
            ({"name": prefix + "jobs/job/executions/../bad"}, "executions"),
            ({"metadata": {"name": "first"}, "name": prefix + "jobs/second"}, "jobs"),
        ]
        for record, kind in invalid:
            with self.subTest(record=record):
                with self.assertRaises(SystemExit):
                    m.list_names([record], kind)
        with self.assertRaisesRegex(SystemExit, "DUPLICATE_RESOURCE_NAME"):
            m.list_names([row("same"), {"name": prefix + "jobs/same"}], "jobs")

    def test_v2_cross_job_execution_is_rejected(self):
        prefix = "projects/" + m.PROJECT + "/locations/" + m.REGION + "/"
        good = {"name": prefix + "jobs/expected-job/executions/run-1"}
        wrong = {"name": prefix + "jobs/other-job/executions/run-2"}
        self.assertEqual(
            m.list_names([good], "executions", expected_job="expected-job"),
            ["run-1"],
        )
        with self.assertRaisesRegex(SystemExit, "EXECUTION_PARENT_MISMATCH"):
            m.list_names([wrong], "executions", expected_job="expected-job")
        with self.assertRaisesRegex(SystemExit, "COMMAND_SCOPE_REJECTED"):
            m.list_names([row("test")], "jobs", expected_job="expected-job")

    def test_inventory_refuses_cross_job_v2_execution(self):
        prefix = "projects/" + m.PROJECT + "/locations/" + m.REGION + "/"
        with patch.object(m, "gcloud_list", side_effect=[
            [row(m.BACKEND), row(m.FRONTEND)],
            [row("expected-job")],
            [{"name": prefix + "jobs/wrong-job/executions/run-3"}],
        ]), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(SystemExit, "EXECUTION_PARENT_MISMATCH"):
                m.inspect()

    def test_v1_and_v2_completion_timestamps_are_counted_not_certified(self):
        time = "2026-11-11T22:49:14.413Z"
        self.assertTrue(m.completion_timestamp_present({"status": {"completionTime": time}}))
        self.assertTrue(m.completion_timestamp_present({"completionTime": time}))
        self.assertTrue(m.completion_timestamp_present({
            "status": {"completionTime": time}, "completionTime": time
        }))
        self.assertFalse(m.completion_timestamp_present({"status": {}}))
        self.assertFalse(m.completion_timestamp_present({"conditions": []}))

    def test_bad_or_conflicting_completion_timestamps_fail_closed(self):
        invalid_rows = (
            {"completionTime": ""},
            {"completionTime": "not-a-date"},
            {"completionTime": "2026-11-11T22:49:14"},
            {"completionTime": 12345},
            {"status": {"completionTime": "not-a-date"}},
            {"status": {"completionTime": "2026-11-11T22:49:14Z"},
             "completionTime": "2026-11-12T22:49:14Z"},
        )
        for row_data in invalid_rows:
            with self.subTest(row=row_data):
                with self.assertRaisesRegex(SystemExit, "EXECUTION_COMPLETION_TIME"):
                    m.completion_timestamp_present(row_data)

    def test_v2_inventory_completed_does_not_claim_success(self):
        prefix = "projects/" + m.PROJECT + "/locations/" + m.REGION + "/"
        rows = [
            {"name": prefix + "jobs/job-1/executions/ex-1",
             "completionTime": "2026-11-11T22:49:14.413Z",
             "conditions": [{"type": "Completed", "state": "CONDITION_FAILED"}]},
            {"name": prefix + "jobs/job-1/executions/ex-2"},
        ]
        with patch.object(m, "gcloud_list", side_effect=[
            [row(m.BACKEND), row(m.FRONTEND)],
            [row("job-1")],
            rows,
        ]), contextlib.redirect_stdout(io.StringIO()) as output:
            m.main(["--inspect"])
        summary = json.loads(output.getvalue())
        execution_summary = summary["job_execution_summaries"][0]
        self.assertEqual(execution_summary["completion_timestamp_count"], 1)
        self.assertEqual(execution_summary["nonterminal_or_unknown_count"], 1)
        self.assertTrue(execution_summary["success_not_inferred_from_completion"])
        self.assertFalse(summary["writer_quiescence_verified"])
        self.assertFalse(summary["release_authorized"])

    def test_only_expected_job_checked(self):
        with patch.object(m.subprocess, "run", return_value=SimpleNamespace(
            returncode=0, stdout=b"[]"
        )) as run:
            m.gcloud_list("executions", "migration-job")
        self.assertEqual(run.call_args.args[0][0:5],
                         ["gcloud", "run", "jobs", "executions", "list"])
        self.assertIn("--job=migration-job", run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
