import unittest

from supplyguard.gnn_features import (
    FEATURE_CONTRACT,
    FEATURE_NAMES,
    dependency_payload_feature_values,
    risk_signals,
    training_record_feature_values,
)


class GnnFeatureContractTests(unittest.TestCase):
    def test_training_and_runtime_use_identical_feature_contract(self):
        training = training_record_feature_values(
            {
                "ecosystem": "npm",
                "package": "example-package",
                "version": "1.0.0",
                "aliases": ["MAL-1"],
                "evidence_sources": ["osv"],
                "text": '["postinstall token"]',
            }
        )
        runtime = dependency_payload_feature_values(
            {
                "ecosystem": "npm",
                "name": "example-package",
                "version": "1.0.0",
                "signals": ["postinstall token"],
                "vulnerabilities": [{"source": "osv", "aliases": ["MAL-1"]}],
            }
        )

        self.assertEqual(FEATURE_CONTRACT, "runtime_package_features_v3")
        self.assertEqual(set(training), set(runtime))
        for name in FEATURE_NAMES:
            self.assertEqual(training[name], runtime[name])

    def test_v3_contract_keeps_validated_base_features(self):
        self.assertEqual(FEATURE_CONTRACT, "runtime_package_features_v3")
        for name in (
            "ecosystem_npm",
            "ecosystem_pypi",
            "name_length",
            "name_separator_count",
            "has_scope",
            "has_digits",
            "risk_keyword_count",
        ):
            self.assertIn(name, FEATURE_NAMES)

    def test_v3_contract_excludes_metadata_presence_source_proxies(self):
        # OpenSSF positives mostly lack registry metadata, so metadata-presence
        # features would act as label-source proxies in this dataset.
        for name in (
            "maintainer_count",
            "dependency_count",
            "has_repository",
            "has_homepage",
            "has_license",
            "has_install_script",
            "graph_degree",
        ):
            self.assertNotIn(name, FEATURE_NAMES)

    def test_v3_features_are_computed_from_record_and_payload_fields(self):
        training = training_record_feature_values(
            {
                "ecosystem": "npm",
                "package": "example-package",
                "version": "1.0.0",
                "maintainers": [{"name": "a"}, {"name": "b"}],
                "dependencies": [{"name": "left-pad", "ecosystem": "npm"}],
                "repository": "https://github.com/example/example-package",
                "homepage": "https://example.com",
                "license": "MIT",
                "install_scripts": {"postinstall": "node install.js"},
                "published": "2026-01-01T00:00:00Z",
            }
        )
        runtime = dependency_payload_feature_values(
            {
                "ecosystem": "npm",
                "name": "example-package",
                "version": "1.0.0",
                "maintainers": [{"name": "a"}, {"name": "b"}],
                "dependency_names": ["left-pad"],
                "repository": "https://github.com/example/example-package",
                "homepage": "https://example.com",
                "license": "MIT",
                "install_scripts": {"postinstall": "node install.js"},
            }
        )
        self.assertEqual(training["maintainer_count"], 2.0)
        self.assertEqual(training["dependency_count"], 1.0)
        self.assertEqual(training["has_repository"], 1.0)
        self.assertEqual(training["has_homepage"], 1.0)
        self.assertEqual(training["has_license"], 1.0)
        self.assertEqual(training["has_install_script"], 1.0)
        self.assertEqual(training, runtime)

    def test_v3_features_default_to_neutral_when_online_fields_are_missing(self):
        values = dependency_payload_feature_values(
            {
                "ecosystem": "npm",
                "name": "example-package",
                "version": "1.0.0",
                "signals": [],
            }
        )
        self.assertEqual(values["maintainer_count"], 0.0)
        self.assertEqual(values["dependency_count"], 0.0)
        self.assertEqual(values["has_repository"], 0.0)
        self.assertEqual(values["has_homepage"], 0.0)
        self.assertEqual(values["has_license"], 0.0)
        self.assertEqual(values["has_install_script"], 0.0)

    def test_label_and_source_proxies_are_excluded(self):
        self.assertNotIn("evidence_source_count", FEATURE_NAMES)
        self.assertNotIn("evidence_text_length", FEATURE_NAMES)
        self.assertNotIn("alias_count", FEATURE_NAMES)
        self.assertNotIn("has_version", FEATURE_NAMES)
        self.assertNotIn("version_count", FEATURE_NAMES)
        self.assertEqual(risk_signals("malicious malware package"), [])


if __name__ == "__main__":
    unittest.main()
