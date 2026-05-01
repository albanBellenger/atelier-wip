"""Structured section improve (Slice D)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.private_thread import PRIVATE_THREAD_SECTION_PLAINTEXT_MAX


class SectionImproveBody(BaseModel):
    instruction: str | None = Field(
        default=None,
        max_length=8000,
        description="Optional author hint for the revision.",
    )
    current_section_plaintext: str | None = Field(
        default=None,
        max_length=PRIVATE_THREAD_SECTION_PLAINTEXT_MAX,
        description="Live editor markdown; when omitted, server uses stored section text.",
    )


class SectionImproveOut(BaseModel):
    improved_markdown: str
