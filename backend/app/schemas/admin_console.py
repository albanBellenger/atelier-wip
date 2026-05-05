"""Tool-admin console APIs (overview, activity, LLM connectivity, embeddings)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.auth import AdminConfigResponse
from app.schemas.studio_budget_overage import StudioBudgetOverageAction


class DeploymentActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    actor_user_id: UUID | None
    action: str
    target_type: str | None
    target_id: UUID | None
    summary: str | None


class StudioOverviewRowOut(BaseModel):
    studio_id: UUID
    name: str
    software_count: int
    member_count: int
    mtd_spend_usd: Decimal
    budget_cap_monthly_usd: Decimal | None
    budget_overage_action: str


class AdminConsoleOverviewOut(BaseModel):
    studios: list[StudioOverviewRowOut]
    mtd_spend_total_usd: Decimal
    active_builders_count: int
    embedding_collection_count: int
    recent_activity: list[DeploymentActivityOut]


class LlmProviderRegistryOut(BaseModel):
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


class LlmProviderRegistryUpsert(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    models: list[str] = Field(min_length=1)
    api_base_url: str | None = Field(default=None, max_length=512)
    status: str = "connected"
    is_default: bool = False
    sort_order: int = 0


class LlmDeploymentOut(BaseModel):
    """Tool-admin LLM page: singleton credentials + provider registry in one response."""

    credentials: AdminConfigResponse
    providers: list[LlmProviderRegistryOut]


class StudioLlmPolicyRowOut(BaseModel):
    provider_key: str
    enabled: bool
    selected_model: str | None


class StudioLlmPolicyPatch(BaseModel):
    rows: list[StudioLlmPolicyRowOut]


class LlmRoutingRuleOut(BaseModel):
    use_case: str
    primary_model: str
    fallback_model: str | None


class LlmRoutingRulePatch(BaseModel):
    rules: list[LlmRoutingRuleOut]


class StudioGitLabOut(BaseModel):
    git_provider: str | None
    git_repo_url: str | None
    git_branch: str | None
    git_publish_strategy: str | None
    git_token_set: bool


class StudioGitLabPatch(BaseModel):
    git_provider: str | None = None
    git_repo_url: str | None = None
    git_branch: str | None = None
    git_publish_strategy: str | None = None
    git_token: str | None = None


class StudioToolAdminPatch(BaseModel):
    budget_cap_monthly_usd: Decimal | None = None
    budget_overage_action: StudioBudgetOverageAction | None = None


class MemberBudgetRowOut(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    role: str
    budget_cap_monthly_usd: Decimal | None
    mtd_spend_usd: Decimal


class MemberBudgetPatch(BaseModel):
    budget_cap_monthly_usd: Decimal | None = None


class AdminEmbeddingLibraryStudioOut(BaseModel):
    """Per-studio aggregates for the artifact + section vector indexes (admin embeddings UI)."""

    studio_id: UUID
    studio_name: str
    artifact_count: int
    embedded_artifact_count: int
    artifact_vector_chunks: int
    section_vector_chunks: int


class EmbeddingModelRegistryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    model_id: str
    provider_name: str
    dim: int
    cost_per_million_usd: Decimal | None
    region: str | None
    default_role: str | None


class EmbeddingModelRegistryUpsert(BaseModel):
    model_id: str = Field(min_length=1, max_length=256)
    provider_name: str = Field(min_length=1, max_length=128)
    dim: int = Field(ge=1, le=16384)
    cost_per_million_usd: Decimal | None = None
    region: str | None = None
    default_role: str | None = None


class EmbeddingReindexPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    auto_reindex_trigger: str
    debounce_seconds: int
    drift_threshold_pct: Decimal
    retention_days: int


class EmbeddingReindexPolicyPatch(BaseModel):
    auto_reindex_trigger: str | None = Field(default=None, max_length=64)
    debounce_seconds: int | None = Field(default=None, ge=0, le=86400)
    drift_threshold_pct: Decimal | None = Field(default=None, ge=0, le=100)
    retention_days: int | None = Field(default=None, ge=1, le=3650)


class AdminUserDirectoryRowOut(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    is_tool_admin: bool
    created_at: datetime
    studio_memberships: list[dict[str, str | UUID]]
