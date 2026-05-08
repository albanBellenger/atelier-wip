"""Unit tests for chat history trimming helper."""

from __future__ import annotations

from unittest.mock import patch

from app.services.chat_history_window import (
    DEFAULT_CHAT_HISTORY_MAX_TOKENS,
    HISTORY_TRIM_NOTICE,
    history_trim_budget_tokens,
    trim_openai_chat_messages,
)


def test_history_trim_notice_constant_non_empty() -> None:
    assert HISTORY_TRIM_NOTICE.strip()


def test_history_trim_budget_tokens_unknown_uses_default() -> None:
    assert history_trim_budget_tokens(None) == DEFAULT_CHAT_HISTORY_MAX_TOKENS
    assert history_trim_budget_tokens(0) == DEFAULT_CHAT_HISTORY_MAX_TOKENS


def test_history_trim_budget_tokens_reserves_headroom() -> None:
    assert history_trim_budget_tokens(100_000) > DEFAULT_CHAT_HISTORY_MAX_TOKENS


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
