"""LLM analysis of backlog work orders for potential duplicates (dedupe)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# Structured backlog duplicate analysis for Work Orders (builder dedupe).
WORK_ORDER_DEDUPE_JSON_SCHEMA: dict[str, Any] = {
    "name": "work_order_dedupe",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "groups": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "work_order_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "rationale": {"type": "string"},
                        "suggested_combined": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "title": {"type": "string"},
                                "description": {"type": "string"},
                                "implementation_guide": {"type": "string"},
                                "acceptance_criteria": {"type": "string"},
                            },
                            "required": [
                                "title",
                                "description",
                                "implementation_guide",
                                "acceptance_criteria",
                            ],
                        },
                    },
                    "required": [
                        "work_order_ids",
                        "rationale",
                        "suggested_combined",
                    ],
                },
            },
        },
        "required": ["groups"],
    },
}

SYSTEM_PROMPT_TEMPLATE = (
    "You are a technical project lead. Software: {sw_name}.\n\n"
    "Software definition (context):\n{def_block}\n\n"
    "Your task: find groups of Work Orders in the backlog that describe overlapping or "
    "redundant work and could be merged into a single work order. Be conservative: only "
    "group items that are truly duplicate or clearly combinable. "
    "Each group must list at least two work order UUIDs from the list provided. "
    "For suggested_combined, propose a merged title, description, implementation guidance, "
    "and acceptance criteria. Use empty strings for optional text you would leave blank."
)

USER_PROMPT = """
Backlog work orders (id, title, and description; sections may be truncated):

{backlog_blob}
""".strip()


class WorkOrderDedupeAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def analyze(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        backlog_blob: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            sw_name=sw_name, def_block=def_block
        )
        user_prompt = USER_PROMPT.format(backlog_blob=backlog_blob)
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=WORK_ORDER_DEDUPE_JSON_SCHEMA,
            usage_scope=ctx,
            call_type="work_order_dedupe",
        )
