"""Resolve provider brand icon URL for the admin LLM registry (no secrets)."""

from __future__ import annotations

from urllib.parse import urlparse

# Known labs → canonical domain for DuckDuckGo icon CDN (ip3/{host}.ico).
_PROVIDER_ID_DOMAINS: dict[str, str] = {
    "openai": "openai.com",
    "anthropic": "anthropic.com",
    "google": "google.com",
    "gemini": "google.com",
    "azure": "microsoft.com",
    "mistral": "mistral.ai",
    "mistralai": "mistral.ai",
    "cohere": "cohere.com",
    "groq": "groq.com",
    "xai": "x.ai",
    "deepseek": "deepseek.com",
    "meta": "meta.com",
    "perplexity": "perplexity.ai",
    "huggingface": "huggingface.co",
    "hf": "huggingface.co",
    "together": "together.ai",
    "fireworks": "fireworks.ai",
    "ollama": "ollama.com",
}


def _host_from_api_base(api_base_url: str | None) -> str | None:
    if not api_base_url or not str(api_base_url).strip():
        return None
    raw = str(api_base_url).strip()
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    host = (parsed.hostname or "").strip().lower()
    return host or None


def _ddg_icon_url(host: str) -> str:
    return f"https://icons.duckduckgo.com/ip3/{host}.ico"


def resolve_llm_provider_logo_url(
    *,
    provider_id: str,
    api_base_url: str | None,
) -> str | None:
    """Return a stable favicon-style URL, or None if we cannot infer a host."""
    host = _host_from_api_base(api_base_url)
    if host:
        return _ddg_icon_url(host)
    pk = (provider_id or "").strip().lower()
    domain = _PROVIDER_ID_DOMAINS.get(pk)
    if domain:
        return _ddg_icon_url(domain)
    return None
