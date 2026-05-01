"""Unit: PrivateThreadStreamBody selection fields."""

import pytest
from pydantic import ValidationError

from app.schemas.private_thread import PrivateThreadStreamBody


def test_selection_both_required() -> None:
    with pytest.raises(ValidationError):
        PrivateThreadStreamBody(
            content="hi",
            selection_from=1,
            selection_to=None,
        )


def test_valid_selection_bounds() -> None:
    b = PrivateThreadStreamBody(
        content="hi",
        selection_from=1,
        selection_to=3,
        selected_plaintext="bc",
        current_section_plaintext="abcd",
    )
    assert b.selection_from == 1
    assert b.selection_to == 3


def test_command_requires_ask_intent() -> None:
    with pytest.raises(ValidationError):
        PrivateThreadStreamBody(
            content="hi",
            thread_intent="append",
            command="improve",
        )


def test_command_default_none() -> None:
    b = PrivateThreadStreamBody(content="hi")
    assert b.command == "none"
