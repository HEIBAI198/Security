"""Project import API routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field

from ..project_imports import (
    ImportErrorDetail,
    create_git_import,
    create_files_import,
    create_local_import,
    create_upload_import,
    load_import,
    load_latest_import,
    start_scan,
)


router = APIRouter(tags=["Project Imports"])


class GitImportRequest(BaseModel):
    url: str = Field(min_length=1, max_length=1000)
    ref: str | None = Field(default=None, max_length=200)
    commit: str | None = Field(default=None, max_length=200)
    project_name: str | None = Field(default=None, alias="projectName", max_length=200)

    model_config = ConfigDict(populate_by_name=True)


class LocalImportRequest(BaseModel):
    path: str = Field(min_length=1, max_length=2000)
    project_name: str | None = Field(default=None, alias="projectName", max_length=200)

    model_config = ConfigDict(populate_by_name=True)


class ScanRequest(BaseModel):
    import_id: str | None = Field(default=None, alias="importId")
    scope: str = "."

    model_config = ConfigDict(populate_by_name=True)


def _http_error(exc: ImportErrorDetail) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/api/imports/upload", status_code=status.HTTP_201_CREATED)
async def upload_project_import(
    request: Request,
    x_project_filename: str | None = Header(default=None, alias="X-Project-Filename"),
) -> dict[str, Any]:
    filename = x_project_filename or "project.zip"
    try:
        return create_upload_import(filename, await request.body())
    except ImportErrorDetail as exc:
        raise _http_error(exc) from exc


@router.post("/api/imports/files", status_code=status.HTTP_201_CREATED)
async def upload_project_files_import(
    files: list[UploadFile] = File(...),
    project_name: str | None = Form(default=None, alias="projectName"),
) -> dict[str, Any]:
    try:
        uploaded_files = [
            (file.filename or "uploaded-file", await file.read())
            for file in files
        ]
        return create_files_import(uploaded_files, project_name=project_name)
    except ImportErrorDetail as exc:
        raise _http_error(exc) from exc


@router.post("/api/imports/git", status_code=status.HTTP_201_CREATED)
async def git_project_import(payload: GitImportRequest) -> dict[str, Any]:
    try:
        return create_git_import(
            payload.url,
            ref=payload.ref,
            commit=payload.commit,
            project_name=payload.project_name,
        )
    except ImportErrorDetail as exc:
        raise _http_error(exc) from exc


@router.post("/api/imports/local", status_code=status.HTTP_201_CREATED)
async def local_project_import(payload: LocalImportRequest) -> dict[str, Any]:
    try:
        return create_local_import(payload.path, project_name=payload.project_name)
    except ImportErrorDetail as exc:
        raise _http_error(exc) from exc


@router.get("/api/imports/{import_id}/status")
async def project_import_status(import_id: str) -> dict[str, Any]:
    try:
        metadata = load_import(import_id)
    except ImportErrorDetail as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {
        "importId": metadata["importId"],
        "status": metadata["status"],
        "projectName": metadata["projectName"],
        "createdAt": metadata["createdAt"],
        "updatedAt": metadata["updatedAt"],
    }


@router.get("/api/imports/{import_id}/summary")
async def project_import_summary(import_id: str) -> dict[str, Any]:
    try:
        return load_import(import_id)
    except ImportErrorDetail as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/api/imports/latest")
async def latest_project_import() -> dict[str, Any]:
    metadata = load_latest_import()
    if metadata is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No project import is available.")
    return metadata


@router.post("/api/imports/{import_id}/scan", status_code=status.HTTP_202_ACCEPTED)
async def scan_project_import(import_id: str, payload: ScanRequest | None = None) -> dict[str, Any]:
    try:
        return start_scan(import_id, scope=payload.scope if payload else ".")
    except ImportErrorDetail as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/api/scans", status_code=status.HTTP_202_ACCEPTED)
async def create_scan(payload: ScanRequest) -> dict[str, Any]:
    if not payload.import_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="importId is required.")
    try:
        return start_scan(payload.import_id, scope=payload.scope)
    except ImportErrorDetail as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
