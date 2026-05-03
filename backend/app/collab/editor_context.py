"""Per-connection editor identity for Yjs persister (set from authenticated WS)."""

from __future__ import annotations

import contextvars
import uuid

collab_acting_user_id: contextvars.ContextVar[uuid.UUID | None] = contextvars.ContextVar(
    "collab_acting_user_id", default=None
)
