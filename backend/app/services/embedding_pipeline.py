"""Background embedding jobs for artifacts and sections."""

from __future__ import annotations

import asyncio
import uuid

import structlog
from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import Artifact, ArtifactChunk, Section, SectionChunk
from app.services.document_extract import extract_md_text, extract_pdf_text
from app.services.embedding_service import EmbeddingService, embedding_configured
from app.services.text_chunking import chunk_text
from app.storage.minio_storage import get_storage_client

log = structlog.get_logger("atelier.embed_pipeline")


async def run_artifact_embedding(session: AsyncSession, artifact_id: uuid.UUID) -> None:
    storage = get_storage_client()
    row = await session.get(Artifact, artifact_id)
    if row is None:
        return
    raw = await storage.get_bytes(row.storage_path)
    if row.file_type == "pdf":
        text = extract_pdf_text(raw)
    else:
        text = extract_md_text(raw)
    chunks = chunk_text(text)
    await session.execute(delete(ArtifactChunk).where(ArtifactChunk.artifact_id == artifact_id))
    if not chunks:
        await session.flush()
        return
    emb = EmbeddingService(session)
    vectors = await emb.embed_batch(chunks)
    for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True)):
        session.add(
            ArtifactChunk(
                artifact_id=artifact_id,
                chunk_index=i,
                content=chunk,
                embedding=vec,
            )
        )


async def run_section_embedding(session: AsyncSession, section_id: uuid.UUID) -> None:
    sec = await session.get(Section, section_id)
    if sec is None:
        return
    text = sec.content or ""
    await session.execute(delete(SectionChunk).where(SectionChunk.section_id == section_id))
    chunks = chunk_text(text)
    if not chunks:
        await session.flush()
        return
    emb = EmbeddingService(session)
    vectors = await emb.embed_batch(chunks)
    for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True)):
        session.add(
            SectionChunk(
                section_id=section_id,
                chunk_index=i,
                content=chunk,
                embedding=vec,
            )
        )


async def enqueue_artifact_embedding(artifact_id: uuid.UUID) -> None:
    """Run artifact embedding on the current event loop (e.g. FastAPI BackgroundTasks)."""
    async with async_session_factory() as session:
        try:
            if not await embedding_configured(session):
                return
            await run_artifact_embedding(session, artifact_id)
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception("artifact_embedding_failed", artifact_id=str(artifact_id))


def schedule_artifact_embedding(artifact_id: uuid.UUID) -> None:
    """Fire-and-forget when already inside a running event loop (not from a thread pool)."""
    asyncio.create_task(enqueue_artifact_embedding(artifact_id))


async def enqueue_section_embedding(section_id: uuid.UUID) -> None:
    """Run section embedding on the current event loop."""
    async with async_session_factory() as session:
        try:
            if not await embedding_configured(session):
                return
            await run_section_embedding(session, section_id)
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception("section_embedding_failed", section_id=str(section_id))


def schedule_section_embedding(section_id: uuid.UUID) -> None:
    asyncio.create_task(enqueue_section_embedding(section_id))


async def enqueue_sections_missing_embeddings_after_config() -> None:
    """After embedding is first configured, embed existing sections that have content but no chunks."""
    async with async_session_factory() as session:
        if not await embedding_configured(session):
            return
        no_chunks = ~exists(
            select(1).where(SectionChunk.section_id == Section.id)
        )
        q = select(Section.id).where(
            Section.content.isnot(None),
            Section.content != "",
            no_chunks,
        )
        ids = list((await session.execute(q)).scalars().all())
    for sid in ids:
        schedule_section_embedding(sid)
