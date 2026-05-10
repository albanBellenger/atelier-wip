"""Private section thread: LLM streaming, findings scan, and patch proposals."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Literal, cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.exceptions import ApiError
from app.schemas.private_thread import ThreadStreamCommand, ThreadFinding, normalize_thread_findings
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService
from app.services.private_thread_patch import _normalize_patch_proposal

# ── Prompts ───────────────────────────────────────────────────────────────────

PRIVATE_THREAD_DEFAULT_CHAT_PERSONA = (
    ATELIER_PRODUCT_PREFIX
    + "You are a concise assistant for specification and implementation questions. "
    "Ground answers in the context when relevant.\n\n"
)

PRIVATE_THREAD_CRITIQUE_PERSONA = (
    ATELIER_PRODUCT_PREFIX
    + "You are a specification critic. Prioritize gaps, missing acceptance criteria, "
    "and unclear dependencies. Ground observations in the context.\n\n"
)

PRIVATE_THREAD_IMPROVE_PERSONA = (
    ATELIER_PRODUCT_PREFIX
    + "You improve specification markdown: tighten wording, resolve ambiguity, "
    "and keep claims traceable to the context. Prefer minimal edits.\n\n"
)

THREAD_FINDINGS_SCAN_SYSTEM_PROMPT = (
    ATELIER_PRODUCT_PREFIX
    + "You scan the user message and assistant reply. Identify "
    "(1) contradictory requirements or conflicting facts, and "
    "(2) missing requirements, unanswered questions, or "
    "specification gaps. Return JSON only."
)

THREAD_PATCH_APPEND_SYSTEM_PROMPT = (
    ATELIER_PRODUCT_PREFIX
    + "You propose markdown to APPEND at the end of the section. "
    "Return JSON only. Do not repeat the whole document."
)

THREAD_PATCH_REPLACE_SYSTEM_PROMPT = (
    ATELIER_PRODUCT_PREFIX
    + "You propose replacement markdown for the user's selection only. "
    "Return JSON only with replacement_markdown."
)

THREAD_PATCH_EDIT_SYSTEM_PROMPT = (
    ATELIER_PRODUCT_PREFIX
    + "You propose replacing exactly one occurrence of old_snippet "
    "in the section with new_snippet. Return JSON only."
)

# User turns are supplied via the chat API `messages` list; no static user prompt body.
USER_PROMPT = ""

# ── Schemas ───────────────────────────────────────────────────────────────────

THREAD_FINDINGS_JSON_SCHEMA: dict[str, Any] = {
    "name": "thread_findings",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "finding_type": {
                            "type": "string",
                            "enum": ["conflict", "gap"],
                        },
                        "description": {"type": "string"},
                    },
                    "required": ["finding_type", "description"],
                },
            }
        },
        "required": ["findings"],
    },
}

THREAD_PATCH_APPEND_SCHEMA: dict[str, Any] = {
    "name": "thread_patch_append",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "markdown_to_append": {"type": "string"},
        },
        "required": ["markdown_to_append"],
    },
}

THREAD_PATCH_REPLACE_SCHEMA: dict[str, Any] = {
    "name": "thread_patch_replace",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "replacement_markdown": {"type": "string"},
        },
        "required": ["replacement_markdown"],
    },
}

THREAD_PATCH_EDIT_SCHEMA: dict[str, Any] = {
    "name": "thread_patch_edit",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "old_snippet": {"type": "string"},
            "new_snippet": {"type": "string"},
        },
        "required": ["old_snippet", "new_snippet"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class PrivateThreadAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    @staticmethod
    def persona_for_command(
        command: ThreadStreamCommand,
    ) -> str:
        if command == "critique":
            return PRIVATE_THREAD_CRITIQUE_PERSONA
        if command == "improve":
            return PRIVATE_THREAD_IMPROVE_PERSONA
        return PRIVATE_THREAD_DEFAULT_CHAT_PERSONA

    async def stream_main_reply(
        self,
        *,
        system_prompt: str,
        openai_msgs: list[dict[str, Any]],
        ctx: TokenUsageScope,
        stream_state: dict[str, Any],
        preferred_model: str | None = None,
    ) -> AsyncIterator[str]:
        stream_state["stream_failed"] = False
        try:
            async for piece in self.llm.chat_stream(
                system_prompt=system_prompt,
                messages=openai_msgs,
                usage_scope=ctx,
                call_source="private_thread",
                preferred_model=preferred_model,
            ):
                yield piece
        except ApiError:
            stream_state["stream_failed"] = True
            return

    async def scan_for_findings(
        self,
        *,
        user_message: str,
        full_text: str,
        ctx: TokenUsageScope,
    ) -> list[ThreadFinding]:
        if not full_text.strip():
            return []
        try:
            scan = await self.llm.chat_structured(
                system_prompt=THREAD_FINDINGS_SCAN_SYSTEM_PROMPT,
                user_prompt=(
                    f"User:\n{user_message}\n\nAssistant:\n{full_text}\n\n"
                    "List concrete findings. Use finding_type \"conflict\" for "
                    "contradictions and \"gap\" for missing or unclear coverage."
                ),
                json_schema=THREAD_FINDINGS_JSON_SCHEMA,
                usage_scope=ctx,
                call_source="thread_conflict_scan",
            )
        except ApiError:
            return []
        raw_items = normalize_thread_findings(scan)
        out: list[ThreadFinding] = []
        for item in raw_items:
            ft = item.get("finding_type")
            if ft not in ("conflict", "gap"):
                continue
            out.append(
                ThreadFinding(
                    finding_type=cast(Literal["conflict", "gap"], ft),
                    description=str(item.get("description") or ""),
                )
            )
        return out

    async def build_patch_proposal(
        self,
        *,
        intent: Literal["append", "replace_selection", "edit"],
        effective_snap: str,
        content: str,
        full: str,
        selection_triple: tuple[int, int, str] | None,
        ctx: TokenUsageScope,
    ) -> dict[str, Any] | None:
        patch_prompt = (
            f"Current section markdown (full):\n{effective_snap}\n\n"
            f"User request:\n{content}\n\nAssistant reply (main body):\n{full}\n"
        )
        if selection_triple is not None:
            patch_prompt += (
                f"\nSelection to replace (from={selection_triple[0]}, "
                f"to={selection_triple[1]}):\n{selection_triple[2]}\n"
            )
        try:
            if intent == "append":
                raw_patch = await self.llm.chat_structured(
                    system_prompt=THREAD_PATCH_APPEND_SYSTEM_PROMPT,
                    user_prompt=patch_prompt,
                    json_schema=THREAD_PATCH_APPEND_SCHEMA,
                    usage_scope=ctx,
                    call_source="thread_patch_append",
                )
                return _normalize_patch_proposal(
                    "append",
                    raw_patch,
                    snapshot=effective_snap,
                    selection=selection_triple,
                )
            if intent == "replace_selection":
                raw_patch = await self.llm.chat_structured(
                    system_prompt=THREAD_PATCH_REPLACE_SYSTEM_PROMPT,
                    user_prompt=patch_prompt,
                    json_schema=THREAD_PATCH_REPLACE_SCHEMA,
                    usage_scope=ctx,
                    call_source="thread_patch_replace",
                )
                return _normalize_patch_proposal(
                    "replace_selection",
                    raw_patch,
                    snapshot=effective_snap,
                    selection=selection_triple,
                )
            raw_patch = await self.llm.chat_structured(
                system_prompt=THREAD_PATCH_EDIT_SYSTEM_PROMPT,
                user_prompt=patch_prompt,
                json_schema=THREAD_PATCH_EDIT_SCHEMA,
                usage_scope=ctx,
                call_source="thread_patch_edit",
            )
            return _normalize_patch_proposal(
                "edit", raw_patch, snapshot=effective_snap, selection=selection_triple
            )
        except ApiError:
            return {"error": "patch_structured_call_failed"}
