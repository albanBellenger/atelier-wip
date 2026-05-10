"""LLM-generated copy for the builder home composer."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    ATELIER_PRODUCT_PREFIX
    + "You write short UI strings for a specification builder product. "
    "Stay professional and concrete. No markdown, no quotes around outputs."
)

# Full user message is assembled by BuilderComposerService and passed to `hint_for_software`.
USER_PROMPT = ""

# ── Schemas ───────────────────────────────────────────────────────────────────

BUILDER_COMPOSER_HINT_JSON_SCHEMA: dict[str, Any] = {
    "name": "builder_composer_hint",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "headline": {
                "type": "string",
                "description": "One short line welcoming the user (max ~120 chars).",
            },
            "input_placeholder": {
                "type": "string",
                "description": "Placeholder for the main input (what to ask or do next).",
            },
        },
        "required": ["headline", "input_placeholder"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class BuilderComposerAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def hint_for_software(
        self,
        ctx: TokenUsageScope,
        user_prompt: str,
    ) -> dict[str, Any]:
        return await self.llm.chat_structured(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            json_schema=BUILDER_COMPOSER_HINT_JSON_SCHEMA,
            usage_scope=ctx,
            call_source="builder_composer_hint",
        )
