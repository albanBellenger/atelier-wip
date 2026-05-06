"""Build :class:`TokenContext` for embedding ``record_usage`` from domain rows."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Artifact, Project, Section, Software
from app.schemas.token_context import TokenContext


async def token_context_for_artifact(
    session: AsyncSession, artifact_id: uuid.UUID
) -> TokenContext | None:
    art = await session.get(Artifact, artifact_id)
    if art is None:
        return None
    pid = getattr(art, "project_id", None)
    if pid is not None:
        proj = await session.get(Project, pid)
        if proj is None:
            return None
        sw = await session.get(Software, proj.software_id)
        if sw is None:
            return None
        return TokenContext(
            studio_id=sw.studio_id,
            software_id=sw.id,
            project_id=proj.id,
            user_id=getattr(art, "uploaded_by", None),
        )
    lib_sw = getattr(art, "library_software_id", None)
    if lib_sw is not None:
        sw = await session.get(Software, lib_sw)
        if sw is None:
            return None
        return TokenContext(
            studio_id=sw.studio_id,
            software_id=sw.id,
            project_id=None,
            user_id=getattr(art, "uploaded_by", None),
        )
    lib_st = getattr(art, "library_studio_id", None)
    if lib_st is not None:
        return TokenContext(
            studio_id=lib_st,
            software_id=None,
            project_id=None,
            user_id=getattr(art, "uploaded_by", None),
        )
    return None


async def token_context_for_section(
    session: AsyncSession, section_id: uuid.UUID
) -> TokenContext | None:
    sec = await session.get(Section, section_id)
    if sec is None:
        return None
    spid = getattr(sec, "project_id", None)
    if spid is None:
        return None
    proj = await session.get(Project, spid)
    if proj is None:
        return None
    sw = await session.get(Software, proj.software_id)
    if sw is None:
        return None
    return TokenContext(
        studio_id=sw.studio_id,
        software_id=sw.id,
        project_id=proj.id,
        user_id=None,
    )


async def token_context_for_project(
    session: AsyncSession, project_id: uuid.UUID
) -> TokenContext | None:
    proj = await session.get(Project, project_id)
    if proj is None:
        return None
    sw = await session.get(Software, proj.software_id)
    if sw is None:
        return None
    return TokenContext(
        studio_id=sw.studio_id,
        software_id=sw.id,
        project_id=proj.id,
        user_id=None,
    )
