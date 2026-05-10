"""Normalise structured LLM patch proposals for private-thread meta."""

from __future__ import annotations

from typing import Any, Literal


def _normalize_patch_proposal(
    intent: Literal["append", "replace_selection", "edit"],
    raw: object,
    *,
    snapshot: str,
    selection: tuple[int, int, str] | None,
) -> dict[str, Any]:
    """Return a JSON-serializable patch_proposal for meta, or {error: ...}."""
    if not isinstance(raw, dict):
        return {"error": "invalid_patch_response"}
    if intent == "append":
        md = str(raw.get("markdown_to_append") or "")
        if not md.strip():
            return {"error": "empty_append"}
        return {"intent": "append", "markdown_to_append": md}
    if intent == "replace_selection":
        if selection is None:
            return {"error": "replace_requires_selection"}
        rep = str(raw.get("replacement_markdown") if "replacement_markdown" in raw else "")
        return {
            "intent": "replace_selection",
            "replacement_markdown": rep,
            "selection_from": selection[0],
            "selection_to": selection[1],
        }
    old_s = str(raw.get("old_snippet") or "")
    new_s = str(raw.get("new_snippet") or "")
    if not old_s:
        return {"error": "empty_old_snippet"}
    count = snapshot.count(old_s)
    if count != 1:
        return {"error": "old_snippet_must_match_exactly_once", "occurrences": count}
    return {"intent": "edit", "old_snippet": old_s, "new_snippet": new_s}
