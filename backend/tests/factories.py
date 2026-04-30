"""Async ORM test factories — no raw SQL."""

from __future__ import annotations

import uuid

from faker import Faker
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Project,
    Section,
    Software,
    Studio,
    StudioMember,
    User,
    WorkOrder,
)
from app.models.work_order import WorkOrderSection
from app.security.passwords import hash_password

_faker = Faker()


async def create_user(
    session: AsyncSession,
    *,
    email: str | None = None,
    password: str = "llm-test-password-ok-1",
    display_name: str | None = None,
    is_tool_admin: bool = False,
) -> User:
    uid = uuid.uuid4()
    em = email or f"user-{uid.hex[:12]}@example.com"
    user = User(
        id=uid,
        email=em.lower(),
        password_hash=hash_password(password),
        display_name=display_name or _faker.name(),
        is_tool_admin=is_tool_admin,
    )
    session.add(user)
    await session.flush()
    return user


async def create_studio(
    session: AsyncSession,
    *,
    name: str | None = None,
    description: str | None = "test studio",
) -> Studio:
    studio = Studio(
        id=uuid.uuid4(),
        name=name or f"Studio {_faker.word()}",
        description=description,
    )
    session.add(studio)
    await session.flush()
    return studio


async def add_studio_member(
    session: AsyncSession,
    studio_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    role: str,
) -> StudioMember:
    row = StudioMember(studio_id=studio_id, user_id=user_id, role=role)
    session.add(row)
    await session.flush()
    return row


async def create_software(
    session: AsyncSession,
    studio_id: uuid.UUID,
    *,
    name: str | None = None,
    definition: str | None = None,
) -> Software:
    sw = Software(
        id=uuid.uuid4(),
        studio_id=studio_id,
        name=name or f"Software {_faker.word()}",
        description="test",
        definition=definition,
    )
    session.add(sw)
    await session.flush()
    return sw


async def create_project(
    session: AsyncSession,
    software_id: uuid.UUID,
    *,
    name: str | None = None,
    description: str | None = None,
) -> Project:
    pr = Project(
        id=uuid.uuid4(),
        software_id=software_id,
        name=name or "LLM Test Project",
        description=description,
    )
    session.add(pr)
    await session.flush()
    return pr


async def create_section(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    title: str,
    slug: str,
    order: int,
    content: str = "",
) -> Section:
    sec = Section(
        id=uuid.uuid4(),
        project_id=project_id,
        title=title,
        slug=slug,
        order=order,
        content=content,
        yjs_state=None,
    )
    session.add(sec)
    await session.flush()
    return sec


async def create_work_order_linked_to_section(
    session: AsyncSession,
    project_id: uuid.UUID,
    section_id: uuid.UUID,
    *,
    title: str,
    description: str,
    acceptance_criteria: str | None = "Initial acceptance criteria.",
    implementation_guide: str | None = "Initial implementation guide.",
    status: str = "backlog",
    created_by: uuid.UUID | None = None,
) -> WorkOrder:
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=project_id,
        title=title,
        description=description,
        implementation_guide=implementation_guide,
        acceptance_criteria=acceptance_criteria,
        status=status,
        created_by=created_by,
    )
    session.add(wo)
    await session.flush()
    session.add(WorkOrderSection(work_order_id=wo.id, section_id=section_id))
    await session.flush()
    return wo
