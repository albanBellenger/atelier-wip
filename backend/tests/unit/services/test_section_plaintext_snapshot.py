"""Section plaintext helpers and legacy Yjs snapshot decode."""

import uuid
from datetime import datetime, timezone

import pytest
from pycrdt import Doc, Text

from app.services.section_service import (
    SECTION_YJS_TEXT_FIELD,
    SectionService,
    effective_section_plaintext,
    snapshot_from_yjs_update_bytes,
    yjs_update_from_plaintext,
)


def test_snapshot_from_yjs_roundtrip() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("hello from yjs")
    blob = doc.get_update()
    assert snapshot_from_yjs_update_bytes(blob) == "hello from yjs"


def test_yjs_update_from_plaintext_returns_none() -> None:
    assert yjs_update_from_plaintext("seed\nline") is None
    assert yjs_update_from_plaintext("") is None


def test_effective_plaintext_normalizes_none_string() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("body")
    blob = doc.get_update()
    assert effective_section_plaintext("None", blob) == ""


def test_effective_plaintext_blank_content_ignores_yjs() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("only-yjs")
    blob = doc.get_update()
    assert effective_section_plaintext("", blob) == ""
    assert effective_section_plaintext("   ", blob) == "   "


def test_effective_plaintext_keeps_non_empty_db_content() -> None:
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("yjs")
    blob = doc.get_update()
    assert effective_section_plaintext("stored", blob) == "stored"


def test_effective_plaintext_invalid_yjs_ignored() -> None:
    assert effective_section_plaintext("ok", b"not-a-valid-update") == "ok"
    assert effective_section_plaintext("", b"garbage") == ""


def test_section_service_to_response_uses_effective_plaintext() -> None:
    svc = SectionService(db=None)  # type: ignore[arg-type]
    doc = Doc()
    doc[SECTION_YJS_TEXT_FIELD] = Text("x")
    blob = doc.get_update()
    now = datetime.now(tz=timezone.utc)
    sid = uuid.uuid4()
    pid = uuid.uuid4()

    class FakeSec:
        id = sid
        project_id = pid
        software_id = None
        title = "t"
        slug = "s"
        order = 0
        content = "from-db"
        yjs_state = blob
        created_at = now
        updated_at = now

    r = svc._to_response(FakeSec(), status="ready")  # noqa: SLF001
    assert r.content == "from-db"
