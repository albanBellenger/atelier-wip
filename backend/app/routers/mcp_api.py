"""REST MCP bridge for work orders (Slice 12)."""

import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps_mcp import McpAuth, require_mcp_api_key, require_mcp_editor
from app.exceptions import ApiError
from app.models import Project, TokenUsage, WorkOrderNote
from app.services.mcp_work_order_service import McpWorkOrderService
from app.services.work_order_service import VALID_STATUSES, WorkOrderService

router = APIRouter(prefix="/mcp/v1", tags=["mcp"])


class McpStatusPatch(BaseModel):
    status: str = Field(min_length=3, max_length=32)


class McpNoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=32000)


@router.get("/work-orders")
async def mcp_list_work_orders(
    project_id: UUID | None = Query(None),
    status: str | None = Query(None),
    assignee_id: UUID | None = Query(None),
    phase: str | None = Query(None),
    session: AsyncSession = Depends(get_db),
    auth: McpAuth = Depends(require_mcp_api_key),
):
    svc = McpWorkOrderService(session)
    items = await svc.list_for_studio(
        auth.studio_id,
        project_id=project_id,
        status=status,
        assignee_id=assignee_id,
        phase=phase,
    )
    return {"work_orders": items}


@router.get("/work-orders/{work_order_id}")
async def mcp_pull_work_order(
    work_order_id: UUID,
    session: AsyncSession = Depends(get_db),
    auth: McpAuth = Depends(require_mcp_api_key),
):
    return await McpWorkOrderService(session).pull_payload(
        auth.studio_id, work_order_id
    )


@router.patch("/work-orders/{work_order_id}")
async def mcp_patch_work_order(
    work_order_id: UUID,
    body: McpStatusPatch,
    session: AsyncSession = Depends(get_db),
    auth: McpAuth = Depends(require_mcp_editor),
):
    svc = McpWorkOrderService(session)
    wo = await svc._ensure_wo_in_studio(auth.studio_id, work_order_id)
    pr = await session.get(Project, wo.project_id)
    if pr is None:
        raise ApiError(
            status_code=404, code="NOT_FOUND", message="Project not found"
        )
    st = body.status.strip().lower()
    if st not in VALID_STATUSES:
        raise ApiError(
            status_code=400,
            code="BAD_REQUEST",
            message=f"Invalid status (allowed: {sorted(VALID_STATUSES)})",
        )
    prev_status = wo.status
    wo.status = st
    session.add(
        TokenUsage(
            studio_id=auth.studio_id,
            software_id=pr.software_id,
            project_id=pr.id,
            user_id=None,
            call_type="mcp",
            model="mcp_patch_work_order",
            input_tokens=0,
            output_tokens=0,
            estimated_cost_usd=None,
        )
    )
    await session.flush()
    await WorkOrderService(session)._maybe_dispatch_status_notifications(
        wo, pr.id, prev_status=prev_status, actor_id=None
    )
    return {"id": str(wo.id), "status": wo.status}


@router.post("/work-orders/{work_order_id}/notes")
async def mcp_post_note(
    work_order_id: UUID,
    body: McpNoteCreate,
    session: AsyncSession = Depends(get_db),
    auth: McpAuth = Depends(require_mcp_editor),
):
    svc = McpWorkOrderService(session)
    wo = await svc._ensure_wo_in_studio(auth.studio_id, work_order_id)
    pr = await session.get(Project, wo.project_id)
    if pr is None:
        raise ApiError(
            status_code=404, code="NOT_FOUND", message="Project not found"
        )
    note = WorkOrderNote(
        id=uuid.uuid4(),
        work_order_id=wo.id,
        author_id=None,
        source="mcp",
        content=body.content.strip(),
    )
    session.add(note)
    session.add(
        TokenUsage(
            studio_id=auth.studio_id,
            software_id=pr.software_id,
            project_id=pr.id,
            user_id=None,
            call_type="mcp",
            model="mcp_post_note",
            input_tokens=0,
            output_tokens=0,
            estimated_cost_usd=None,
        )
    )
    await session.flush()
    return {"id": str(note.id)}
