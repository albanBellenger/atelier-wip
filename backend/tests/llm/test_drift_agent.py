"""LLM regression: drift marks linked work orders stale (real LLM)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.drift_agent import DriftAgent
from app.models import WorkOrder
from app.services.llm_service import LLMService

from tests.factories import (
    add_studio_member,
    create_project,
    create_section,
    create_software,
    create_studio,
    create_user,
    create_work_order_linked_to_section,
)

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_section_change_triggers_stale_work_order_via_drift_agent(
    db_session: AsyncSession,
) -> None:
    owner = await create_user(
        db_session,
        email=f"drift-owner-{uuid.uuid4().hex[:10]}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name="Drift LLM Studio")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    software = await create_software(
        db_session,
        studio.id,
        name="Drift SW",
        definition="Authentication is required for all sessions.",
    )
    project = await create_project(db_session, software.id, name="Drift Project")
    section = await create_section(
        db_session,
        project.id,
        title="Auth requirements",
        slug="auth-req",
        order=0,
        content=(
            "Users MUST sign in with email and password before accessing "
            "any protected resource."
        ),
    )
    wo = await create_work_order_linked_to_section(
        db_session,
        project.id,
        section.id,
        title="Implement email and password login",
        description=(
            "Add a standard login form with email and password, session cookies, "
            "and protected routes for authenticated users."
        ),
        acceptance_criteria=(
            "Given valid credentials, the user reaches the dashboard; "
            "given invalid credentials, login is rejected."
        ),
        created_by=owner.id,
    )

    section.content = (
        "Authentication has been removed. All pages are public; "
        "anonymous access is mandatory. Do not implement login."
    )
    await db_session.flush()

    llm = LLMService(db_session)
    await DriftAgent(db_session, llm).run_after_section_change(section.id)
    await db_session.flush()

    reloaded = await db_session.get(WorkOrder, wo.id)
    assert reloaded is not None
    assert reloaded.is_stale is True
    assert isinstance(reloaded.stale_reason, str)
    assert reloaded.stale_reason.strip()
