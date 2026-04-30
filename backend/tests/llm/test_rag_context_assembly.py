"""LLM regression: RAG context assembly (mandatory blocks + budget)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rag_service import RAGService

from tests.factories import (
    create_project,
    create_section,
    create_software,
    create_studio,
    create_user,
    add_studio_member,
)

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]

_DEF_MARKER = "RAGSOFTDEFMARKER_LLMSUITE"


async def test_rag_context_includes_definition_section_and_respects_budget(
    db_session: AsyncSession,
) -> None:
    owner = await create_user(
        db_session,
        email=f"rag-owner-{uuid.uuid4().hex[:10]}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name="RAG LLM Studio")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    software = await create_software(
        db_session,
        studio.id,
        name="RAG Software",
        definition=(
            f"{_DEF_MARKER} Task orchestration service with strict idempotency "
            "and audit logging."
        ),
    )
    project = await create_project(db_session, software.id, name="RAG Project")
    section_title = "Idempotent task dispatch"
    section = await create_section(
        db_session,
        project.id,
        title=section_title,
        slug="task-dispatch",
        order=0,
        content="Dispatch tasks with deduplication keys and retry policy.",
    )

    token_budget = 6000
    rag = await RAGService(db_session).build_context(
        query="",
        project_id=project.id,
        current_section_id=section.id,
        token_budget=token_budget,
    )
    text = rag.text
    assert isinstance(text, str)
    assert text

    assert "## Software definition" in text
    assert _DEF_MARKER in text
    assert section_title in text

    budget_chars = max(500, token_budget * 4)
    assert len(text) <= budget_chars + 8
