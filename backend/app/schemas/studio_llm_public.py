"""Studio-scoped LLM read models for member-facing UI."""

from pydantic import BaseModel, Field


class StudioChatLlmModelsOut(BaseModel):
    """Chat routing + studio policy, limited to registry providers in ``connected`` status."""

    effective_model: str | None = None
    workspace_default_model: str | None = None
    allowed_models: list[str] = Field(default_factory=list)
