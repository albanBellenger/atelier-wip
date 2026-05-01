"""Private thread under a section — create, list, stream assistant reply."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import PrivateThread, Project, Section, Software, ThreadMessage
from app.schemas.private_thread import PrivateThreadStreamBody
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService
from app.services.private_thread_selection import (
    excerpt_block_for_rag,
    validate_selection_against_snapshot,
)
from app.services.rag_service import RAGService

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


def _normalize_thread_findings(scan: object) -> list[dict[str, str]]:
    if not isinstance(scan, dict):
        return []
    raw = scan.get("findings")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        ft = item.get("finding_type")
        desc = str(item.get("description") or "").strip()
        if ft not in ("conflict", "gap") or not desc:
            continue
        out.append({"finding_type": str(ft), "description": desc})
    return out


def _findings_appendix(findings: list[dict[str, str]]) -> str:
    if not findings:
        return ""
    lines: list[str] = ["---", "**Conflicts and gaps**"]
    for f in findings:
        label = "Conflict" if f["finding_type"] == "conflict" else "Gap"
        lines.append(f"- **{label}:** {f['description']}")
    return "\n".join(lines) + "\n"


def _conflicts_from_findings(findings: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {"description": f["description"]}
        for f in findings
        if f.get("finding_type") == "conflict"
    ]


def _chunk_text_for_sse(text: str, max_len: int = 320) -> list[str]:
    if not text:
        return []
    chunks: list[str] = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + max_len])
        i += max_len
    return chunks


def _normalize_patch_proposal(
    intent: Literal["append", "replace_selection", "edit"],
    raw: object,
    *,
    snapshot: str,
    selection: tuple[int, int, str] | None,
) -> dict[str, Any]:
    """Return a JSON-serializable patch_proposal for meta, or {error: ...}."""
    if not isinstance(raw, dict):
        return {"error": "invalid_patch_response"}
    if intent == "append":
        md = str(raw.get("markdown_to_append") or "")
        if not md.strip():
            return {"error": "empty_append"}
        return {"intent": "append", "markdown_to_append": md}
    if intent == "replace_selection":
        if selection is None:
            return {"error": "replace_requires_selection"}
        rep = str(raw.get("replacement_markdown") if "replacement_markdown" in raw else "")
        return {
            "intent": "replace_selection",
            "replacement_markdown": rep,
            "selection_from": selection[0],
            "selection_to": selection[1],
        }
    old_s = str(raw.get("old_snippet") or "")
    new_s = str(raw.get("new_snippet") or "")
    if not old_s:
        return {"error": "empty_old_snippet"}
    count = snapshot.count(old_s)
    if count != 1:
        return {"error": "old_snippet_must_match_exactly_once", "occurrences": count}
    return {"intent": "edit", "old_snippet": old_s, "new_snippet": new_s}


class PrivateThreadService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def require_section_in_project(
        self, project_id: uuid.UUID, section_id: uuid.UUID
    ) -> Section:
        sec = await self.db.get(Section, section_id)
        if sec is None or sec.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found.",
            )
        return sec

    async def get_or_create_thread(
        self, *, user_id: uuid.UUID, section_id: uuid.UUID
    ) -> PrivateThread:
        r = await self.db.execute(
            select(PrivateThread).where(
                PrivateThread.user_id == user_id,
                PrivateThread.section_id == section_id,
            )
        )
        existing = r.scalar_one_or_none()
        if existing:
            return existing
        th = PrivateThread(
            id=uuid.uuid4(),
            user_id=user_id,
            section_id=section_id,
        )
        self.db.add(th)
        await self.db.flush()
        return th

    async def list_messages(self, thread_id: uuid.UUID) -> list[ThreadMessage]:
        r = await self.db.execute(
            select(ThreadMessage)
            .where(ThreadMessage.thread_id == thread_id)
            .order_by(ThreadMessage.created_at)
        )
        return list(r.scalars().all())

    async def reset_thread(
        self, *, user_id: uuid.UUID, section_id: uuid.UUID
    ) -> None:
        """Remove the user's private thread for this section and all messages (idempotent)."""
        r = await self.db.execute(
            select(PrivateThread).where(
                PrivateThread.user_id == user_id,
                PrivateThread.section_id == section_id,
            )
        )
        th = r.scalar_one_or_none()
        if th is None:
            return
        await self.db.delete(th)
        await self.db.flush()

    async def _effective_section_plaintext(
        self,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        current_section_plaintext: str | None,
    ) -> str:
        await self.require_section_in_project(project_id, section_id)
        if current_section_plaintext is not None:
            return current_section_plaintext
        sec = await self.db.get(Section, section_id)
        return (sec.content or "") if sec else ""

    async def assert_thread_stream_request_valid(
        self,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        body: PrivateThreadStreamBody,
    ) -> None:
        """Raise ApiError(422) before streaming if intent/selection are inconsistent."""
        snap = await self._effective_section_plaintext(
            project_id=project_id,
            section_id=section_id,
            current_section_plaintext=body.current_section_plaintext,
        )
        if body.selection_from is not None or body.selection_to is not None:
            validate_selection_against_snapshot(
                snapshot=snap,
                selection_from=body.selection_from,
                selection_to=body.selection_to,
                selected_plaintext=body.selected_plaintext,
            )
        if body.thread_intent == "replace_selection":
            if body.selection_from is None or body.selection_to is None:
                raise ApiError(
                    status_code=422,
                    code="VALIDATION_ERROR",
                    message="replace_selection requires selection_from and selection_to.",
                )
            if body.current_section_plaintext is None:
                raise ApiError(
                    status_code=422,
                    code="VALIDATION_ERROR",
                    message="replace_selection requires current_section_plaintext matching the editor.",
                )

    async def stream_assistant(
        self,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
        current_section_plaintext: str | None = None,
        include_git_history: bool = False,
        selection_from: int | None = None,
        selection_to: int | None = None,
        selected_plaintext: str | None = None,
        include_selection_in_context: bool = True,
        thread_intent: Literal["ask", "append", "replace_selection", "edit"] = "ask",
        command: Literal["none", "improve", "critique"] = "none",
    ) -> AsyncIterator[bytes]:
        """SSE chunks: JSON lines with type token | meta, then [DONE]."""
        await self.require_section_in_project(project_id, section_id)
        project = await self.db.get(Project, project_id)
        assert project is not None
        software = await self.db.get(Software, project.software_id)
        assert software is not None

        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project_id,
            user_id=user_id,
        )

        effective_snap = await self._effective_section_plaintext(
            project_id=project_id,
            section_id=section_id,
            current_section_plaintext=current_section_plaintext,
        )

        selection_triple: tuple[int, int, str] | None = None
        if selection_from is not None or selection_to is not None:
            selection_triple = validate_selection_against_snapshot(
                snapshot=effective_snap,
                selection_from=selection_from,
                selection_to=selection_to,
                selected_plaintext=selected_plaintext,
            )

        if thread_intent == "replace_selection" and selection_triple is None:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message="replace_selection requires selection_from, selection_to, and current_section_plaintext.",
            )

        thread = await self.get_or_create_thread(
            user_id=user_id, section_id=section_id
        )
        user_msg = ThreadMessage(
            id=uuid.uuid4(),
            thread_id=thread.id,
            role="user",
            content=content.strip(),
        )
        self.db.add(user_msg)
        await self.db.flush()

        hist = await self.list_messages(thread.id)
        openai_msgs = [{"role": m.role, "content": m.content} for m in hist]

        rag = await RAGService(self.db).build_context(
            query=content,
            project_id=project_id,
            current_section_id=section_id,
            token_budget=6000,
            current_section_plaintext_override=current_section_plaintext,
            include_git_history=include_git_history,
        )
        rag_text = rag.text
        context_truncated = rag.truncated
        excerpt_extra = ""
        if (
            include_selection_in_context
            and selection_triple is not None
            and selection_triple[2].strip()
        ):
            excerpt_extra = "\n\n" + excerpt_block_for_rag(selection_triple[2])
        if command == "critique":
            persona = (
                "You are a specification critic. Prioritize gaps, missing acceptance criteria, "
                "and unclear dependencies. Ground observations in the context.\n\n"
            )
        elif command == "improve":
            persona = (
                "You improve specification markdown: tighten wording, resolve ambiguity, "
                "and keep claims traceable to the context. Prefer minimal edits.\n\n"
            )
        else:
            persona = (
                "You are a concise assistant for specification and implementation questions. "
                "Ground answers in the context when relevant.\n\n"
            )
        system_prompt = persona + rag_text + excerpt_extra

        llm = LLMService(self.db)
        buf: list[str] = []
        full = ""
        stream_failed = False

        try:
            async for piece in llm.chat_stream(
                system_prompt=system_prompt,
                messages=openai_msgs,
                context=ctx,
                call_type="private_thread",
            ):
                buf.append(piece)
                payload = json.dumps({"type": "token", "text": piece})
                yield f"data: {payload}\n\n".encode()

            full = "".join(buf)
        except Exception:
            stream_failed = True
            full = ""
            self.db.add(
                ThreadMessage(
                    id=uuid.uuid4(),
                    thread_id=thread.id,
                    role="assistant",
                    content="[error: LLM call failed]",
                )
            )
            await self.db.flush()

        findings_list: list[dict[str, str]] = []
        appendix = ""
        full_final = full

        skip_conflict_scan = command == "improve"

        if not stream_failed and full.strip():
            if skip_conflict_scan:
                full_final = full
                self.db.add(
                    ThreadMessage(
                        id=uuid.uuid4(),
                        thread_id=thread.id,
                        role="assistant",
                        content=full_final,
                    )
                )
                await self.db.flush()
            else:
                try:
                    scan = await llm.chat_structured(
                        system_prompt=(
                            "You scan the user message and assistant reply. Identify "
                            "(1) contradictory requirements or conflicting facts, and "
                            "(2) missing requirements, unanswered questions, or "
                            "specification gaps. Return JSON only."
                        ),
                        user_prompt=(
                            f"User:\n{content}\n\nAssistant:\n{full}\n\n"
                            "List concrete findings. Use finding_type \"conflict\" for "
                            "contradictions and \"gap\" for missing or unclear coverage."
                        ),
                        json_schema=THREAD_FINDINGS_JSON_SCHEMA,
                        context=ctx,
                        call_type="thread_conflict_scan",
                    )
                    findings_list = _normalize_thread_findings(scan)
                    appendix = _findings_appendix(findings_list)
                    full_final = f"{full}\n\n{appendix}" if appendix else full
                except ApiError:
                    findings_list = []
                    appendix = ""
                    full_final = full

                self.db.add(
                    ThreadMessage(
                        id=uuid.uuid4(),
                        thread_id=thread.id,
                        role="assistant",
                        content=full_final,
                    )
                )
                await self.db.flush()

                if appendix:
                    for piece in _chunk_text_for_sse(appendix):
                        payload = json.dumps({"type": "token", "text": piece})
                        yield f"data: {payload}\n\n".encode()

        conflicts_out = _conflicts_from_findings(findings_list)

        patch_proposal: dict[str, Any] | None = None
        if not stream_failed and full.strip() and thread_intent != "ask":
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
                if thread_intent == "append":
                    raw_patch = await llm.chat_structured(
                        system_prompt=(
                            "You propose markdown to APPEND at the end of the section. "
                            "Return JSON only. Do not repeat the whole document."
                        ),
                        user_prompt=patch_prompt,
                        json_schema=THREAD_PATCH_APPEND_SCHEMA,
                        context=ctx,
                        call_type="thread_patch_append",
                    )
                    patch_proposal = _normalize_patch_proposal(
                        "append", raw_patch, snapshot=effective_snap, selection=selection_triple
                    )
                elif thread_intent == "replace_selection":
                    raw_patch = await llm.chat_structured(
                        system_prompt=(
                            "You propose replacement markdown for the user's selection only. "
                            "Return JSON only with replacement_markdown."
                        ),
                        user_prompt=patch_prompt,
                        json_schema=THREAD_PATCH_REPLACE_SCHEMA,
                        context=ctx,
                        call_type="thread_patch_replace",
                    )
                    patch_proposal = _normalize_patch_proposal(
                        "replace_selection",
                        raw_patch,
                        snapshot=effective_snap,
                        selection=selection_triple,
                    )
                else:  # edit
                    raw_patch = await llm.chat_structured(
                        system_prompt=(
                            "You propose replacing exactly one occurrence of old_snippet "
                            "in the section with new_snippet. Return JSON only."
                        ),
                        user_prompt=patch_prompt,
                        json_schema=THREAD_PATCH_EDIT_SCHEMA,
                        context=ctx,
                        call_type="thread_patch_edit",
                    )
                    patch_proposal = _normalize_patch_proposal(
                        "edit", raw_patch, snapshot=effective_snap, selection=selection_triple
                    )
            except ApiError:
                patch_proposal = {"error": "patch_structured_call_failed"}

        if not stream_failed:
            meta = json.dumps(
                {
                    "type": "meta",
                    "findings": findings_list,
                    "conflicts": conflicts_out,
                    "context_truncated": context_truncated,
                    "patch_proposal": patch_proposal,
                }
            )
            yield f"data: {meta}\n\n".encode()
        else:
            meta = json.dumps(
                {
                    "type": "meta",
                    "findings": [],
                    "conflicts": [],
                    "context_truncated": context_truncated,
                    "patch_proposal": None,
                }
            )
            yield f"data: {meta}\n\n".encode()

        yield b"data: [DONE]\n\n"
