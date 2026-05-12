"""Structured LLM: spec section vs codebase — likely drift (Slice 16e)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + (
    "You compare a written software specification section to the "
    "code that implements it, to identify where the spec misleads "
    "a reader of the codebase. You are conservative: flag only "
    "divergences that a careful reader would call out. Do not flag "
    "stylistic differences, missing 'how' detail, or anything you "
    "would have to guess about. Software: {sw_name}.\n\n"
    "Software definition (context):\n{def_block}\n"
)

USER_PROMPT = (
    "Section title: {section_title}\n\n"
    "Section markdown:\n{section_body}\n\n"
    "Relevant code chunks (path · lines · snippet):\n{code_chunks_blob}\n\n"
    "Repo map (ranked paths):\n{repo_map_blob}\n\n"
    "Return JSON only. No preamble."
)

# ── Schemas ─────────────────────────────────────────────────────────────────────

CODE_DRIFT_SECTION_JSON_SCHEMA: dict[str, Any] = {
    "name": "code_drift_section",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "likely_drifted": {"type": "boolean"},
            "severity": {"type": "string", "enum": ["low", "medium", "high"]},
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
        "required": ["likely_drifted", "severity", "reason", "code_refs"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class CodeDriftSectionAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def analyse(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        section_title: str,
        section_body: str,
        repo_map_blob: str,
        code_chunks_blob: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(sw_name=sw_name, def_block=def_block)
        user_prompt = USER_PROMPT.format(
            section_title=section_title,
            section_body=section_body,
            code_chunks_blob=code_chunks_blob,
            repo_map_blob=repo_map_blob,
        )
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=CODE_DRIFT_SECTION_JSON_SCHEMA,
            usage_scope=ctx,
            call_source="code_drift_section",
        )
