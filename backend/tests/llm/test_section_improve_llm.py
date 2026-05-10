"""LLM regression: structured section improve."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.section_service import SectionService

from tests.factories import (
    add_studio_member,
    create_project,
    create_section,
    create_software,
    create_studio,
    create_user,
)

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_section_improve_output_contains_fixture_keyword(
    db_session: AsyncSession,
) -> None:
    owner = await create_user(
        db_session,
        email=f"improve-owner-{uuid.uuid4().hex[:10]}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name="Improve LLM Studio")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    software = await create_software(
        db_session,
        studio.id,
        name="Improve Software",
        definition="Task runner with retries.",
    )
    project = await create_project(db_session, software.id, name="Improve Project")
    section = await create_section(
        db_session,
        project.id,
        title="Dispatch",
        slug="dispatch",
        order=0,
        content=(
            "## Notes\n"
            "The dispatch worker retries failed jobs with exponential backoff.\n"
        ),
    )

    out = await SectionService(db_session).improve_section_markdown(
        project.id,
        section.id,
        instruction="Keep the topic of dispatch and retries; tighten wording only.",
        current_section_plaintext=None,
        user_id=owner.id,
    )
    assert isinstance(out, str)
    assert "dispatch" in out.lower() or "retry" in out.lower()
