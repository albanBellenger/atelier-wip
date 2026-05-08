"""Record token_usage rows after LLM calls.

Dashboard totals aggregate these rows. Embedding workloads call ``record_usage``
with ``call_source="embedding"`` when a usage scope is present.
"""

from __future__ import annotations

from decimal import Decimal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TokenUsage
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_pricing import estimate_cost_usd_openai

log = structlog.get_logger("atelier.token_tracker")


async def record_usage(
    session: AsyncSession,
    usage_scope: TokenUsageScope,
    *,
    call_source: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    provider: str = "openai",
    estimated_cost_override: Decimal | None = None,
) -> None:
    if estimated_cost_override is not None:
        est: Decimal | None = estimated_cost_override
    elif provider == "openai":
        est = estimate_cost_usd_openai(model, input_tokens, output_tokens)
    else:
        est = estimate_cost_usd_openai(model, input_tokens, output_tokens)

    row = TokenUsage(
        studio_id=usage_scope.studio_id,
        software_id=usage_scope.software_id,
        project_id=usage_scope.project_id,
        work_order_id=usage_scope.work_order_id,
        user_id=usage_scope.user_id,
        call_source=call_source[:32],
        model=model[:256],
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost_usd=est,
    )
    session.add(row)
    await session.flush()
    log.debug(
        "token_usage_recorded",
        call_source=call_source,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost_usd=str(est),
    )
