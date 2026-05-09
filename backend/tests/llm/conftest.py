"""Shared fixtures for @pytest.mark.llm regression tests."""

from __future__ import annotations

import json
import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmbeddingDimensionState, LlmProviderRegistry, LlmRoutingRule
from app.security.field_encryption import encode_admin_stored_secret
from app.security.jwt import create_access_token

from tests.factories import (
    add_studio_member,
    create_project,
    create_section,
    create_software,
    create_studio,
    create_user,
)


@pytest.fixture(autouse=True)
def _require_llm_env(request: pytest.FixtureRequest) -> None:
    if request.node.get_closest_marker("llm") is None:
        return
    if os.environ.get("SKIP_LLM", "").lower() in ("1", "true", "yes"):
        pytest.skip("SKIP_LLM is set")
    if not (
        (os.environ.get("LLM_API_KEY") or "").strip()
        or (os.environ.get("OPENAI_API_KEY") or "").strip()
    ):
        pytest.skip("LLM_API_KEY or OPENAI_API_KEY required for LLM regression tests")


@pytest_asyncio.fixture(autouse=True)
async def llm_admin_config(db_session: AsyncSession) -> None:
    """Sync LLM registry + embeddings routing from env for real provider calls."""
    dim_row = await db_session.get(EmbeddingDimensionState, 1)
    if dim_row is None:
        dim_row = EmbeddingDimensionState(id=1)
        db_session.add(dim_row)
    dim_row.observed_dim = dim_row.observed_dim or 1536

    key = (
        (os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or "")
        .strip()
    )
    model = (
        (os.environ.get("LLM_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini")
        .strip()
    )
    emb_model = (
        os.environ.get("EMBEDDING_MODEL")
        or os.environ.get("OPENAI_EMBEDDING_MODEL")
        or "text-embedding-3-small"
    ).strip()

    await db_session.execute(delete(LlmRoutingRule))
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    models_payload = json.dumps([model, emb_model])
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json=models_payload,
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=True,
            sort_order=0,
            api_key=encode_admin_stored_secret(key) if key else None,
            litellm_provider_slug="openai",
        )
    )
    db_session.add(
        LlmRoutingRule(use_case="chat", primary_model=model, fallback_model=None),
    )
    db_session.add(
        LlmRoutingRule(
            use_case="embeddings",
            primary_model=emb_model,
            fallback_model=None,
        ),
    )
    db_session.add(
        LlmRoutingRule(use_case="code_gen", primary_model=model, fallback_model=None),
    )
    db_session.add(
        LlmRoutingRule(
            use_case="classification", primary_model=model, fallback_model=None
        ),
    )
    await db_session.flush()


@pytest_asyncio.fixture
async def studio_member(db_session: AsyncSession) -> dict[str, object]:
    """User with home-studio Builder role; Cookie header for httpx.AsyncClient."""
    sfx = uuid.uuid4().hex[:10]
    password = "llm-test-password-ok-1"
    admin = await create_user(
        db_session,
        email=f"llm-admin-{sfx}@example.com",
        password=password,
        display_name="LLM Admin",
    )
    member = await create_user(
        db_session,
        email=f"llm-member-{sfx}@example.com",
        password=password,
        display_name="LLM Member",
    )
    studio = await create_studio(db_session, name=f"LLM Studio {sfx}")
    await add_studio_member(db_session, studio.id, admin.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, member.id, role="studio_member")
    token = create_access_token(member.id)
    return {
        "user_id": member.id,
        "headers": {"Cookie": f"atelier_token={token}"},
        "studio_id": studio.id,
        "email": member.email,
        "password": password,
    }


@pytest_asyncio.fixture
async def section_with_content(
    db_session: AsyncSession,
    studio_member: dict[str, object],
) -> dict[str, object]:
    """Single section with rich content and keywords for semantic WO title checks."""
    studio_id = studio_member["studio_id"]
    assert isinstance(studio_id, uuid.UUID)
    software = await create_software(
        db_session,
        studio_id,
        name="LLM WO Software",
        definition=(
            "The product is a task tracker. Prioritize reliability and "
            "clear acceptance criteria for every feature."
        ),
    )
    project = await create_project(db_session, software.id, name="WO Gen Project")
    title = "Widget reliability module"
    content = (
        "## Overview\n"
        "Implement the widget reliability module: retries, timeouts, and "
        "structured logging for every widget operation.\n\n"
        "## Requirements\n"
        "- Widget state must recover after network failures.\n"
        "- Expose metrics for widget failures.\n"
    )
    section = await create_section(
        db_session,
        project.id,
        title=title,
        slug="widget-reliability",
        order=0,
        content=content,
    )
    return {
        "id": section.id,
        "project_id": project.id,
        "title": title,
        "expected_keywords": ["widget", "reliability", "module"],
    }


@pytest_asyncio.fixture
async def project_with_contradictory_sections(
    db_session: AsyncSession,
    studio_member: dict[str, object],
) -> dict[str, object]:
    """Two sections with explicit contradictory requirements for conflict analysis."""
    studio_id = studio_member["studio_id"]
    assert isinstance(studio_id, uuid.UUID)
    software = await create_software(
        db_session,
        studio_id,
        name="Conflict Test Software",
        definition="Billing and payment rules must be consistent across sections.",
    )
    project = await create_project(db_session, software.id, name="Conflict Project")
    sec_a = await create_section(
        db_session,
        project.id,
        title="Payment policy A",
        slug="payment-a",
        order=0,
        content=(
            "### Payment\n"
            "All customer payments MUST be processed exclusively by credit card. "
            "Invoice or wire transfer is forbidden for retail customers."
        ),
    )
    sec_b = await create_section(
        db_session,
        project.id,
        title="Payment policy B",
        slug="payment-b",
        order=1,
        content=(
            "### Payment\n"
            "Retail customers MUST pay by company invoice only. "
            "Credit card payments are not accepted for compliance reasons."
        ),
    )
    return {
        "project_id": project.id,
        "section_a_id": sec_a.id,
        "section_b_id": sec_b.id,
        "headers": studio_member["headers"],
    }
