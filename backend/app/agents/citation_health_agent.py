"""LLM-backed citation coverage analysis (structured)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    ATELIER_PRODUCT_PREFIX
    + "You audit specification citations. Only count "
    "resolved when a claim clearly ties to a named source. "
    "Output strictly follows the JSON schema."
)

USER_PROMPT = (
    "Analyze the following specification markdown. Count statements that are "
    "grounded with explicit traceability (e.g. links to work orders, artifacts, "
    "other sections, or clear normative references) as citations_resolved. "
    "Count normative or data claims that lack any traceable source as "
    "citations_missing, and list up to 12 of the most important missing items "
    "with short statement text.\n\n---\n\n"
)

# ── Schemas ───────────────────────────────────────────────────────────────────

CITATION_HEALTH_SCHEMA: dict[str, Any] = {
    "name": "citation_health",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "citations_resolved": {"type": "integer"},
            "citations_missing": {"type": "integer"},
            "missing_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "statement": {"type": "string"},
                    },
                    "required": ["statement"],
                },
            },
        },
        "required": ["citations_resolved", "citations_missing", "missing_items"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class CitationHealthAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def analyze_section_text(
        self,
        ctx: TokenUsageScope,
        section_text: str,
    ) -> dict[str, Any]:
        await self.llm.ensure_openai_llm_ready(usage_scope=ctx, call_source="citation_health")
        user_prompt = USER_PROMPT + section_text
        return await self.llm.chat_structured(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            json_schema=CITATION_HEALTH_SCHEMA,
            usage_scope=ctx,
            call_source="citation_health",
        )
