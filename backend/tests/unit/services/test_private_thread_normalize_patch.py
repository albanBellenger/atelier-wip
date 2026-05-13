"""Unit: _normalize_patch_proposal guards."""

from app.services.private_thread_patch import _normalize_patch_proposal


def test_invalid_patch_response() -> None:
    p = _normalize_patch_proposal("append", [], snapshot="x", selection_excerpt=None)
    assert p.get("error") == "invalid_patch_response"


def test_empty_old_snippet() -> None:
    p = _normalize_patch_proposal(
        "edit",
        {"old_snippet": "", "new_snippet": "z"},
        snapshot="ab",
        selection_excerpt=None,
    )
    assert p.get("error") == "empty_old_snippet"


def test_append_ok() -> None:
    p = _normalize_patch_proposal(
        "append",
        {"markdown_to_append": "## More\n"},
        snapshot="x",
        selection_excerpt=None,
    )
    assert p["intent"] == "append"
    assert "## More" in p["markdown_to_append"]


def test_append_empty_error() -> None:
    p = _normalize_patch_proposal(
        "append",
        {"markdown_to_append": "   "},
        snapshot="x",
        selection_excerpt=None,
    )
    assert p.get("error") == "empty_append"


def test_replace_requires_selection() -> None:
    p = _normalize_patch_proposal(
        "replace_selection",
        {"replacement_markdown": "z"},
        snapshot="ab",
        selection_excerpt=None,
    )
    assert p.get("error") == "replace_requires_selection"


def test_replace_ok() -> None:
    p = _normalize_patch_proposal(
        "replace_selection",
        {"replacement_markdown": "Z"},
        snapshot="ab",
        selection_excerpt="a",
    )
    assert p["intent"] == "replace_selection"
    assert p["replacement_markdown"] == "Z"
    assert "selection_from" not in p


def test_edit_snippet_not_unique() -> None:
    p = _normalize_patch_proposal(
        "edit",
        {"old_snippet": "a", "new_snippet": "b"},
        snapshot="aaa",
        selection_excerpt=None,
    )
    assert p.get("error") == "old_snippet_must_match_exactly_once"
    assert p.get("occurrences") == 3


def test_edit_ok() -> None:
    p = _normalize_patch_proposal(
        "edit",
        {"old_snippet": "foo", "new_snippet": "bar"},
        snapshot="one foo two",
        selection_excerpt=None,
    )
    assert p["intent"] == "edit"
    assert p["old_snippet"] == "foo"
    assert p["new_snippet"] == "bar"
