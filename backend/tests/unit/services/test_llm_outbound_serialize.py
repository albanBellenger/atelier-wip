"""serialize_outbound_chat_messages_for_debug (no database)."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.llm_service import serialize_outbound_chat_messages_for_debug


def _patch_sum_content_token_counter(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cumulative token count = sum of string lengths of message contents (deterministic)."""

    def fake_tc(*, model: str = "", messages: list[Any] | None = None, **kwargs: Any) -> int:
        total = 0
        for m in messages or []:
            c = m.get("content")
            total += len(c) if isinstance(c, str) else len(str(c))
        return total

    monkeypatch.setattr("app.services.llm_service.litellm_token_counter", fake_tc)


def test_serialize_outbound_chat_messages_for_debug_truncates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.llm_service._MAX_LLM_LOG_MESSAGE_CHARS", 4)
    out = serialize_outbound_chat_messages_for_debug(
        [{"role": "user", "content": "abcdef"}]
    )
    assert out[0]["role"] == "user"
    assert out[0]["content"] == "abcd…[truncated]"
    assert "tokens" not in out[0]


def test_serialize_outbound_chat_messages_for_debug_includes_tokens_when_model_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_sum_content_token_counter(monkeypatch)
    out = serialize_outbound_chat_messages_for_debug(
        [
            {"role": "system", "content": "aa"},
            {"role": "user", "content": "bbb"},
        ],
        model="gpt-test",
    )
    assert out[0]["tokens"] == 2
    assert out[1]["tokens"] == 3


def test_serialize_outbound_omits_tokens_when_counter_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(**kwargs: Any) -> int:
        raise RuntimeError("no tokenizer")

    monkeypatch.setattr("app.services.llm_service.litellm_token_counter", boom)
    out = serialize_outbound_chat_messages_for_debug(
        [{"role": "user", "content": "x"}],
        model="unknown/x",
    )
    assert out[0]["role"] == "user"
    assert "tokens" not in out[0]
