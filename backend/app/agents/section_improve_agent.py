"""LLM revision of specification section markdown."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SECTION_IMPROVE_SYSTEM_PROMPT_PREFIX = (
    "You revise specification markdown. Preserve intent and structure where "
    "reasonable; remove ambiguity; do not invent requirements absent from the "
    "input or context. Return JSON only with improved_markdown.\n\n"
)

USER_PROMPT = """Section title: {title}

Current markdown:
{body_text}
{instruction_block}"""

# ── Schemas ───────────────────────────────────────────────────────────────────

SECTION_IMPROVE_SCHEMA: dict[str, Any] = {
    "name": "section_improve",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "improved_markdown": {"type": "string"},
        },
        "required": ["improved_markdown"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class SectionImproveAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def improve_markdown(
        self,
        ctx: TokenUsageScope,
        *,
        rag_text: str,
        title: str,
        body_text: str,
        instruction: str | None,
    ) -> dict[str, Any]:
        system_prompt = SECTION_IMPROVE_SYSTEM_PROMPT_PREFIX + rag_text
        instruction_block = ""
        if instruction and instruction.strip():
            instruction_block = f"\nAuthor instruction:\n{instruction.strip()}\n"
        user_prompt = USER_PROMPT.format(
            title=title,
            body_text=body_text,
            instruction_block=instruction_block,
        )
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=SECTION_IMPROVE_SCHEMA,
            usage_scope=ctx,
            call_source="section_improve",
        )
