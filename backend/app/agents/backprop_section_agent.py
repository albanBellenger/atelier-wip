"""Structured LLM proposal for a single Software Docs section from codebase context.

``CodebaseService.propose_software_doc_section_draft`` builds ``code_chunks_blob``: it runs RAG
(``title + plaintext(content)[:1500]``, limit 10) and, when fewer than three chunk hits are
returned, appends up to twenty distinct file paths from ``codebase_symbols`` matched by
case-insensitive ``ILIKE`` on title tokens (OR across tokens). Those paths appear in the blob as
bare path lines (one path per line, no snippet) so the model still sees file anchors.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = ATELIER_PRODUCT_PREFIX + (
    "You are a technical writer drafting one Software Documentation page in Markdown for "
    "Software «{sw_name}». Ground factual statements in the provided code snippets and repository "
    "listing. Cite source files in the Markdown using backticked file paths when you refer to "
    "implementation detail.\n\n"
    "Software definition (context):\n{def_block}\n"
)

USER_PROMPT = """
Target documentation section:

Title: {section_title}

Current section content (intent summary — rewrite freely unless instructed otherwise):
{section_summary}

Repository map (ranked paths):
{repo_map_blob}

Retrieved code snippets and symbol-path hints:
{code_chunks_blob}

Draft a cohesive Markdown body for this section only. Prefer concrete, code-referencing
explanations over generic boilerplate.
""".strip()

# ── Schemas ─────────────────────────────────────────────────────────────────────

BACKPROP_SECTION_JSON_SCHEMA: dict[str, Any] = {
    "name": "backprop_section",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "markdown": {"type": "string"},
            "source_files": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["markdown", "source_files"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class BackpropSectionAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def propose_section(
        self,
        ctx: TokenUsageScope,
        *,
        sw_name: str,
        def_block: str,
        section_title: str,
        section_summary: str,
        repo_map_blob: str,
        code_chunks_blob: str,
    ) -> dict[str, Any]:
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(sw_name=sw_name, def_block=def_block)
        user_prompt = USER_PROMPT.format(
            section_title=section_title,
            section_summary=section_summary,
            repo_map_blob=repo_map_blob,
            code_chunks_blob=code_chunks_blob,
        )
        return await self.llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=BACKPROP_SECTION_JSON_SCHEMA,
            usage_scope=ctx,
            call_source="backprop_section",
        )
