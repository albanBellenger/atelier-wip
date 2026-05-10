"""Private thread under a section — create, list, stream assistant reply."""

from __future__ import annotations

import json
import uuid
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.exceptions import ApiError
from app.models import PrivateThread, Project, Section, Software, ThreadMessage
from app.schemas.private_thread import (
    PrivateThreadStreamBody,
    ThreadFinding,
    normalize_thread_findings as _normalize_thread_findings,
)
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.chat_history_window import HISTORY_TRIM_NOTICE
from app.services.llm_service import LLMService, serialize_outbound_chat_messages_for_debug
from app.services.private_thread_patch import _normalize_patch_proposal
from app.services.private_thread_selection import (
    excerpt_block_for_rag,
    validate_selection_against_snapshot,
)
from app.services.rag_service import RAGService


def _findings_appendix(findings: list[ThreadFinding]) -> str:
    if not findings:
        return ""
    lines: list[str] = ["---", "**Conflicts and gaps**"]
    for f in findings:
        label = "Conflict" if f.finding_type == "conflict" else "Gap"
        lines.append(f"- **{label}:** {f.description}")
    return "\n".join(lines) + "\n"


def _conflicts_from_findings(findings: list[ThreadFinding]) -> list[dict[str, str]]:
    return [
        {"description": f.description}
        for f in findings
        if f.finding_type == "conflict"
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
        preferred_model: str | None = None,
    ) -> AsyncIterator[bytes]:
        """SSE chunks: JSON lines with type token | meta, then [DONE]."""
        await self.require_section_in_project(project_id, section_id)
        project = await self.db.get(Project, project_id)
        assert project is not None
        software = await self.db.get(Software, project.software_id)
        assert software is not None

        ctx = TokenUsageScope(
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

        llm = LLMService(self.db)
        openai_msgs, history_trimmed = await llm.trim_chat_messages_for_stream(
            openai_msgs,
            usage_scope=ctx,
            call_source="chat",
            preferred_model=preferred_model,
        )
        if history_trimmed:
            trim_row = ThreadMessage(
                id=uuid.uuid4(),
                thread_id=thread.id,
                role="assistant",
                content=HISTORY_TRIM_NOTICE,
            )
            self.db.add(trim_row)
            await self.db.flush()
            trim_evt = json.dumps(
                {
                    "type": "meta",
                    "history_trimmed": True,
                    "trim_notice": HISTORY_TRIM_NOTICE,
                    "trim_notice_message_id": str(trim_row.id),
                }
            )
            yield f"data: {trim_evt}\n\n".encode()

        rag = await RAGService(self.db).build_context(
            query=content,
            project_id=project_id,
            current_section_id=section_id,
            token_budget=6000,
            current_section_plaintext_override=current_section_plaintext,
            include_git_history=include_git_history,
        )
        rag_text = rag.text
        extra = await RAGService(self.db).plaintext_suffix_from_user_pins(
            project_id=project_id,
            section_id=section_id,
            user_id=user_id,
            max_extra_chars=6000,
        )
        if extra:
            rag_text = rag_text + extra
        context_truncated = rag.truncated
        excerpt_extra = ""
        if (
            include_selection_in_context
            and selection_triple is not None
            and selection_triple[2].strip()
        ):
            excerpt_extra = "\n\n" + excerpt_block_for_rag(selection_triple[2])

        from app.agents.private_thread_agent import PrivateThreadAgent

        thread_agent = PrivateThreadAgent(self.db, llm)
        persona = thread_agent.persona_for_command(command)
        system_prompt = persona + rag_text + excerpt_extra

        full_messages_for_debug: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            *[dict(m) for m in openai_msgs],
        ]

        stream_state: dict[str, Any] = {}
        buf: list[str] = []
        async for piece in thread_agent.stream_main_reply(
            system_prompt=system_prompt,
            openai_msgs=openai_msgs,
            ctx=ctx,
            stream_state=stream_state,
            preferred_model=preferred_model,
        ):
            buf.append(piece)
            payload = json.dumps({"type": "token", "text": piece})
            yield f"data: {payload}\n\n".encode()

        full = "".join(buf)
        stream_failed = bool(stream_state.get("stream_failed", False))

        if stream_failed:
            self.db.add(
                ThreadMessage(
                    id=uuid.uuid4(),
                    thread_id=thread.id,
                    role="assistant",
                    content="[error: LLM call failed]",
                )
            )
            await self.db.flush()

        findings_list: list[ThreadFinding] = []
        appendix = ""
        full_final = full
        last_main_assistant_id: uuid.UUID | None = None

        skip_conflict_scan = command == "improve"

        if not stream_failed and full.strip():
            if skip_conflict_scan:
                full_final = full
                main_asst_id = uuid.uuid4()
                self.db.add(
                    ThreadMessage(
                        id=main_asst_id,
                        thread_id=thread.id,
                        role="assistant",
                        content=full_final,
                    )
                )
                await self.db.flush()
                last_main_assistant_id = main_asst_id
            else:
                findings_list = await thread_agent.scan_for_findings(
                    user_message=content,
                    full_text=full,
                    ctx=ctx,
                )
                appendix = _findings_appendix(findings_list)
                full_final = f"{full}\n\n{appendix}" if appendix else full

                main_asst_id = uuid.uuid4()
                self.db.add(
                    ThreadMessage(
                        id=main_asst_id,
                        thread_id=thread.id,
                        role="assistant",
                        content=full_final,
                    )
                )
                await self.db.flush()
                last_main_assistant_id = main_asst_id

                if appendix:
                    for piece in _chunk_text_for_sse(appendix):
                        payload = json.dumps({"type": "token", "text": piece})
                        yield f"data: {payload}\n\n".encode()

        conflicts_out = _conflicts_from_findings(findings_list)

        patch_proposal: dict[str, Any] | None = None
        if (
            not stream_failed
            and full.strip()
            and thread_intent in ("append", "replace_selection", "edit")
        ):
            patch_proposal = await thread_agent.build_patch_proposal(
                intent=thread_intent,
                effective_snap=effective_snap,
                content=content,
                full=full,
                selection_triple=selection_triple,
                ctx=ctx,
            )

        if not stream_failed:
            meta_body: dict[str, Any] = {
                "type": "meta",
                "findings": [f.as_dict() for f in findings_list],
                "conflicts": conflicts_out,
                "context_truncated": context_truncated,
                "history_trimmed": history_trimmed,
                "patch_proposal": patch_proposal,
            }
            if last_main_assistant_id is not None:
                meta_body["assistant_message_id"] = str(last_main_assistant_id)
            if (
                get_settings().log_llm_prompts
                and last_main_assistant_id is not None
            ):
                resolved_model = await llm.resolved_chat_model_for_scope(
                    usage_scope=ctx,
                    call_source="private_thread",
                    preferred_model=preferred_model,
                )
                meta_body["llm_outbound_messages"] = (
                    serialize_outbound_chat_messages_for_debug(
                        full_messages_for_debug, model=resolved_model
                    )
                )
            meta = json.dumps(meta_body)
            yield f"data: {meta}\n\n".encode()
        else:
            meta = json.dumps(
                {
                    "type": "meta",
                    "findings": [],
                    "conflicts": [],
                    "context_truncated": context_truncated,
                    "history_trimmed": history_trimmed,
                    "patch_proposal": None,
                }
            )
            yield f"data: {meta}\n\n".encode()

        yield b"data: [DONE]\n\n"
