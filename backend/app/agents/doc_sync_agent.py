"""Structured LLM: suggest Software Docs updates after a work order completes (Slice 16f)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + (
    "You suggest documentation updates after a unit of work ships. "
    "You propose at most one markdown replacement per documentation "
    "section, never to source code or test files. Be conservative: "
    "only propose a change when the work clearly changes what the "
    "documentation should say. Preserve the section's existing "
    "voice and structure; only rewrite paragraphs that materially "
    "need to change. Software: {sw_name}.\n\n"
    "Software definition (context):\n{def_block}\n"
)

USER_PROMPT = (
    "Work order title:\n{wo_title}\n\n"
    "Work order description:\n{wo_description}\n\n"
    "Acceptance criteria:\n{wo_acceptance_criteria}\n\n"
    "Candidate documentation sections:\n{candidate_sections_blob}\n\n"
    "Relevant code chunks (path · lines · snippet):\n{code_chunks_blob}\n\n"
    "Return JSON only. No preamble."
)

# ── Schemas ─────────────────────────────────────────────────────────────────────

DOC_SYNC_JSON_SCHEMA: dict[str, Any] = {
    "name": "doc_sync_proposals",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "proposals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "section_id": {"type": "string"},
                        "rationale": {"type": "string"},
                        "replacement_markdown": {"type": "string"},
                    },
                    "required": ["section_id", "rationale", "replacement_markdown"],
                },
            }
        },
        "required": ["proposals"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class DocSyncAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def propose_patches(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        wo_title: str,
        wo_description: str,
        wo_acceptance_criteria: str,
        candidate_sections_blob: str,
        code_chunks_blob: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(sw_name=sw_name, def_block=def_block)
        user_prompt = USER_PROMPT.format(
            wo_title=wo_title,
            wo_description=wo_description,
            wo_acceptance_criteria=wo_acceptance_criteria,
            candidate_sections_blob=candidate_sections_blob,
            code_chunks_blob=code_chunks_blob,
        )
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=DOC_SYNC_JSON_SCHEMA,
            usage_scope=ctx,
            call_source="doc_sync",
        )
