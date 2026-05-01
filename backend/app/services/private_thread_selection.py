"""Validate editor selection against a plaintext snapshot for private thread API."""

from __future__ import annotations

from app.exceptions import ApiError

# Max chars injected into RAG for "## User-selected excerpt".
SELECTED_EXCERPT_RAG_MAX = 16_000


def validate_selection_against_snapshot(
    *,
    snapshot: str | None,
    selection_from: int | None,
    selection_to: int | None,
    selected_plaintext: str | None,
) -> tuple[int, int, str] | None:
    """
    Returns (from, to, excerpt) when selection is active, else None.
    snapshot must be the same document the client used for offsets (UTF-16 indices).
    """
    if selection_from is None and selection_to is None:
        return None
    if selection_from is None or selection_to is None:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="selection_from and selection_to must both be provided together.",
        )
    if selection_from > selection_to:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="selection_from must be less than or equal to selection_to.",
        )
    if snapshot is None:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="current_section_plaintext is required when selection bounds are sent.",
        )
    doc_len = len(snapshot)
    if selection_from < 0 or selection_to > doc_len:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Selection is out of range for the provided section text.",
        )
    slice_text = snapshot[selection_from:selection_to]
    if selected_plaintext is not None:
        if slice_text != selected_plaintext:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message="selected_plaintext does not match the section text at the given offsets.",
            )
        excerpt = selected_plaintext
    else:
        excerpt = slice_text
    if not excerpt.strip():
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Selection is empty.",
        )
    return (selection_from, selection_to, excerpt)


def excerpt_block_for_rag(excerpt: str) -> str:
    text = excerpt.strip()
    if len(text) > SELECTED_EXCERPT_RAG_MAX:
        text = text[:SELECTED_EXCERPT_RAG_MAX] + "\n…"
    return "## User-selected excerpt (for this question only)\n" + text + "\n"
