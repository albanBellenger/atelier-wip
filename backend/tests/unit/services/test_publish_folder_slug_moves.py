"""Pure helpers for GitLab publish-folder moves."""

from __future__ import annotations

from app.services.git_service import moves_for_prefix_rename


def test_moves_for_prefix_rename_orders_deepest_first() -> None:
    blobs = [
        "alpha/sections/a.md",
        "alpha/work-orders/u.md",
        "alpha/deep/nested/file.md",
    ]
    moves = moves_for_prefix_rename("alpha", "beta", blobs)
    precedences = [m[0] for m in moves]
    assert precedences[0] == "alpha/deep/nested/file.md"
    assert len(moves) == 3
    assert moves[0][1] == "beta/deep/nested/file.md"


def test_moves_single_segment_prefix() -> None:
    moves = moves_for_prefix_rename("old", "new", ["old/x.md"])
    assert moves == [("old/x.md", "new/x.md")]
