"""Structured LLM: work order vs codebase — implementation completeness (Slice 16e)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + (
    "You compare a Work Order — its description and acceptance "
    "criteria — to the code that may or may not implement it. "
    "Assess whether the work appears to be complete, partial, or "
    "missing in the codebase. Be conservative: 'partial' is the "
    "default when you cannot tell. Software: {sw_name}.\n\n"
    "Software definition (context):\n{def_block}\n"
)

USER_PROMPT = (
    "Work order title: {wo_title}\n\n"
    "Description:\n{wo_description}\n\n"
    "Acceptance criteria:\n{wo_acceptance_criteria}\n\n"
    "Relevant code chunks (path · lines · snippet):\n{code_chunks_blob}\n\n"
    "Repo map (ranked paths):\n{repo_map_blob}\n\n"
    "Return JSON only. No preamble."
)

# ── Schemas ─────────────────────────────────────────────────────────────────────

CODE_DRIFT_WO_JSON_SCHEMA: dict[str, Any] = {
    "name": "code_drift_work_order",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "verdict": {"type": "string", "enum": ["complete", "partial", "missing"]},
            "reason": {"type": "string"},
            "code_refs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "path": {"type": "string"},
                        "start_line": {"type": "integer"},
                        "end_line": {"type": "integer"},
                    },
                    "required": ["path", "start_line", "end_line"],
                },
            },
        },
        "required": ["verdict", "reason", "code_refs"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class CodeDriftWorkOrderAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def analyse(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        wo_title: str,
        wo_description: str,
        wo_acceptance_criteria: str,
        repo_map_blob: str,
        code_chunks_blob: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(sw_name=sw_name, def_block=def_block)
        user_prompt = USER_PROMPT.format(
            wo_title=wo_title,
            wo_description=wo_description,
            wo_acceptance_criteria=wo_acceptance_criteria,
            code_chunks_blob=code_chunks_blob,
            repo_map_blob=repo_map_blob,
        )
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=CODE_DRIFT_WO_JSON_SCHEMA,
            usage_scope=ctx,
            call_source="code_drift_work_order",
        )
