"""Token-aware chat history trimming via LiteLLM ``trim_messages``."""

from __future__ import annotations

import json
from typing import Any

from litellm.utils import trim_messages

# User-visible copy (persisted + pushed over WS/SSE when trimming occurs).
HISTORY_TRIM_NOTICE = "Earlier messages were trimmed to fit the model context."

# Default cap for *message list only* (system prompt reserved separately in callers).
DEFAULT_CHAT_HISTORY_MAX_TOKENS = 12_000


def history_trim_budget_tokens(max_context_tokens: int | None) -> int:
    """Map stored context size to a ``trim_messages`` budget for chat history only.

    When ``max_context_tokens`` is unknown, returns :data:`DEFAULT_CHAT_HISTORY_MAX_TOKENS`.
    """
    if max_context_tokens is None or max_context_tokens <= 0:
        return DEFAULT_CHAT_HISTORY_MAX_TOKENS
    reserve = max(8192, int(max_context_tokens * 0.22))
    budget = max_context_tokens - reserve
    return max(4096, budget)


def trim_openai_chat_messages(
    messages: list[dict[str, Any]],
    *,
    model: str,
    max_tokens: int = DEFAULT_CHAT_HISTORY_MAX_TOKENS,
    trim_ratio: float | None = 0.75,
) -> tuple[list[dict[str, Any]], bool]:
    """Return ``(trimmed_messages, was_trimmed)`` using LiteLLM tokenizer for ``model``.

    See https://docs.litellm.ai/docs/completion/message_trimming
    """
    if not messages:
        return [], False
    ratio = 0.75 if trim_ratio is None else trim_ratio
    out = trim_messages(
        messages,
        model=model,
        max_tokens=max_tokens,
        trim_ratio=ratio,
    )
    trimmed = _history_was_trimmed(messages, out)
    return out, trimmed


def _history_was_trimmed(
    before: list[dict[str, Any]], after: list[dict[str, Any]]
) -> bool:
    if len(after) != len(before):
        return True
    return json.dumps(before, sort_keys=True) != json.dumps(after, sort_keys=True)
