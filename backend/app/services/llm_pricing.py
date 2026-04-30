"""Static per-1M-token pricing for estimated_cost_usd (MVP; Tool Admin table later)."""

from __future__ import annotations

from decimal import Decimal


def _norm_model(model: str) -> str:
    return (model or "").strip().lower()


# USD per 1M input / output tokens (approximate; override via partial key match).
_OPENAI_INPUT_PER_M: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
    "gpt-4o": (Decimal("2.50"), Decimal("10.00")),
    "gpt-4-turbo": (Decimal("10.00"), Decimal("30.00")),
    "gpt-3.5-turbo": (Decimal("0.50"), Decimal("1.50")),
    "o1-mini": (Decimal("3.00"), Decimal("12.00")),
    "o1": (Decimal("15.00"), Decimal("60.00")),
}

_DEFAULT = (Decimal("1.00"), Decimal("4.00"))


def estimate_cost_usd_openai(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """Rough USD estimate from token counts."""
    m = _norm_model(model)
    inp_rate, out_rate = _DEFAULT
    for prefix, rates in _OPENAI_INPUT_PER_M.items():
        if m.startswith(prefix) or prefix in m:
            inp_rate, out_rate = rates
            break
    inp = (Decimal(input_tokens) / Decimal("1000000")) * inp_rate
    out = (Decimal(output_tokens) / Decimal("1000000")) * out_rate
    return (inp + out).quantize(Decimal("0.000001"))
