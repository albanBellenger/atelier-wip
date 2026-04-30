"""Unit tests for llm_pricing and password verification edge cases."""

from decimal import Decimal

import pytest

from app.security import passwords as pw
from app.services.llm_pricing import estimate_cost_usd_openai


def test_estimate_cost_default_model() -> None:
    c = estimate_cost_usd_openai("unknown-model-xyz", 1_000_000, 500_000)
    assert c > Decimal("0")


def test_estimate_cost_matches_prefix() -> None:
    c = estimate_cost_usd_openai("gpt-4o-mini-2024", 2_000_000, 0)
    assert c == Decimal("0.30")


def test_hash_password_over_limit_raises() -> None:
    long_pw = "a" * (pw.BCRYPT_MAX_PASSWORD_BYTES + 1)
    with pytest.raises(ValueError, match="bcrypt"):
        pw.hash_password(long_pw)


def test_verify_password_rejects_overlong_plain() -> None:
    long_pw = "x" * (pw.BCRYPT_MAX_PASSWORD_BYTES + 1)
    assert pw.verify_password(long_pw, "unused") is False


def test_verify_password_invalid_hash_returns_false() -> None:
    assert pw.verify_password("secret", "not-valid-hash") is False
