import tempfile
import textwrap
import unittest
from pathlib import Path

from supplyguard.dependency_audit import (
    DependencyAuditRequest,
    parse_cyclonedx_components,
    parse_osv_results,
    run_dependency_audit,
)


class RubyGemsDependencyAuditTests(unittest.TestCase):
    def test_scans_gemfile_lock_and_emits_pkg_gem_components(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Gemfile").write_text(
                textwrap.dedent(
                    """
                    source "https://rubygems.org"

                    gem "rails", "~> 7.1.0"
                    gem "corp-payments", git: "https://github.com/acme/corp-payments.git"

                    group :development do
                      gem "rspec", "~> 3.13"
                    end
                    """
                ).strip(),
                encoding="utf-8",
            )
            (root / "Gemfile.lock").write_text(
                textwrap.dedent(
                    """
                    GEM
                      remote: https://rubygems.org/
                      specs:
                        actionpack (7.1.3)
                        rack (2.2.6)
                        rails (7.1.3)
                          actionpack (= 7.1.3)
                          rack (>= 2.2.4)

                    GIT
                      remote: https://github.com/acme/corp-payments.git
                      revision: 1111111111111111111111111111111111111111
                      specs:
                        corp-payments (0.1.0)

                    DEPENDENCIES
                      rails (~> 7.1.0)
                      rack
                      corp-payments!

                    BUNDLED WITH
                       2.5.6
                    """
                ).strip(),
                encoding="utf-8",
            )
            (root / "app.rb").write_text(
                'require "rails"\nRails.application.routes.draw do\n  get "/health", to: "health#show"\nend\n',
                encoding="utf-8",
            )

            result = run_dependency_audit(
                DependencyAuditRequest(
                    targetPath=str(root),
                    allowExternal=True,
                    includeDev=False,
                    includeOsv=False,
                )
            )

            by_name = {dependency.name: dependency for dependency in result.dependencies}
            self.assertIn("rails", by_name)
            self.assertIn("rack", by_name)
            self.assertIn("corp-payments", by_name)
            self.assertNotIn("rspec", by_name)

            self.assertEqual(by_name["rails"].ecosystem, "rubygems")
            self.assertEqual(by_name["rails"].version, "7.1.3")
            self.assertEqual(by_name["rails"].dependency_type, "direct")
            self.assertTrue(by_name["rails"].purl.startswith("pkg:gem/rails@7.1.3"))
            self.assertTrue(by_name["rails"].reachability["imported"])

            self.assertIn("URL/VCS source", by_name["corp-payments"].signals)
            self.assertIn("possible dependency confusion", by_name["corp-payments"].signals)
            self.assertGreaterEqual(by_name["corp-payments"].risk, 55)

            self.assertEqual(result.summary["ecosystems"]["rubygems"], 4)
            self.assertIn("Gemfile", result.summary["manifests"])
            self.assertIn("Gemfile.lock", result.summary["lockfiles"])
            self.assertTrue(
                any(component.get("purl", "").startswith("pkg:gem/rails@7.1.3") for component in result.sbom["components"])
            )

    def test_imports_gem_components_from_cyclonedx_and_osv(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            components = parse_cyclonedx_components(
                {
                    "components": [
                        {
                            "type": "library",
                            "name": "rack",
                            "version": "2.2.6",
                            "purl": "pkg:gem/rack@2.2.6",
                        }
                    ]
                },
                root,
                source_file="bom.json",
                source="test",
            )
            self.assertEqual(len(components), 1)
            self.assertEqual(components[0].ecosystem, "rubygems")
            self.assertEqual(components[0].name, "rack")

            osv_records = parse_osv_results(
                {
                    "results": [
                        {
                            "packages": [
                                {
                                    "package": {"ecosystem": "RubyGems", "name": "rack", "version": "2.2.6"},
                                    "vulnerabilities": [{"id": "GHSA-rack", "summary": "Rack advisory"}],
                                }
                            ]
                        }
                    ]
                },
                root,
                source_file="Gemfile.lock",
            )
            self.assertEqual(len(osv_records), 1)
            self.assertEqual(osv_records[0].ecosystem, "rubygems")
            self.assertEqual(osv_records[0].vulnerabilities[0]["id"], "GHSA-rack")


if __name__ == "__main__":
    unittest.main()
