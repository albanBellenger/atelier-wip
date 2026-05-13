"""Validate editor selection against a plaintext snapshot for private thread API."""

from __future__ import annotations

from app.exceptions import ApiError

# Max chars injected into RAG for "## User-selected excerpt".
SELECTED_EXCERPT_RAG_MAX = 16_000


def validate_selection_against_snapshot(
    *,
    snapshot: str | None,
    selected_plaintext: str | None,
    require_unique_in_snapshot: bool,
) -> str | None:
    """
    When ``selected_plaintext`` is non-empty, validate it against ``snapshot``.

    ``require_unique_in_snapshot``: for ``replace_selection``, the substring must
    appear exactly once (non-overlapping ``str.count`` semantics).
    """
    if selected_plaintext is None or not selected_plaintext.strip():
        return None
    excerpt = selected_plaintext
    if snapshot is None:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="current_section_plaintext is required when selected_plaintext is sent.",
        )
    if require_unique_in_snapshot:
        c = snapshot.count(excerpt)
        if c != 1:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message=(
                    "Selected text must appear exactly once in the section markdown "
                    f"({c} occurrences)."
                ),
            )
    elif excerpt not in snapshot:
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="selected_plaintext does not appear in the section text.",
        )
    return excerpt


def excerpt_block_for_rag(excerpt: str) -> str:
    text = excerpt.strip()
    if len(text) > SELECTED_EXCERPT_RAG_MAX:
        text = text[:SELECTED_EXCERPT_RAG_MAX] + "\n…"
    return "## User-selected excerpt (for this question only)\n" + text + "\n"
