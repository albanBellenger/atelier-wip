"""Attribution scope for LLM/embedding calls (budgets, routing, token_usage rows).

This is not prompt or conversation context — it carries studio/software/project/work_order/user
IDs so usage can be recorded and policies applied.
"""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class TokenUsageScope:
    studio_id: UUID
    software_id: UUID | None = None
    project_id: UUID | None = None
    work_order_id: UUID | None = None
    user_id: UUID | None = None
