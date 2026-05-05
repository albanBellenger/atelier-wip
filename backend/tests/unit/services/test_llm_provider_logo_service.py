"""Unit tests for LLM provider logo URL resolution."""

from app.services.llm_provider_logo_service import resolve_llm_provider_logo_url


def test_resolve_from_api_base_extracts_host() -> None:
    url = resolve_llm_provider_logo_url(
        provider_key="custom",
        api_base_url="https://eu.example.com/v1",
    )
    assert url is not None
    assert "eu.example.com" in url
    assert url.startswith("https://icons.duckduckgo.com/ip3/")


def test_resolve_from_provider_key_openai() -> None:
    url = resolve_llm_provider_logo_url(
        provider_key="openai",
        api_base_url=None,
    )
    assert url == "https://icons.duckduckgo.com/ip3/openai.com.ico"


def test_resolve_unknown_without_host_returns_none() -> None:
    assert (
        resolve_llm_provider_logo_url(
            provider_key="unknown_vendor_xyz",
            api_base_url=None,
        )
        is None
    )
