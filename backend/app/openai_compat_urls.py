"""OpenAI-compatible API URLs from an optional root (e.g. ``https://api.openai.com/v1``)."""

DEFAULT_OPENAI_V1_BASE = "https://api.openai.com/v1"


def openai_v1_base(api_base_url: str | None) -> str:
    """Return trimmed base URL, or the default OpenAI ``…/v1`` root when unset."""
    b = (api_base_url or "").strip().rstrip("/")
    return b if b else DEFAULT_OPENAI_V1_BASE


def chat_completions_url(api_base_url: str | None) -> str:
    return f"{openai_v1_base(api_base_url)}/chat/completions"


def embeddings_url(api_base_url: str | None) -> str:
    return f"{openai_v1_base(api_base_url)}/embeddings"
