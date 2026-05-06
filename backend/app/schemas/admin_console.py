"""Tool-admin console APIs (overview, activity, LLM connectivity, embeddings)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.auth import AdminConfigResponse
from app.schemas.studio_budget_overage import StudioBudgetOverageAction


class DeploymentActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    actor_user_id: UUID | None
    action: str
    target_type: str | None
    target_id: UUID | None
    summary: str | None


class StudioOverviewRowResponse(BaseModel):
    studio_id: UUID
    name: str
    description: str | None = None
    created_at: datetime
    software_count: int
    member_count: int
    mtd_spend_usd: Decimal
    budget_cap_monthly_usd: Decimal | None
    budget_overage_action: str


class AdminConsoleOverviewResponse(BaseModel):
    studios: list[StudioOverviewRowResponse]
    mtd_spend_total_usd: Decimal
    active_builders_count: int
    embedding_collection_count: int
    recent_activity: list[DeploymentActivityResponse]


class LlmProviderRegistryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider_key: str
    display_name: str
    models: list[str]
    api_base_url: str | None
    logo_url: str | None = None
    status: str
    is_default: bool
    sort_order: int
    llm_api_key_set: bool = False
    llm_api_key_hint: str | None = None
    litellm_provider_slug: str | None = None


class LlmProviderRegistryUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    models: list[str] = Field(min_length=1)
    api_base_url: str | None = Field(default=None, max_length=512)
    status: str = "connected"
    is_default: bool = False
    sort_order: int = 0
    llm_api_key: str | None = None
    litellm_provider_slug: str | None = Field(default=None, max_length=64)


class LlmDeploymentResponse(BaseModel):
    """Tool-admin LLM page: singleton credentials + provider registry in one response."""

    credentials: AdminConfigResponse
    providers: list[LlmProviderRegistryResponse]


class StudioLlmPolicyRowResponse(BaseModel):
    provider_key: str
    enabled: bool
    selected_model: str | None


class StudioLlmPolicyUpdate(BaseModel):
    rows: list[StudioLlmPolicyRowResponse]


class LlmRoutingRuleResponse(BaseModel):
    use_case: str
    primary_model: str
    fallback_model: str | None


class LlmRoutingRuleUpdate(BaseModel):
    rules: list[LlmRoutingRuleResponse]


class LlmModelSuggestionItem(BaseModel):
    """Single model id suggestion for Tool Admin pickers (no secrets)."""

    id: str
    label: str | None = None
    provider: str | None = None
    source: str  # "upstream" | "catalog"


class LlmModelSuggestionsResponse(BaseModel):
    models: list[LlmModelSuggestionItem]
    warning: str | None = None


class StudioGitLabResponse(BaseModel):
    git_provider: str | None
    git_repo_url: str | None
    git_branch: str | None
    git_publish_strategy: str | None
    git_token_set: bool


class AdminStudioDetailResponse(BaseModel):
    """Tool-admin studio detail: profile, aggregates, GitLab summary."""

    id: UUID
    name: str
    description: str | None
    logo_path: str | None
    created_at: datetime
    budget_cap_monthly_usd: Decimal | None
    budget_overage_action: str
    software_count: int
    member_count: int
    mtd_spend_usd: Decimal
    gitlab: StudioGitLabResponse


class StudioGitLabUpdate(BaseModel):
    git_provider: str | None = None
    git_repo_url: str | None = None
    git_branch: str | None = None
    git_publish_strategy: str | None = None
    git_token: str | None = None


class StudioToolAdminUpdate(BaseModel):
    budget_cap_monthly_usd: Decimal | None = None
    budget_overage_action: StudioBudgetOverageAction | None = None


class MemberBudgetRowResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    role: str
    budget_cap_monthly_usd: Decimal | None
    mtd_spend_usd: Decimal


class MemberBudgetUpdate(BaseModel):
    budget_cap_monthly_usd: Decimal | None = None


class AdminEmbeddingLibraryStudioResponse(BaseModel):
    """Per-studio aggregates for the artifact + section vector indexes (admin embeddings UI)."""

    studio_id: UUID
    studio_name: str
    artifact_count: int
    embedded_artifact_count: int
    artifact_vector_chunks: int
    section_vector_chunks: int


class EmbeddingModelRegistryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    model_id: str
    provider_name: str
    dim: int
    cost_per_million_usd: Decimal | None
    region: str | None
    default_role: str | None
    litellm_provider_slug: str | None = None


class EmbeddingModelRegistryUpdate(BaseModel):
    model_id: str = Field(min_length=1, max_length=256)
    provider_name: str = Field(min_length=1, max_length=128)
    dim: int = Field(ge=1, le=16384)
    cost_per_million_usd: Decimal | None = None
    region: str | None = None
    default_role: str | None = None
    litellm_provider_slug: str | None = Field(default=None, max_length=64)


class EmbeddingReindexPolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    auto_reindex_trigger: str
    debounce_seconds: int
    drift_threshold_pct: Decimal
    retention_days: int


class EmbeddingReindexPolicyUpdate(BaseModel):
    auto_reindex_trigger: str | None = Field(default=None, max_length=64)
    debounce_seconds: int | None = Field(default=None, ge=0, le=86400)
    drift_threshold_pct: Decimal | None = Field(default=None, ge=0, le=100)
    retention_days: int | None = Field(default=None, ge=1, le=3650)


class AdminUserDirectoryRowResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    is_tool_admin: bool
    created_at: datetime
    studio_memberships: list[dict[str, str | UUID]]
