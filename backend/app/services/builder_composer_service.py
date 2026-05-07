"""LLM-generated copy for the builder home composer."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.builder_composer_agent import BuilderComposerAgent
from app.exceptions import ApiError
from app.models import Project, Software, User
from app.schemas.builder_composer import BuilderComposerHintResponse
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService


class BuilderComposerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def hint_for_software(
        self,
        *,
        user: User,
        software: Software,
        project: Project | None,
        local_hour: int | None,
    ) -> BuilderComposerHintResponse:
        if local_hour is not None:
            hour_note = f"The user's local hour is {local_hour} (24h clock)."
        else:
            hour_utc = datetime.now(tz=UTC).hour
            hour_note = f"No local hour supplied; use UTC hour {hour_utc} for time-of-day tone."

        first = (user.display_name or "").strip().split()
        greet_name = first[0] if first else "there"

        proj_line = (
            f"Current focus project name: {project.name}\n"
            if project is not None
            else "No specific project selected.\n"
        )
        sw_desc = (software.description or "").strip() or "(none)"
        user_prompt = (
            f"User display name (use first name only in copy): {greet_name}\n"
            f"{hour_note}\n"
            f"Software product name: {software.name}\n"
            f"Software short description: {sw_desc}\n"
            f"{proj_line}\n"
            "Produce friendly, concise builder-home copy. "
            "headline: one line (no trailing period preferred) acknowledging time/context. "
            "input_placeholder: a single question or invitation to type in the composer "
            "(like a chat placeholder), not repeating the headline verbatim."
        )
        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project.id if project else None,
            user_id=user.id,
        )
        llm = LLMService(self.db)
        parsed = await BuilderComposerAgent(self.db, llm).hint_for_software(
            ctx, user_prompt
        )
        headline_raw = parsed.get("headline")
        placeholder_raw = parsed.get("input_placeholder")
        if not isinstance(headline_raw, str) or not headline_raw.strip():
            raise ApiError(
                status_code=502,
                code="LLM_INVALID_OUTPUT",
                message="Model returned an invalid headline.",
            )
        if not isinstance(placeholder_raw, str) or not placeholder_raw.strip():
            raise ApiError(
                status_code=502,
                code="LLM_INVALID_OUTPUT",
                message="Model returned an invalid placeholder.",
            )
        headline = headline_raw.strip()[:500]
        input_placeholder = placeholder_raw.strip()[:500]
        return BuilderComposerHintResponse(
            headline=headline,
            input_placeholder=input_placeholder,
        )
