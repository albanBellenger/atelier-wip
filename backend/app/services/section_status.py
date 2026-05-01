"""Pure section readiness rollup (Slice A)."""

from __future__ import annotations

from typing import Literal

SectionStatusLiteral = Literal["ready", "gaps", "conflict", "empty"]


def rollup_section_status(
    *,
    effective_plaintext: str,
    has_open_pair_conflict: bool,
    has_open_section_gap: bool,
    has_stale_linked_work_order: bool,
) -> SectionStatusLiteral:
    """Precedence: conflict > gaps > empty > ready."""
    if has_open_pair_conflict or has_stale_linked_work_order:
        return "conflict"
    if has_open_section_gap:
        return "gaps"
    if len(effective_plaintext.strip()) < 50:
        return "empty"
    return "ready"
