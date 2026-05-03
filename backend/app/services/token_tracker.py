"""Record token_usage rows after LLM calls.

Dashboard totals aggregate these rows. Embedding workloads (EmbeddingService /
embedding_pipeline) currently do not call ``record_usage``; embedding spend may be
absent from reports until wired similarly.
"""

from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TokenUsage
from app.schemas.token_context import TokenContext
from app.services.llm_pricing import estimate_cost_usd_openai

log = structlog.get_logger("atelier.token_tracker")


async def record_usage(
    session: AsyncSession,
    ctx: TokenContext,
    *,
    call_type: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    provider: str = "openai",
) -> None:
    if provider == "openai":
        est = estimate_cost_usd_openai(model, input_tokens, output_tokens)
    else:
        est = estimate_cost_usd_openai(model, input_tokens, output_tokens)

    row = TokenUsage(
        studio_id=ctx.studio_id,
        software_id=ctx.software_id,
        project_id=ctx.project_id,
        work_order_id=ctx.work_order_id,
        user_id=ctx.user_id,
        call_type=call_type[:32],
        model=model[:256],
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost_usd=est,
    )
    session.add(row)
    await session.flush()
    log.debug(
        "token_usage_recorded",
        call_type=call_type,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost_usd=str(est),
    )
