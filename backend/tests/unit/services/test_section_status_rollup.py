"""Slice A — section status rollup precedence (TDD: implement ``rollup_section_status``)."""

from __future__ import annotations

import pytest

from app.services.section_status import rollup_section_status


@pytest.mark.parametrize(
    ("plaintext", "pair", "gap", "stale", "expected"),
    [
        # 1 — long content, no signals → ready
        ("x" * 50, False, False, False, "ready"),
        # 2 — short content, no signals → empty
        ("short", False, False, False, "empty"),
        # 3 — gap issue only, long content → gaps
        ("x" * 50, False, True, False, "gaps"),
        # 4 — pair conflict only → conflict (even with long content)
        ("x" * 50, True, False, False, "conflict"),
        # 5 — stale linked WO only → conflict
        ("x" * 50, False, False, True, "conflict"),
        # 6 — precedence: conflict beats gaps and empty (short text + gap + pair)
        ("hi", True, True, False, "conflict"),
    ],
)
def test_section_status_rollup_precedence(
    plaintext: str,
    pair: bool,
    gap: bool,
    stale: bool,
    expected: str,
) -> None:
    assert (
        rollup_section_status(
            effective_plaintext=plaintext,
            has_open_pair_conflict=pair,
            has_open_section_gap=gap,
            has_stale_linked_work_order=stale,
        )
        == expected
    )
