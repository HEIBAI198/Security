"""Conversation history API routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from ..conversations import (
    ConversationError,
    create_conversation,
    delete_conversation,
    list_conversations,
    load_conversation,
    update_conversation,
)


router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


class ConversationCreateRequest(BaseModel):
    workspace_id: str = Field(alias="workspaceId", min_length=1, max_length=120)
    import_id: str | None = Field(default=None, alias="importId", max_length=120)
    title: str | None = Field(default=None, max_length=120)

    model_config = ConfigDict(populate_by_name=True)


class ConversationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=120)


def _not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("")
@router.get("/")
async def conversations_list() -> dict[str, Any]:
    return {"conversations": list_conversations()}


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def conversations_create(payload: ConversationCreateRequest) -> dict[str, Any]:
    try:
        return create_conversation(
            workspace_id=payload.workspace_id,
            import_id=payload.import_id,
            title=payload.title,
        )
    except (ConversationError, FileNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{conversation_id}")
@router.get("/{conversation_id}/")
async def conversations_get(conversation_id: str) -> dict[str, Any]:
    try:
        return load_conversation(conversation_id)
    except ConversationError as exc:
        raise _not_found(exc) from exc


@router.patch("/{conversation_id}")
@router.patch("/{conversation_id}/")
async def conversations_update(conversation_id: str, payload: ConversationUpdateRequest) -> dict[str, Any]:
    try:
        return update_conversation(conversation_id, title=payload.title)
    except ConversationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{conversation_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def conversations_delete(conversation_id: str) -> None:
    try:
        delete_conversation(conversation_id)
    except ConversationError as exc:
        raise _not_found(exc) from exc
