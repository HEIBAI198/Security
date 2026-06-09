"""FastAPI application for the SupplyGuard KG security platform."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import FRONTEND_DIST_DIR, resolve_frontend_dir
from .routes.imports import router as imports_router
from .routes.security import router as security_router


class SPAStaticFiles(StaticFiles):
    """Serve index.html for client-side routes in the bundled React app."""

    async def get_response(self, path: str, scope: dict[str, Any]):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            method = scope.get("method", "GET")
            last_segment = path.rsplit("/", 1)[-1]
            is_asset_like = "." in last_segment
            if exc.status_code == 404 and method in {"GET", "HEAD"} and not is_asset_like:
                return await super().get_response("index.html", scope)
            raise


def create_app() -> FastAPI:
    frontend_dir, frontend_mode = resolve_frontend_dir()
    app = FastAPI(
        title="SupplyGuard KG Security Platform",
        version="1.0",
        description=(
            "LLM and security knowledge graph platform for supply chain attack "
            "detection, application security audit, and cyber risk analysis."
        ),
    )
    app.state.frontend_dir = frontend_dir
    app.state.frontend_mode = frontend_mode

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/ready", tags=["Ops"])
    async def ready() -> dict[str, Any]:
        return {
            "ready": True,
            "service": "SupplyGuard KG Security Platform",
            "version": "1.0",
            "frontend": str(frontend_dir) if frontend_dir else "",
            "frontend_mode": frontend_mode,
            "frontend_ready": frontend_dir is not None,
        }

    @app.get("/api/health", tags=["Ops"])
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "SupplyGuard KG Security Platform",
            "components": [
                "Code Audit",
                "SBOM Risk",
                "CI/CD Monitor",
                "Log Risk",
                "Multimodal Evidence Intake",
                "Security Knowledge Graph",
                "LLM Copilot",
                "Report Generator",
            ],
        }

    app.include_router(imports_router)
    app.include_router(security_router)

    if frontend_dir is not None:
        app.mount("/", SPAStaticFiles(directory=frontend_dir, html=True), name="frontend")
    else:

        @app.get("/", include_in_schema=False)
        async def frontend_not_built() -> JSONResponse:
            return JSONResponse(
                {
                    "error": "Frontend build artifacts are missing",
                    "expected": str(FRONTEND_DIST_DIR / "index.html"),
                    "hint": "Build the frontend with `npm install && npm run build` in the `frontend` directory.",
                },
                status_code=503,
            )

    return app


app = create_app()
