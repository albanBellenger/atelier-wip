"""Unit: _normalize_patch_proposal guards."""

from app.services.private_thread_service import _normalize_patch_proposal


def test_append_ok() -> None:
    p = _normalize_patch_proposal(
        "append",
        {"markdown_to_append": "## More\n"},
        snapshot="x",
        selection=None,
    )
    assert p["intent"] == "append"
    assert "## More" in p["markdown_to_append"]


def test_append_empty_error() -> None:
    p = _normalize_patch_proposal(
        "append",
        {"markdown_to_append": "   "},
        snapshot="x",
        selection=None,
    )
    assert p.get("error") == "empty_append"


def test_replace_requires_selection() -> None:
    p = _normalize_patch_proposal(
        "replace_selection",
        {"replacement_markdown": "z"},
        snapshot="ab",
        selection=None,
    )
    assert p.get("error") == "replace_requires_selection"


def test_replace_ok() -> None:
    p = _normalize_patch_proposal(
        "replace_selection",
        {"replacement_markdown": "Z"},
        snapshot="ab",
        selection=(0, 1, "a"),
    )
    assert p["intent"] == "replace_selection"
    assert p["selection_from"] == 0
    assert p["selection_to"] == 1
    assert p["replacement_markdown"] == "Z"


def test_edit_snippet_not_unique() -> None:
    p = _normalize_patch_proposal(
        "edit",
        {"old_snippet": "a", "new_snippet": "b"},
        snapshot="aaa",
        selection=None,
    )
    assert p.get("error") == "old_snippet_must_match_exactly_once"
    assert p.get("occurrences") == 3


def test_edit_ok() -> None:
    p = _normalize_patch_proposal(
        "edit",
        {"old_snippet": "foo", "new_snippet": "bar"},
        snapshot="one foo two",
        selection=None,
    )
    assert p["intent"] == "edit"
    assert p["old_snippet"] == "foo"
    assert p["new_snippet"] == "bar"
