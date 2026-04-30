"""Private thread under a section — create, list, stream assistant reply."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import PrivateThread, Project, Section, Software, ThreadMessage
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService

THREAD_CONFLICT_JSON_SCHEMA: dict = {
    "name": "thread_conflicts",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "conflicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "description": {"type": "string"},
                    },
                    "required": ["description"],
                },
            }
        },
        "required": ["conflicts"],
    },
}


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

    async def stream_assistant(
        self,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
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
        )
        rag_text = rag.text
        context_truncated = rag.truncated
        system_prompt = (
            "You are a concise assistant for specification and implementation questions. "
            "Ground answers in the context when relevant.\n\n"
            + rag_text
        )

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
            if full.strip():
                self.db.add(
                    ThreadMessage(
                        id=uuid.uuid4(),
                        thread_id=thread.id,
                        role="assistant",
                        content=full,
                    )
                )
                await self.db.flush()
        except Exception:
            stream_failed = True
            self.db.add(
                ThreadMessage(
                    id=uuid.uuid4(),
                    thread_id=thread.id,
                    role="assistant",
                    content="[error: LLM call failed]",
                )
            )
            await self.db.flush()
            # Response headers may already be sent; do not re-raise (breaks ASGI).
        if not stream_failed:
            try:
                scan = await llm.chat_structured(
                    system_prompt=(
                        "You scan a user question and assistant reply for contradictory "
                        "requirements or conflicting facts. Return JSON only."
                    ),
                    user_prompt=(
                        f"User:\n{content}\n\nAssistant:\n{full}\n\n"
                        "List concrete conflicts, if any."
                    ),
                    json_schema=THREAD_CONFLICT_JSON_SCHEMA,
                    context=ctx,
                    call_type="thread_conflict_scan",
                )
                conflicts = scan.get("conflicts") if isinstance(scan, dict) else []
                if not isinstance(conflicts, list):
                    conflicts = []
                meta = json.dumps(
                    {
                        "type": "meta",
                        "conflicts": conflicts,
                        "context_truncated": context_truncated,
                    }
                )
                yield f"data: {meta}\n\n".encode()
            except ApiError:
                meta = json.dumps(
                    {
                        "type": "meta",
                        "conflicts": [],
                        "context_truncated": context_truncated,
                    }
                )
                yield f"data: {meta}\n\n".encode()
        else:
            meta = json.dumps(
                {
                    "type": "meta",
                    "conflicts": [],
                    "context_truncated": context_truncated,
                }
            )
            yield f"data: {meta}\n\n".encode()

        yield b"data: [DONE]\n\n"
