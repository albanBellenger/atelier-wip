"""Unit: PrivateThreadStreamBody."""

import pytest
from pydantic import ValidationError

from app.schemas.private_thread import PrivateThreadStreamBody


def test_valid_selected_plaintext() -> None:
    b = PrivateThreadStreamBody(
        content="hi",
        selected_plaintext="bc",
        current_section_plaintext="abcd",
    )
    assert b.selected_plaintext == "bc"


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
