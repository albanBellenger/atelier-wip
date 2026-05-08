"""Unit tests for MCP work-order service."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import ApiError
from app.models import Project, Software, WorkOrder
from app.services.mcp_work_order_service import McpWorkOrderService
from app.services.rag_service import RAGContext


@pytest.mark.asyncio
async def test_pull_payload_missing_project_returns_api_error_not_assertion() -> None:
    """When Project row is missing after _ensure, pull_payload raises ApiError 404."""
    studio_id = uuid.uuid4()
    wo_id = uuid.uuid4()
    pid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = wo_id
    wo.project_id = pid

    db = MagicMock()
    db.get = AsyncMock(return_value=None)

    svc = McpWorkOrderService(db)
    svc._ensure_wo_in_studio = AsyncMock(return_value=wo)  # type: ignore[method-assign]

    with pytest.raises(ApiError) as excinfo:
        await svc.pull_payload(studio_id, wo_id)

    assert excinfo.value.status_code == 404
    assert excinfo.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_ensure_wo_not_found() -> None:
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ApiError) as e:
        await McpWorkOrderService(db)._ensure_wo_in_studio(uuid.uuid4(), uuid.uuid4())
    assert e.value.status_code == 404
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_ensure_wo_project_not_found() -> None:
    wo = MagicMock(spec=WorkOrder)
    wo.project_id = uuid.uuid4()
    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, None])
    with pytest.raises(ApiError) as e:
        await McpWorkOrderService(db)._ensure_wo_in_studio(uuid.uuid4(), wo.id)
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_ensure_wo_wrong_studio() -> None:
    studio_id = uuid.uuid4()
    other_studio = uuid.uuid4()
    pid = uuid.uuid4()
    swid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = uuid.uuid4()
    wo.project_id = pid
    pr = MagicMock(spec=Project)
    pr.software_id = swid
    sw = MagicMock(spec=Software)
    sw.studio_id = other_studio

    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, pr, sw])
    with pytest.raises(ApiError) as e:
        await McpWorkOrderService(db)._ensure_wo_in_studio(studio_id, wo.id)
    assert e.value.status_code == 403
    assert e.value.error_code == "FORBIDDEN"


@pytest.mark.asyncio
async def test_ensure_wo_software_missing() -> None:
    studio_id = uuid.uuid4()
    pid = uuid.uuid4()
    wo = MagicMock(spec=WorkOrder)
    wo.id = uuid.uuid4()
    wo.project_id = pid
    pr = MagicMock(spec=Project)
    pr.software_id = uuid.uuid4()

    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, pr, None])
    with pytest.raises(ApiError) as e:
        await McpWorkOrderService(db)._ensure_wo_in_studio(studio_id, wo.id)
    assert e.value.error_code == "FORBIDDEN"


@pytest.mark.asyncio
async def test_list_for_studio_empty_with_project_id_sets_usage_scope() -> None:
    studio_id = uuid.uuid4()
    project_id = uuid.uuid4()
    swid = uuid.uuid4()

    uniq = MagicMock()
    uniq.all.return_value = []
    scalars = MagicMock()
    scalars.unique.return_value = uniq
    list_result = MagicMock()
    list_result.scalars.return_value = scalars

    pr = MagicMock()
    pr.software_id = swid
    pr.id = project_id
    sw = MagicMock()
    sw.studio_id = studio_id

    db = MagicMock()
    db.execute = AsyncMock(return_value=list_result)
    db.get = AsyncMock(side_effect=[pr, sw])

    with patch(
        "app.services.mcp_work_order_service.record_usage",
        new_callable=AsyncMock,
    ) as rec:
        out = await McpWorkOrderService(db).list_for_studio(
            studio_id, project_id=project_id
        )
    assert out == []
    rec.assert_awaited_once()
    ctx = rec.call_args[0][1]
    assert ctx.studio_id == studio_id
    assert ctx.software_id == swid
    assert ctx.project_id == project_id


@pytest.mark.asyncio
async def test_list_for_studio_returns_filtered_rows() -> None:
    studio_id = uuid.uuid4()
    pid = uuid.uuid4()
    swid = uuid.uuid4()
    woid = uuid.uuid4()

    wo = MagicMock()
    wo.id = woid
    wo.project_id = pid
    wo.title = "Do thing"
    wo.status = "open"
    wo.phase = "backlog"

    uniq = MagicMock()
    uniq.all.return_value = [wo]
    scalars = MagicMock()
    scalars.unique.return_value = uniq
    list_result = MagicMock()
    list_result.scalars.return_value = scalars

    pr = MagicMock()
    pr.software_id = swid
    pr.id = pid
    sw = MagicMock()
    sw.studio_id = studio_id

    db = MagicMock()
    db.execute = AsyncMock(return_value=list_result)
    db.get = AsyncMock(side_effect=[pr, sw])

    with patch("app.services.mcp_work_order_service.record_usage", new_callable=AsyncMock):
        out = await McpWorkOrderService(db).list_for_studio(
            studio_id,
            project_id=pid,
            status="open",
            phase="backlog",
        )

    assert len(out) == 1
    assert out[0]["id"] == str(woid)
    assert out[0]["title"] == "Do thing"


@pytest.mark.asyncio
async def test_pull_payload_success_builds_dict() -> None:
    studio_id = uuid.uuid4()
    woid = uuid.uuid4()
    pid = uuid.uuid4()
    swid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = woid
    wo.project_id = pid
    wo.title = "WO"
    wo.description = "D"
    wo.acceptance_criteria = "AC"
    wo.implementation_guide = "IG"
    wo.phase = "build"
    wo.status = "in_progress"

    pr = MagicMock()
    pr.id = pid
    pr.software_id = swid
    sw = MagicMock()
    sw.id = swid
    sw.studio_id = studio_id
    sw.definition = "soft def"

    sec = MagicMock()
    sec.id = uuid.uuid4()
    sec.title = "Sec"
    sec.content = "body"

    sec_scalars = MagicMock()
    sec_scalars.all.return_value = [sec]
    sec_result = MagicMock()
    sec_result.scalars.return_value = sec_scalars

    edge_scalars = MagicMock()
    edge_scalars.all.return_value = []
    edge_result = MagicMock()
    edge_result.scalars.return_value = edge_scalars

    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, pr, sw, pr, sw])
    db.execute = AsyncMock(side_effect=[sec_result, edge_result])

    with patch("app.services.mcp_work_order_service.record_usage", new_callable=AsyncMock):
        with patch("app.services.mcp_work_order_service.RAGService") as RAGcls:
            rag_inst = MagicMock()
            rag_inst.build_context = AsyncMock(
                return_value=RAGContext(text="rag bits", truncated=False)
            )
            RAGcls.return_value = rag_inst

            payload = await McpWorkOrderService(db).pull_payload(studio_id, woid)

    assert payload["id"] == str(woid)
    assert payload["title"] == "WO"
    assert payload["software_definition"] == "soft def"
    assert payload["linked_sections"] == [{"title": "Sec", "content": "body"}]
    assert payload["artifact_context"] == "rag bits"
    assert payload["related_work_orders"] == []
    rag_inst.build_context.assert_awaited_once()
    call_kw = rag_inst.build_context.await_args.kwargs
    assert call_kw["project_id"] == pid
    assert call_kw["current_section_id"] == sec.id


@pytest.mark.asyncio
async def test_list_for_studio_assignee_filter_does_not_error() -> None:
    studio_id = uuid.uuid4()
    aid = uuid.uuid4()
    uniq = MagicMock()
    uniq.all.return_value = []
    scalars = MagicMock()
    scalars.unique.return_value = uniq
    list_result = MagicMock()
    list_result.scalars.return_value = scalars
    db = MagicMock()
    db.execute = AsyncMock(return_value=list_result)
    db.get = AsyncMock(return_value=None)
    with patch("app.services.mcp_work_order_service.record_usage", new_callable=AsyncMock):
        out = await McpWorkOrderService(db).list_for_studio(
            studio_id, assignee_id=aid
        )
    assert out == []


@pytest.mark.asyncio
async def test_pull_payload_includes_related_work_orders_from_graph() -> None:
    studio_id = uuid.uuid4()
    woid = uuid.uuid4()
    other_woid = uuid.uuid4()
    pid = uuid.uuid4()
    swid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = woid
    wo.project_id = pid
    wo.title = "WO"
    wo.description = "D"
    wo.acceptance_criteria = None
    wo.implementation_guide = None
    wo.phase = "build"
    wo.status = "in_progress"

    pr = MagicMock()
    pr.id = pid
    pr.software_id = swid
    sw = MagicMock()
    sw.id = swid
    sw.studio_id = studio_id
    sw.definition = ""

    e1 = MagicMock()
    e1.source_type = "work_order"
    e1.source_id = woid
    e1.target_type = "work_order"
    e1.target_id = other_woid

    sec_scalars = MagicMock()
    sec_scalars.all.return_value = []
    sec_result = MagicMock()
    sec_result.scalars.return_value = sec_scalars

    edge_scalars = MagicMock()
    edge_scalars.all.return_value = [e1]
    edge_result = MagicMock()
    edge_result.scalars.return_value = edge_scalars

    related_wo = MagicMock()
    related_wo.id = other_woid
    related_wo.title = "Dep"
    related_wo.status = "open"

    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, pr, sw, pr, sw, related_wo])
    db.execute = AsyncMock(side_effect=[sec_result, edge_result])

    with patch("app.services.mcp_work_order_service.record_usage", new_callable=AsyncMock):
        with patch("app.services.mcp_work_order_service.RAGService") as RAGcls:
            rag_inst = MagicMock()
            rag_inst.build_context = AsyncMock(
                return_value=RAGContext(text="", truncated=False)
            )
            RAGcls.return_value = rag_inst
            payload = await McpWorkOrderService(db).pull_payload(studio_id, woid)

    assert len(payload["related_work_orders"]) == 1
    assert payload["related_work_orders"][0]["id"] == str(other_woid)
    assert payload["related_work_orders"][0]["title"] == "Dep"


@pytest.mark.asyncio
async def test_pull_payload_related_via_incoming_edge() -> None:
    """Graph edge where this WO is target and peer is source (lines 183-185)."""
    studio_id = uuid.uuid4()
    woid = uuid.uuid4()
    peer_woid = uuid.uuid4()
    pid = uuid.uuid4()
    swid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = woid
    wo.project_id = pid
    wo.title = "WO"
    wo.description = ""
    wo.acceptance_criteria = None
    wo.implementation_guide = None
    wo.phase = "p"
    wo.status = "open"

    pr = MagicMock()
    pr.id = pid
    pr.software_id = swid
    sw = MagicMock()
    sw.id = swid
    sw.studio_id = studio_id
    sw.definition = ""

    e1 = MagicMock()
    e1.source_type = "work_order"
    e1.source_id = peer_woid
    e1.target_type = "work_order"
    e1.target_id = woid

    sec_scalars = MagicMock()
    sec_scalars.all.return_value = []
    sec_result = MagicMock()
    sec_result.scalars.return_value = sec_scalars

    edge_scalars = MagicMock()
    edge_scalars.all.return_value = [e1]
    edge_result = MagicMock()
    edge_result.scalars.return_value = edge_scalars

    peer = MagicMock()
    peer.id = peer_woid
    peer.title = "Peer"
    peer.status = "done"

    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, pr, sw, pr, sw, peer])
    db.execute = AsyncMock(side_effect=[sec_result, edge_result])

    with patch("app.services.mcp_work_order_service.record_usage", new_callable=AsyncMock):
        with patch("app.services.mcp_work_order_service.RAGService") as RAGcls:
            rag_inst = MagicMock()
            rag_inst.build_context = AsyncMock(
                return_value=RAGContext(text="", truncated=False)
            )
            RAGcls.return_value = rag_inst
            payload = await McpWorkOrderService(db).pull_payload(studio_id, woid)

    assert len(payload["related_work_orders"]) == 1
    assert payload["related_work_orders"][0]["id"] == str(peer_woid)


@pytest.mark.asyncio
async def test_pull_payload_software_row_missing_returns_404() -> None:
    studio_id = uuid.uuid4()
    woid = uuid.uuid4()
    pid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = woid
    wo.project_id = pid
    pr = MagicMock()
    pr.id = pid
    swid = uuid.uuid4()
    pr.software_id = swid
    sw_ok = MagicMock()
    sw_ok.studio_id = studio_id

    db = MagicMock()
    db.get = AsyncMock(side_effect=[wo, pr, sw_ok, pr, None])

    with pytest.raises(ApiError) as e:
        await McpWorkOrderService(db).pull_payload(studio_id, woid)
    assert e.value.status_code == 404
    assert "Software" in (e.value.detail or "")
    assert e.value.status_code == 404
    assert "Software" in (e.value.detail or "")
