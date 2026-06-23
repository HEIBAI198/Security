import tempfile
import sys
import types
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from supplyguard import workspaces
from supplyguard.agent_backend import AgentInternalResults, AgentRunBundle


if "fastapi" not in sys.modules:
    fastapi_stub = types.ModuleType("fastapi")

    class APIRouter:
        def __init__(self, *args, **kwargs):
            pass

        def get(self, *args, **kwargs):
            return lambda func: func

        def post(self, *args, **kwargs):
            return lambda func: func

        def delete(self, *args, **kwargs):
            return lambda func: func

        def put(self, *args, **kwargs):
            return lambda func: func

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str | None = None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class Request:
        pass

    class Response:
        def __init__(self, content=None, media_type=None, headers=None):
            self.content = content
            self.media_type = media_type
            self.headers = headers or {}

    class UploadFile:
        pass

    def parameter(default=None, **kwargs):
        return default

    fastapi_stub.APIRouter = APIRouter
    fastapi_stub.File = parameter
    fastapi_stub.Form = parameter
    fastapi_stub.HTTPException = HTTPException
    fastapi_stub.Query = parameter
    fastapi_stub.Request = Request
    fastapi_stub.Response = Response
    fastapi_stub.UploadFile = UploadFile
    sys.modules["fastapi"] = fastapi_stub

from supplyguard.routes import security


class AgentWorkspaceWritebackTests(unittest.TestCase):
    def test_agent_results_preserve_existing_workspace_identity(self):
        workspace_id = "ws_agent_writeback_test"
        temp_root = tempfile.TemporaryDirectory()
        self.addCleanup(temp_root.cleanup)
        storage_dir = Path(temp_root.name)

        existing = deepcopy(security.SECURITY_WORKSPACE)
        existing["workspace"].update(
            {
                "name": "3CX X_TRADER replay",
                "repository": "cases/3cx-supply-chain/sample-repo",
                "workspaceId": workspace_id,
                "importId": "imp-3cx",
                "preset": "3cx",
            }
        )
        existing["import"] = {
            "importId": "imp-3cx",
            "projectName": "3CX X_TRADER replay",
            "sourceType": "local",
            "sourceRef": {"path": "cases/3cx-supply-chain/sample-repo"},
        }

        bundle = AgentRunBundle(
            payload={
                "runId": "agent-test",
                "status": "success",
                "steps": [],
                "summary": {
                    "stepCount": 0,
                    "success": 0,
                    "skipped": 0,
                    "failed": 0,
                    "evidenceGapCount": 0,
                    "riskScore": 0,
                    "riskLevel": "low",
                },
                "evidenceGaps": [],
                "nextActions": [],
                "narrative": {},
            },
            results=AgentInternalResults(),
        )

        with (
            patch.object(workspaces, "WORKSPACE_STORAGE_DIR", storage_dir),
            patch.object(workspaces, "LATEST_FILE", storage_dir / "latest.json"),
            patch.object(security, "LAST_CODE_AUDIT", None),
            patch.object(security, "LAST_DEPENDENCY_AUDIT", None),
            patch.object(security, "LAST_CICD_AUDIT", None),
            patch.object(security, "LAST_ARTIFACT_TRUST", None),
            patch.object(security, "LAST_LOG_AUDIT", None),
            patch.object(security, "latest_multimodal_payload", return_value=None),
        ):
            workspaces.save_workspace_snapshot(existing, workspace_id=workspace_id)

            result = security.apply_agent_results(bundle, workspace_id=workspace_id)

            workspace = result["workspace"]
            self.assertEqual(workspace["workspaceId"], workspace_id)
            self.assertEqual(workspace["workspace"]["name"], "3CX X_TRADER replay")
            self.assertEqual(workspace["workspace"]["importId"], "imp-3cx")
            self.assertEqual(workspace["workspace"]["preset"], "3cx")
            self.assertEqual(workspace["import"]["importId"], "imp-3cx")


if __name__ == "__main__":
    unittest.main()
