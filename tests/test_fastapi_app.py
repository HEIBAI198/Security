import tempfile
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from sysml_docgen.app import app
except (RuntimeError, ModuleNotFoundError):
    TestClient = None
    app = None
from sysml_docgen.store import ModelStore


@unittest.skipIf(TestClient is None, "FastAPI TestClient requires httpx")
class FastApiAppTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app.state.store = ModelStore(Path(self.temp_dir.name) / "store.sqlite3")
        self.client = TestClient(app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_health_exposes_fastapi_mms_metadata(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["framework"], "fastapi")
        self.assertIn(payload["storage"], {"sqlite", "mongodb"})
        self.assertIn("MMS", payload["components"])
        self.assertEqual(payload["capabilities"]["max_model_bytes"], 10 * 1024 * 1024)

    def test_mms_projects_route_is_compatible(self):
        response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()["projects"]), 1)

    def test_mdk_xmi_export_route_returns_xml(self):
        response = self.client.get("/api/projects/satellite-power/branches/main/export?format=xmi")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/xml", response.headers["content-type"])
        self.assertIn("<packagedElement", response.text)

    def test_docgen_pdf_route_returns_pdf(self):
        created = self.client.post(
            "/api/projects/satellite-power/branches/main/documents",
            json={"format": "pdf", "template": "# {{model:summary}}"},
        )
        self.assertEqual(created.status_code, 200)
        document_id = created.json()["document"]["id"]
        pdf = self.client.get(f"/api/projects/satellite-power/branches/main/documents/{document_id}?format=pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertIn("application/pdf", pdf.headers["content-type"])
        self.assertTrue(pdf.content.startswith(b"%PDF-"))

    def test_project_roles_block_reader_writes(self):
        response = self.client.post(
            "/api/projects/satellite-power/branches/main/elements",
            json={"id": "REQ-ROLE", "name": "权限需求", "type": "Requirement"},
            headers={"X-User": "reviewer", "X-Role": "author"},
        )
        self.assertEqual(response.status_code, 403)

    def test_project_roles_treat_unknown_user_as_reader(self):
        response = self.client.post(
            "/api/projects/satellite-power/branches/main/elements",
            json={"id": "REQ-GHOST", "name": "未知用户需求", "type": "Requirement"},
            headers={"X-User": "ghost", "X-Role": "author"},
        )
        self.assertEqual(response.status_code, 403)

    def test_document_theory_named_routes_are_registered(self):
        paths = {route.path for route in app.routes}
        self.assertIn("/api/mms/models", paths)
        self.assertIn("/api/mms/models/{model_name}", paths)
        self.assertIn("/api/mms/branches", paths)
        self.assertIn("/api/mdk/parse", paths)
        self.assertIn("/api/docgen/pdf", paths)


if __name__ == "__main__":
    unittest.main()
