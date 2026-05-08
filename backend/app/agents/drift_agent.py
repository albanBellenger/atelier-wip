"""Detect spec drift vs linked work orders after section changes (Slice 8)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models import Project, Section, Software, WorkOrder
from app.models.work_order import WorkOrderNote, WorkOrderSection
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

log = structlog.get_logger("atelier.drift")

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You compare software specification excerpts to a Work Order. "
    "Answer conservatively: mark likely_stale true only when the spec change "
    "would meaningfully invalidate or obsolete the Work Order's description "
    "or acceptance criteria."
)

USER_PROMPT = """
Work Order:
Title: {title}

Description:
{description}

Acceptance criteria:
{acceptance_criteria}

Current linked specification sections:
{sections_blob}

If the specification no longer matches what the Work Order asks for, set likely_stale to true and give a short reason. Otherwise likely_stale false and leave reason empty.
""".strip()

# ── Schemas ───────────────────────────────────────────────────────────────────

DRIFT_CHECK_JSON_SCHEMA: dict[str, Any] = {
    "name": "drift_check",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "likely_stale": {
                "type": "boolean",
                "description": "True if linked spec changes meaningfully invalidate the work order.",
            },
            "reason": {
                "type": "string",
                "description": "Brief explanation if likely_stale; empty otherwise.",
            },
        },
        "required": ["likely_stale", "reason"],
    },
}

_DRIFT_STATUSES = frozenset({"backlog", "in_progress"})

# ── Agent ─────────────────────────────────────────────────────────────────────


class DriftAgent:
    """LLM-assisted stale detection for work orders linked to edited sections."""

    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def run_after_section_change(self, section_id: uuid.UUID) -> None:
        """Evaluate drift for work orders linked to this section. Commits caller-owned."""
        sec = await self.db.get(Section, section_id)
        if sec is None:
            return

        project = await self.db.get(Project, sec.project_id)
        if project is None:
            return
        software = await self.db.get(Software, project.software_id)
        if software is None:
            return

        ctx = TokenUsageScope(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project.id,
            user_id=None,
        )

        wo_ids_r = await self.db.execute(
            select(WorkOrderSection.work_order_id).where(
                WorkOrderSection.section_id == section_id
            )
        )
        wo_ids = [row[0] for row in wo_ids_r.all()]
        if not wo_ids:
            return

        q = (
            select(WorkOrder)
            .where(
                WorkOrder.id.in_(wo_ids),
                WorkOrder.project_id == project.id,
                WorkOrder.status.in_(_DRIFT_STATUSES),
            )
            .options(selectinload(WorkOrder.sections))
        )
        work_orders = list((await self.db.execute(q)).scalars().unique().all())
        if not work_orders:
            return

        try:
            await self.llm.ensure_openai_llm_ready(usage_scope=ctx, call_source="section_drift")
        except ApiError as e:
            log.warning(
                "drift_skipped_llm_unavailable",
                section_id=str(section_id),
                detail=str(e.detail),
            )
            return

        for wo in work_orders:
            await self._check_one_work_order(ctx, wo)

    async def _check_one_work_order(
        self,
        ctx: TokenUsageScope,
        wo: WorkOrder,
    ) -> None:
        sections = list(wo.sections or [])
        if not sections:
            return

        section_lines: list[str] = []
        for s in sorted(sections, key=lambda x: (x.order, x.slug)):
            section_lines.append(
                f"## {s.title} (slug: {s.slug})\n\n{s.content or ''}\n"
            )
        sections_blob = "\n\n".join(section_lines)

        user_prompt = USER_PROMPT.format(
            title=wo.title,
            description=wo.description,
            acceptance_criteria=wo.acceptance_criteria or "(none)",
            sections_blob=sections_blob,
        )

        try:
            parsed = await self.llm.chat_structured(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                json_schema=DRIFT_CHECK_JSON_SCHEMA,
                usage_scope=ctx,
                call_source="drift",
            )
        except ApiError:
            log.exception(
                "drift_llm_failed",
                work_order_id=str(wo.id),
            )
            return

        likely = bool(parsed.get("likely_stale"))
        reason_raw = parsed.get("reason")
        reason = str(reason_raw).strip() if reason_raw else ""

        if likely:
            prev_stale = wo.is_stale
            prev_reason = (wo.stale_reason or "").strip()
            wo.is_stale = True
            wo.stale_reason = reason[:4000] if reason else "Specification may no longer match this work order."
            await self.db.flush()
            if not prev_stale or prev_reason != wo.stale_reason:
                self.db.add(
                    WorkOrderNote(
                        id=uuid.uuid4(),
                        work_order_id=wo.id,
                        author_id=None,
                        source="drift_flag",
                        content=(
                            f"[Drift detection] Work order marked potentially stale. "
                            f"{wo.stale_reason}"
                        ),
                    )
                )
                await self.db.flush()
            log.info(
                "drift_marked_stale",
                work_order_id=str(wo.id),
                reason_preview=wo.stale_reason[:120] if wo.stale_reason else "",
            )
        else:
            log.debug("drift_clear_llm_says_ok", work_order_id=str(wo.id))
