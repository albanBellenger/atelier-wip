"""Work orders under a project."""

from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, get_project_access, require_project_member
from app.exceptions import ApiError
from app.schemas.work_order import (
    GenerateWorkOrdersBody,
    WorkOrderCreate,
    WorkOrderDetailResponse,
    WorkOrderNoteCreate,
    WorkOrderNoteResponse,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from app.services.work_order_service import WorkOrderService

router = APIRouter(prefix="/projects/{project_id}/work-orders", tags=["work-orders"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("", response_model=list[WorkOrderResponse])
async def list_work_orders(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
    status: str | None = Query(None),
    assignee_id: UUID | None = Query(None),
    phase: str | None = Query(None),
    is_stale: bool | None = Query(None),
    section_id: UUID | None = Query(None),
) -> list[WorkOrderResponse]:
    _ensure_project(pa, project_id)
    return await WorkOrderService(session).list_work_orders(
        project_id,
        status=status,
        assignee_id=assignee_id,
        phase=phase,
        is_stale=is_stale,
        section_id=section_id,
    )


@router.post("", response_model=WorkOrderResponse)
async def create_work_order(
    project_id: UUID,
    body: WorkOrderCreate,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> WorkOrderResponse:
    _ensure_project(pa, project_id)
    return await WorkOrderService(session).create(
        project_id,
        body,
        created_by=pa.studio_access.user.id,
    )


@router.post(
    "/generate", response_model=list[WorkOrderResponse], status_code=201
)
async def generate_work_orders(
    project_id: UUID,
    body: GenerateWorkOrdersBody,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> list[WorkOrderResponse]:
    _ensure_project(pa, project_id)
    return await WorkOrderService(session).generate_work_orders(
        project_id,
        body,
        user_id=pa.studio_access.user.id,
    )


@router.post(
    "/{work_order_id}/dependencies/{prerequisite_id}",
    status_code=201,
)
async def add_work_order_dependency(
    project_id: UUID,
    work_order_id: UUID,
    prerequisite_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> Response:
    """Prerequisite must complete before dependent (edge: prerequisite → dependent)."""
    _ensure_project(pa, project_id)
    await WorkOrderService(session).add_work_order_dependency(
        project_id,
        dependent_id=work_order_id,
        prerequisite_id=prerequisite_id,
    )
    return Response(status_code=201)


@router.delete(
    "/{work_order_id}/dependencies/{prerequisite_id}",
    status_code=204,
)
async def remove_work_order_dependency(
    project_id: UUID,
    work_order_id: UUID,
    prerequisite_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> Response:
    _ensure_project(pa, project_id)
    await WorkOrderService(session).remove_work_order_dependency(
        project_id,
        dependent_id=work_order_id,
        prerequisite_id=prerequisite_id,
    )
    return Response(status_code=204)


@router.get("/{work_order_id}", response_model=WorkOrderDetailResponse)
async def get_work_order(
    project_id: UUID,
    work_order_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> WorkOrderDetailResponse:
    _ensure_project(pa, project_id)
    out = await WorkOrderService(session).get_work_order(
        project_id, work_order_id, detail=True
    )
    return cast(WorkOrderDetailResponse, out)


@router.put("/{work_order_id}", response_model=WorkOrderResponse)
async def update_work_order(
    project_id: UUID,
    work_order_id: UUID,
    body: WorkOrderUpdate,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> WorkOrderResponse:
    _ensure_project(pa, project_id)
    return await WorkOrderService(session).update(
        project_id, work_order_id, body
    )


@router.delete("/{work_order_id}", status_code=204)
async def delete_work_order(
    project_id: UUID,
    work_order_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> Response:
    _ensure_project(pa, project_id)
    await WorkOrderService(session).delete(project_id, work_order_id)
    return Response(status_code=204)


@router.post("/{work_order_id}/dismiss-stale", response_model=WorkOrderResponse)
async def dismiss_stale(
    project_id: UUID,
    work_order_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> WorkOrderResponse:
    _ensure_project(pa, project_id)
    return await WorkOrderService(session).dismiss_stale(
        project_id,
        work_order_id,
        user_id=pa.studio_access.user.id,
    )


@router.post("/{work_order_id}/notes", response_model=WorkOrderNoteResponse)
async def add_note(
    project_id: UUID,
    work_order_id: UUID,
    body: WorkOrderNoteCreate,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> WorkOrderNoteResponse:
    _ensure_project(pa, project_id)
    return await WorkOrderService(session).add_note(
        project_id,
        work_order_id,
        body,
        author_id=pa.studio_access.user.id,
    )
