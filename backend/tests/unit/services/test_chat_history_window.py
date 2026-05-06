"""Unit tests for chat history trimming helper."""

from __future__ import annotations

from unittest.mock import patch

from app.services.chat_history_window import (
    HISTORY_TRIM_NOTICE,
    trim_openai_chat_messages,
)


def test_history_trim_notice_constant_non_empty() -> None:
    assert HISTORY_TRIM_NOTICE.strip()


@patch("app.services.chat_history_window.trim_messages")
def test_trim_openai_chat_messages_detects_change(mock_trim) -> None:
    before = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]
    after = [{"role": "user", "content": "a"}]
    mock_trim.return_value = after
    out, trimmed = trim_openai_chat_messages(before, model="gpt-4o-mini", max_tokens=100)
    assert out == after
    assert trimmed is True
    mock_trim.assert_called_once()


@patch("app.services.chat_history_window.trim_messages")
def test_trim_openai_chat_messages_no_change(mock_trim) -> None:
    before = [{"role": "user", "content": "hello"}]
    mock_trim.return_value = list(before)
    out, trimmed = trim_openai_chat_messages(before, model="gpt-4o-mini", max_tokens=100)
    assert trimmed is False
    assert out == before
