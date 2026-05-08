"""Unit tests for BuilderComposerService (prompt assembly + output validation)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import ApiError
from app.services.builder_composer_service import BuilderComposerService


def _user(*, display_name: str | None = "Alex Builder") -> MagicMock:
    u = MagicMock()
    u.id = uuid.uuid4()
    u.display_name = display_name
    return u


def _software() -> MagicMock:
    s = MagicMock()
    s.studio_id = uuid.uuid4()
    s.id = uuid.uuid4()
    s.name = "SpecKit"
    s.description = None
    return s


def _project() -> MagicMock:
    p = MagicMock()
    p.id = uuid.uuid4()
    p.name = "Auth rollout"
    return p


@pytest.mark.asyncio
async def test_hint_for_software_includes_local_hour_when_provided() -> None:
    captured: dict[str, str] = {}

    async def capture_hint(_self: object, _ctx: object, user_prompt: str) -> dict[str, str]:
        captured["user_prompt"] = user_prompt
        return {"headline": "Hi", "input_placeholder": "Ask"}

    with patch(
        "app.services.builder_composer_service.BuilderComposerAgent.hint_for_software",
        capture_hint,
    ):
        svc = BuilderComposerService(AsyncMock())
        await svc.hint_for_software(
            user=_user(),
            software=_software(),
            project=None,
            local_hour=14,
        )

    assert "local hour is 14" in captured["user_prompt"]


@pytest.mark.asyncio
async def test_hint_for_software_uses_utc_note_when_local_hour_none() -> None:
    captured: dict[str, str] = {}

    async def capture_hint(_self: object, _ctx: object, user_prompt: str) -> dict[str, str]:
        captured["user_prompt"] = user_prompt
        return {"headline": "Hi", "input_placeholder": "Ask"}

    with patch(
        "app.services.builder_composer_service.BuilderComposerAgent.hint_for_software",
        capture_hint,
    ):
        svc = BuilderComposerService(AsyncMock())
        await svc.hint_for_software(
            user=_user(),
            software=_software(),
            project=None,
            local_hour=None,
        )

    assert "No local hour supplied" in captured["user_prompt"]
    assert "UTC hour" in captured["user_prompt"]


@pytest.mark.asyncio
async def test_hint_for_software_uses_first_name_in_prompt() -> None:
    captured: dict[str, str] = {}

    async def capture_hint(_self: object, _ctx: object, user_prompt: str) -> dict[str, str]:
        captured["user_prompt"] = user_prompt
        return {"headline": "Hi", "input_placeholder": "Ask"}

    with patch(
        "app.services.builder_composer_service.BuilderComposerAgent.hint_for_software",
        capture_hint,
    ):
        svc = BuilderComposerService(AsyncMock())
        await svc.hint_for_software(
            user=_user(display_name="  Taylor Lee  "),
            software=_software(),
            project=_project(),
            local_hour=1,
        )

    assert "Taylor" in captured["user_prompt"]
    assert "Current focus project name: Auth rollout" in captured["user_prompt"]


@pytest.mark.asyncio
async def test_hint_for_software_greets_there_when_display_name_blank() -> None:
    captured: dict[str, str] = {}

    async def capture_hint(_self: object, _ctx: object, user_prompt: str) -> dict[str, str]:
        captured["user_prompt"] = user_prompt
        return {"headline": "Hi", "input_placeholder": "Ask"}

    with patch(
        "app.services.builder_composer_service.BuilderComposerAgent.hint_for_software",
        capture_hint,
    ):
        svc = BuilderComposerService(AsyncMock())
        await svc.hint_for_software(
            user=_user(display_name="   "),
            software=_software(),
            project=None,
            local_hour=2,
        )

    assert "there" in captured["user_prompt"]


@pytest.mark.asyncio
async def test_hint_for_software_raises_when_headline_invalid() -> None:
    with patch(
        "app.services.builder_composer_service.BuilderComposerAgent.hint_for_software",
        new_callable=AsyncMock,
        return_value={"headline": "   ", "input_placeholder": "ok"},
    ):
        svc = BuilderComposerService(AsyncMock())
        with pytest.raises(ApiError) as exc:
            await svc.hint_for_software(
                user=_user(),
                software=_software(),
                project=None,
                local_hour=3,
            )
    assert exc.value.error_code == "LLM_INVALID_OUTPUT"
    assert "headline" in (exc.value.detail or "").lower()


@pytest.mark.asyncio
async def test_hint_for_software_raises_when_placeholder_invalid() -> None:
    with patch(
        "app.services.builder_composer_service.BuilderComposerAgent.hint_for_software",
        new_callable=AsyncMock,
        return_value={"headline": "ok", "input_placeholder": ""},
    ):
        svc = BuilderComposerService(AsyncMock())
        with pytest.raises(ApiError) as exc:
            await svc.hint_for_software(
                user=_user(),
                software=_software(),
                project=None,
                local_hour=4,
            )
    assert exc.value.error_code == "LLM_INVALID_OUTPUT"
    assert "placeholder" in (exc.value.detail or "").lower()
