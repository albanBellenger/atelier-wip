from app.models import LlmProviderRegistry
from app.services.llm_registry_status import (
    llm_registry_row_is_connected,
    normalize_llm_registry_status,
)


def test_normalize_llm_registry_status_empty() -> None:
    assert normalize_llm_registry_status(None) == ""
    assert normalize_llm_registry_status("") == ""
    assert normalize_llm_registry_status("   ") == ""


def test_normalize_llm_registry_status_trim_lower() -> None:
    assert normalize_llm_registry_status(" Connected ") == "connected"


def test_llm_registry_row_is_connected() -> None:
    row = LlmProviderRegistry(
        provider_id="openai",
        models_json="[]",
        status="Connected",
    )
    assert llm_registry_row_is_connected(row) is True
    row.status = "error"
    assert llm_registry_row_is_connected(row) is False
