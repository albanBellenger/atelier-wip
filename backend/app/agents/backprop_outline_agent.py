"""Structured LLM proposal for Software Docs outline from codebase context."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + (
    "You are a technical writer producing the outline of a software "
    "documentation set by analysing an existing codebase. "
    "Software: {sw_name}.\n\n"
    "Software definition (context):\n{def_block}\n\n"
    "Propose between 5 and 12 sections that together describe what "
    "this software does, how it is built, and what a new engineer "
    "would need to know. Order them so the reading sequence makes "
    "sense (overview → architecture → data → operations → glossary)."
)

USER_PROMPT = (
    "Repository map (ranked by structural centrality):\n{repo_map_blob}\n\n"
    "Optional hint from the user (may be empty):\n{hint}\n\n"
    "Return JSON only. No preamble."
)

# ── Schemas ─────────────────────────────────────────────────────────────────────

BACKPROP_OUTLINE_JSON_SCHEMA: dict[str, Any] = {
    "name": "backprop_outline",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "title": {"type": "string"},
                        "slug": {"type": "string"},
                        "summary": {"type": "string"},
                    },
                    "required": ["title", "slug", "summary"],
                },
            },
        },
        "required": ["sections"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class BackpropOutlineAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def propose_outline(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        repo_map_blob: str,
        hint: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(sw_name=sw_name, def_block=def_block)
        user_prompt = USER_PROMPT.format(repo_map_blob=repo_map_blob, hint=hint)
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=BACKPROP_OUTLINE_JSON_SCHEMA,
            usage_scope=ctx,
            call_source="backprop_outline",
        )
