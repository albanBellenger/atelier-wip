"""Private thread post-stream findings normalisation."""

from app.services.private_thread_service import (
    ThreadFinding,
    _conflicts_from_findings,
    _findings_appendix,
    _normalize_thread_findings,
)


def test_normalize_thread_findings_filters_invalid() -> None:
    raw = {
        "findings": [
            {"finding_type": "conflict", "description": "  a  "},
            {"finding_type": "gap", "description": "b"},
            {"finding_type": "other", "description": "skip"},
            {"finding_type": "conflict", "description": ""},
            "not-a-dict",
        ]
    }
    out = _normalize_thread_findings(raw)
    assert out == [
        {"finding_type": "conflict", "description": "a"},
        {"finding_type": "gap", "description": "b"},
    ]


def test_findings_appendix_empty() -> None:
    assert _findings_appendix([]) == ""


def test_conflicts_from_findings() -> None:
    f = [
        ThreadFinding(finding_type="conflict", description="c1"),
        ThreadFinding(finding_type="gap", description="g1"),
    ]
    assert _conflicts_from_findings(f) == [{"description": "c1"}]


def test_findings_appendix_format() -> None:
    text = _findings_appendix(
        [
            ThreadFinding(finding_type="conflict", description="X"),
            ThreadFinding(finding_type="gap", description="Y"),
        ]
    )
    assert "**Conflicts and gaps**" in text
    assert "**Conflict:** X" in text
    assert "**Gap:** Y" in text
