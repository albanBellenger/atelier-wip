"""LLM-derived citation coverage for a section."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CitationMissingItemOut(BaseModel):
    statement: str = Field(description="Claim or sentence lacking a traceable source")


class CitationHealthOut(BaseModel):
    citations_resolved: int = Field(ge=0)
    citations_missing: int = Field(ge=0)
    missing_items: list[CitationMissingItemOut] = Field(default_factory=list)
