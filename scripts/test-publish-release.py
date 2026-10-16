import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("publisher", Path(__file__).with_name("publish-release.py"))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublicationGates(unittest.TestCase):
    def setUp(self):
        self.commit = "a" * 40
        self.workflow = {"id": 42, "head_sha": self.commit, "status": "completed",
                         "conclusion": "success", "path": ".github/workflows/ci.yml"}
        self.jobs = [{"name": name, "run_id": 42, "conclusion": "success", "steps": [
            {"name": "Run npm test", "conclusion": "success"},
            {"name": "Run npm run platform-smoke-test", "conclusion": "success"},
        ]} for name in sorted(publisher.PLATFORMS)]
        self.assets = {"source.zip": {"sha256": "a" * 64, "bytes": 10}}
        self.release = {"tag_name": "v2.24.0-r4", "draft": True, "prerelease": False, "assets": []}

    def test_successful_exact_three_platform_gate(self):
        publisher.validate_ci(self.workflow, self.jobs, self.commit)

    def test_wrong_commit_or_incomplete_workflow_is_rejected(self):
        for field, value in [("head_sha", "b" * 40), ("status", "in_progress"),
                             ("conclusion", "failure"), ("path", "other.yml")]:
            workflow = {**self.workflow, field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                publisher.validate_ci(workflow, self.jobs, self.commit)

    def test_missing_failed_or_foreign_platform_is_rejected(self):
        variants = [self.jobs[:-1], self.jobs + [self.jobs[0]]]
        for field, value in [("conclusion", "failure"), ("run_id", 43)]:
            jobs = copy.deepcopy(self.jobs)
            jobs[0][field] = value
            variants.append(jobs)
        for jobs in variants:
            with self.assertRaises(ValueError):
                publisher.validate_ci(self.workflow, jobs, self.commit)

    def test_macos_signing_smoke_cannot_be_skipped(self):
        jobs = copy.deepcopy(self.jobs)
        next(job for job in jobs if job["name"] == "test (macos-14)")["steps"][1]["conclusion"] = "skipped"
        with self.assertRaises(ValueError):
            publisher.validate_ci(self.workflow, jobs, self.commit)

    def test_existing_matching_assets_are_idempotent(self):
        self.release["assets"] = [{"name": "source.zip", "size": 10, "digest": "sha256:" + "a" * 64}]
        self.assertEqual(publisher.asset_plan(self.release, "v2.24.0-r4", self.assets), [])
        self.release["draft"] = False
        self.assertEqual(publisher.asset_plan(self.release, "v2.24.0-r4", self.assets), [])

    def test_conflicting_assets_are_never_clobbered(self):
        for item in [{"name": "other.zip"}, {"name": "source.zip", "size": 11, "digest": "sha256:" + "a" * 64}]:
            self.release["assets"] = [item]
            with self.assertRaises(ValueError):
                publisher.asset_plan(self.release, "v2.24.0-r4", self.assets)

    def test_incomplete_published_release_is_not_mutated(self):
        self.release["draft"] = False
        with self.assertRaises(ValueError):
            publisher.asset_plan(self.release, "v2.24.0-r4", self.assets)

    def test_tag_validation_precedes_any_git_or_network_call(self):
        with self.assertRaises(ValueError):
            publisher.package("v2.24.0-r4;other", self.commit, Path("unused"))


if __name__ == "__main__":
    unittest.main()
