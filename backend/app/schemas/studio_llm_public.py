"""Studio-scoped LLM read models for member-facing UI."""

from pydantic import BaseModel, Field


class StudioChatLlmModelsOut(BaseModel):
    """Chat routing + studio policy, limited to registry providers in ``connected`` status."""

    effective_model: str | None = None
    workspace_default_model: str | None = None
    allowed_models: list[str] = Field(default_factory=list)
    model_max_context_tokens: dict[str, int | None] = Field(
        default_factory=dict,
        description=(
            "Registry max_context_tokens per model id (Tool Admin / LiteLLM); "
            "null when unknown or legacy list-only registry."
        ),
    )
