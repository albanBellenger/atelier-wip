"""Structured LLM batch generation for Work Orders."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# Shared JSON-schema envelope for work-order batch generation (Slice 7).
WORK_ORDER_BATCH_JSON_SCHEMA: dict[str, Any] = {
    "name": "work_order_batch",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "implementation_guide": {"type": "string"},
                        "acceptance_criteria": {"type": "string"},
                        "linked_section_slugs": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": [
                        "title",
                        "description",
                        "implementation_guide",
                        "acceptance_criteria",
                        "linked_section_slugs",
                    ],
                },
            },
        },
        "required": ["items"],
    },
}

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = "You are a technical project manager. Software: {sw_name}.\n\nSoftware definition (context):\n{def_block}\n"

USER_PROMPT = """
Given the following spec sections, decompose the work into discrete, implementable Work Orders. Each Work Order must be independently executable by a single developer or coding agent.

For each Work Order output JSON objects with:
- title (short, action-oriented)
- description (what needs to be built)
- implementation_guide (how to approach it)
- acceptance_criteria (verifiable outcomes)
- linked_section_slugs (array of section slugs this derives from; must be chosen from the sections provided below)

Sections:
{sections_blob}
""".strip()

# ── Agent ─────────────────────────────────────────────────────────────────────


class WorkOrderAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def generate_work_order_batch(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        sections_blob: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(sw_name=sw_name, def_block=def_block)
        user_prompt = USER_PROMPT.format(sections_blob=sections_blob)
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=WORK_ORDER_BATCH_JSON_SCHEMA,
            usage_scope=ctx,
            call_type="work_order_gen",
        )
